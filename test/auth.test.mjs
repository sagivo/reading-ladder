// Auth helper unit tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
// Tests only the pure helpers in functions/api/auth/_auth.js — nothing here
// touches D1 or the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  timingSafeEqual,
  newSessionToken,
  sha256Hex,
  sessionCookie,
  clearSessionCookie,
  getSessionToken,
  rateLimitDecision,
  readJsonCapped,
  COOKIE_NAME,
  SESSION_MAX_AGE,
  MAX_BODY_BYTES,
} from '../functions/api/auth/_auth.js';

// --- email -----------------------------------------------------------------

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Foo.Bar@Example.COM '), 'foo.bar@example.com');
  assert.equal(normalizeEmail('a@b.co'), 'a@b.co');
});

test('normalizeEmail returns null for non-strings', () => {
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(normalizeEmail(42), null);
  assert.equal(normalizeEmail({}), null);
});

test('isValidEmail accepts reasonable addresses', () => {
  for (const e of ['a@b.co', 'user+tag@sub.example.org', 'x.y_z-1@domain.io']) {
    assert.equal(isValidEmail(e), true, e);
  }
});

test('isValidEmail rejects bad input', () => {
  for (const e of ['', 'nope', 'a@b', '@x.com', 'a@.com', 'a b@c.com', 'a@@b.com', null, 42]) {
    assert.equal(isValidEmail(e), false, String(e));
  }
  assert.equal(isValidEmail(`${'a'.repeat(250)}@b.co`), false); // > 254 chars
});

// --- password rules ----------------------------------------------------------

test('validatePassword enforces 8–128 chars', () => {
  assert.deepEqual(validatePassword('1234567'), { ok: false, error: 'password must be at least 8 characters' });
  assert.equal(validatePassword('12345678').ok, true);
  assert.equal(validatePassword('x'.repeat(128)).ok, true);
  assert.deepEqual(validatePassword('x'.repeat(129)), { ok: false, error: 'password must be at most 128 characters' });
  assert.equal(validatePassword(null).ok, false);
  assert.equal(validatePassword(12345678).ok, false);
});

// --- PBKDF2 ------------------------------------------------------------------

test('hashPassword format and verifyPassword roundtrip', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^pbkdf2\$100000\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('hashPassword salts uniquely', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('same-password', b), true);
});

test('verifyPassword rejects malformed stored hashes', async () => {
  assert.equal(await verifyPassword('pw', 'not-a-hash'), false);
  assert.equal(await verifyPassword('pw', 'pbkdf2$100000$onlytwoparts'), false);
  assert.equal(await verifyPassword('pw', 'pbkdf2$0$AAAAAAAAAAAAAAAAAAAAAA$BBBB'), false);
  assert.equal(await verifyPassword('pw', 'argon2$100000$AAAAAAAAAAAAAAAAAAAAAA$BBBB'), false);
  assert.equal(await verifyPassword('pw', null), false);
  assert.equal(await verifyPassword(null, await hashPassword('pw')), false);
});

// --- constant-time compare ---------------------------------------------------

test('timingSafeEqual compares in constant time', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
});

// --- tokens ------------------------------------------------------------------

test('newSessionToken is 43-char base64url and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const t = newSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]{43}$/, t);
    assert.ok(!seen.has(t), 'duplicate token');
    seen.add(t);
  }
});

test('sha256Hex matches the known SHA-256 of "abc"', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

// --- cookies -----------------------------------------------------------------

const httpsReq = { url: 'https://reading.example/', headers: new Headers() };
const httpReq = { url: 'http://localhost:8788/', headers: new Headers() };

test('sessionCookie sets secure attributes on https', () => {
  const c = sessionCookie('TOKEN123', httpsReq);
  assert.ok(c.startsWith(`${COOKIE_NAME}=TOKEN123;`), c);
  for (const attr of ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MAX_AGE}`, 'Secure']) {
    assert.ok(c.includes(attr), `${attr} missing in ${c}`);
  }
});

test('sessionCookie omits Secure on plain http', () => {
  const c = sessionCookie('TOKEN123', httpReq);
  assert.ok(!c.includes('Secure'), c);
  assert.ok(c.includes('HttpOnly'), c);
});

test('clearSessionCookie expires immediately', () => {
  const c = clearSessionCookie(httpsReq);
  assert.ok(c.includes('Max-Age=0'), c);
  assert.ok(c.startsWith(`${COOKIE_NAME}=;`), c);
});

test('getSessionToken parses the Cookie header', () => {
  const req = { url: 'https://x/', headers: new Headers({ Cookie: 'other=1; rl_session=TOKEN_X; third=3' }) };
  assert.equal(getSessionToken(req), 'TOKEN_X');
  assert.equal(getSessionToken(httpsReq), null);
  const empty = { url: 'https://x/', headers: new Headers({ Cookie: 'rl_session=;' }) };
  assert.equal(getSessionToken(empty), null);
});

// --- rate-limit window math (pure) -------------------------------------------

test('rateLimitDecision allows on empty/expired window', () => {
  const now = Date.now();
  assert.equal(rateLimitDecision(null, 10, 600, now).allowed, true);
  const old = { count: 10, window_start: new Date(now - 601_000).toISOString() };
  const d = rateLimitDecision(old, 10, 600, now);
  assert.equal(d.allowed, true);
  assert.equal(d.reset, true);
  assert.equal(d.remaining, 9);
});

test('rateLimitDecision counts within a live window', () => {
  const now = Date.now();
  const row = { count: 3, window_start: new Date(now - 60_000).toISOString() };
  const d = rateLimitDecision(row, 10, 600, now);
  assert.equal(d.allowed, true);
  assert.equal(d.reset, false);
  assert.equal(d.remaining, 6);
});

test('rateLimitDecision denies at the limit with Retry-After', () => {
  const now = Date.now();
  // window started 100s ago, 600s window -> 500s left
  const row = { count: 10, window_start: new Date(now - 100_000).toISOString() };
  const d = rateLimitDecision(row, 10, 600, now);
  assert.equal(d.allowed, false);
  assert.equal(d.remaining, 0);
  assert.equal(d.retryAfterSec, 500);
  assert.equal(d.reset, false);
});

test('rateLimitDecision retryAfterSec is at least 1 at the boundary', () => {
  const now = Date.now();
  const row = { count: 5, window_start: new Date(now - 599_999).toISOString() };
  const d = rateLimitDecision(row, 5, 600, now);
  assert.equal(d.allowed, false);
  assert.ok(d.retryAfterSec >= 1);
});

// --- body cap ----------------------------------------------------------------

test('readJsonCapped parses normal JSON bodies', async () => {
  const req = new Request('https://x/', { method: 'POST', body: JSON.stringify({ a: 1 }) });
  const { ok, body } = await readJsonCapped(req);
  assert.equal(ok, true);
  assert.deepEqual(body, { a: 1 });
});

test('readJsonCapped rejects oversized and invalid bodies', async () => {
  const big = new Request('https://x/', { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1) });
  const r1 = await readJsonCapped(big);
  assert.equal(r1.ok, false);

  const bad = new Request('https://x/', { method: 'POST', body: '{not json' });
  const r2 = await readJsonCapped(bad);
  assert.equal(r2.ok, false);
});

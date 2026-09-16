// Auth helpers for The Reading Ladder Pages Functions.
//
// The pure helpers in this module (email/password validation, PBKDF2,
// constant-time compare, token generation, rate-limit window math, cookie
// building) have no Cloudflare dependencies and are importable under plain
// Node 20+ for unit tests. Only the session helpers touch D1 (via `db(env)`).
//
// WebCrypto only — no npm dependencies.

import { db } from '../_lib.js';

// ---------------------------------------------------------------------------
// Constants

export const COOKIE_NAME = 'rl_session';
export const SESSION_MAX_AGE = 30 * 24 * 3600; // 30 days, seconds
export const SESSION_TTL_MS = SESSION_MAX_AGE * 1000;
export const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 3600 * 1000; // refresh when < 15 days left

export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_BYTES = 16;
export const PBKDF2_HASH_BYTES = 32; // SHA-256 output

export const MAX_BODY_BYTES = 256 * 1024;

// ---------------------------------------------------------------------------
// Email

export function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length === 0 || e.length > 254) return false;
  return EMAIL_RE.test(e);
}

// ---------------------------------------------------------------------------
// Password rules: 8–128 characters.

export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, error: 'password must be a string' };
  if (password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  if (password.length > 128) return { ok: false, error: 'password must be at most 128 characters' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// base64 helpers (btoa/atob exist in both Workers and Node)

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str); // throws on invalid input
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Constant-time comparison (crypto.timingSafeEqual is Node-only; Workers need this).

export function timingSafeEqual(a, b) {
  const ab = typeof a === 'string' ? new TextEncoder().encode(a) : a;
  const bb = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password hashing: PBKDF2-SHA256, 100k iterations, 16-byte salt.
// Stored format: pbkdf2$100000$<base64 salt>$<base64 hash>

async function deriveKey(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > 1000000) return false;
    const salt = b64decode(parts[2]);
    const expected = b64decode(parts[3]);
    if (salt.length !== PBKDF2_SALT_BYTES || expected.length !== PBKDF2_HASH_BYTES) return false;
    const actual = await deriveKey(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session tokens: 32 random bytes, base64url (43 chars, no padding).
// The raw token goes in the cookie; only its SHA-256 hex is stored in D1.

export function newSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Cookies

function cookieAttrs(request) {
  let attrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
  try {
    if (new URL(request.url).protocol === 'https:') attrs += '; Secure';
  } catch {
    // unknown URL — omit Secure rather than guess
  }
  return attrs;
}

export function sessionCookie(token, request) {
  return `${COOKIE_NAME}=${token}; ${cookieAttrs(request)}`;
}

export function clearSessionCookie(request) {
  return `${COOKIE_NAME}=; ${cookieAttrs(request).replace(`Max-Age=${SESSION_MAX_AGE}`, 'Max-Age=0')}`;
}

export function getSessionToken(request) {
  const header = request.headers.get('Cookie') || request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      return value || null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, backed by the rate_limits table).
// rateLimitDecision is pure so the window math is unit-testable.

export function rateLimitDecision(row, limit, windowSeconds, nowMs) {
  const windowMs = windowSeconds * 1000;
  const expired = !row || new Date(row.window_start).getTime() + windowMs <= nowMs;
  if (expired) {
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0, reset: true };
  }
  const count = Number(row.count) || 0;
  if (count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((new Date(row.window_start).getTime() + windowMs - nowMs) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSec, reset: false };
  }
  return { allowed: true, remaining: limit - count - 1, retryAfterSec: 0, reset: false };
}

export async function checkRateLimit(d, key, limit, windowSeconds, nowMs = Date.now()) {
  const row = await d
    .prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
    .bind(key)
    .first();
  const decision = rateLimitDecision(row, limit, windowSeconds, nowMs);
  const windowStart = new Date(nowMs).toISOString();
  if (decision.reset) {
    await d
      .prepare(
        `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`
      )
      .bind(key, windowStart)
      .run();
  } else if (decision.allowed) {
    await d.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  }
  return decision;
}

// ---------------------------------------------------------------------------
// Request helpers

export function clientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

export async function readJsonCapped(request, maxBytes = MAX_BODY_BYTES) {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return { ok: false, error: 'request body too large' };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
}

// ---------------------------------------------------------------------------
// Sessions (D1-backed)

export async function issueSession(d, parentId, nowMs = Date.now()) {
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_MS).toISOString();
  // Lazily purge expired sessions whenever we issue a new one.
  await d.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(createdAt).run();
  await d
    .prepare('INSERT INTO sessions (token_hash, parent_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, parentId, createdAt, expiresAt)
    .run();
  return { token, tokenHash, expiresAt };
}

export async function revokeSession(d, tokenHash) {
  await d.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

// Returns { session, parent } or null. Lazily deletes expired sessions.
export async function getSession(request, env, nowMs = Date.now()) {
  const d = db(env);
  const token = getSessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date(nowMs).toISOString();
  await d.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  const row = await d
    .prepare(
      `SELECT s.token_hash, s.parent_id, s.created_at AS s_created, s.expires_at,
              p.id AS p_id, p.email AS p_email, p.created_at AS p_created
       FROM sessions s JOIN parents p ON p.id = s.parent_id
       WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= nowMs) {
    await revokeSession(d, tokenHash);
    return null;
  }
  return {
    session: {
      tokenHash: row.token_hash,
      parentId: row.parent_id,
      createdAt: row.s_created,
      expiresAt: row.expires_at,
    },
    parent: { id: row.p_id, email: row.p_email, created_at: row.p_created },
  };
}

// Parent row or null (convenience wrapper over getSession).
export async function getParent(request, env, nowMs = Date.now()) {
  const s = await getSession(request, env, nowMs);
  return s ? s.parent : null;
}

// Sliding expiry: extend expires_at when less than 15 days remain.
export async function refreshSession(d, session, nowMs = Date.now()) {
  if (new Date(session.expiresAt).getTime() - nowMs > SESSION_REFRESH_THRESHOLD_MS) return false;
  const expiresAt = new Date(nowMs + SESSION_TTL_MS).toISOString();
  await d.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(expiresAt, session.tokenHash).run();
  return true;
}

// Adopt-flow regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the production bug where "Add to my account" silently did nothing:
// the server skipped profiles owned by another parent and returned
// adopted: [], the client closed the dialog anyway, and the import prompt
// nagged on every launch with the sync queue stuck forever.
//
// Two layers:
//  1. Server route (functions/api/auth/adopt.js) with a mock D1:
//     unclaimed profiles are adopted (parent_id set); profiles owned by
//     another parent are SKIPPED and REPORTED with a reason — never
//     silently dropped; unauthenticated calls are 401.
//  2. Client result application (applyAdoptResult in src/lib/store.js):
//     adopted ids are marked claimed; skipped ids are flagged claimBlocked
//     with the server's reason; an empty adopted list is distinguishable
//     from success so the UI can show an honest error instead of closing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- in-memory localStorage BEFORE importing the app modules ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => void mem.clear(),
};

const { onRequestPost } = await import('../functions/api/auth/adopt.js');
const { applyAdoptResult, clearClaimBlocked, loadStore, saveStore, newProfile } = await import('../src/lib/store.js');

// ---------------------------------------------------------------- server
// Mock D1: profiles is a Map id -> { id, parent_id }; upserts write parent_id.
function mockDb({ sessionParentId = 'par-caller', profiles = new Map() } = {}) {
  return {
    profiles,
    prepare(sql) {
      const q = sql.trim().replace(/\s+/g, ' ');
      return {
        bind(...args) {
          return {
            first: async () => {
              if (q.includes('FROM sessions s JOIN parents p')) {
                if (!sessionParentId) return null;
                return {
                  token_hash: 'h', parent_id: sessionParentId, s_created: 't',
                  expires_at: '2999-01-01T00:00:00.000Z',
                  p_id: sessionParentId, p_email: 'p@x.com', p_created: 't',
                };
              }
              if (q.startsWith('SELECT id, parent_id FROM profiles WHERE id = ?')) {
                return profiles.get(args[0]) || null;
              }
              return null;
            },
            run: async () => {
              if (q.startsWith('DELETE')) return {};
              if (q.includes('INSERT INTO profiles')) {
                // profileParams(row) order: PROFILE_COLS then parent_id last.
                const id = args[0];
                const parentId = args[args.length - 1];
                profiles.set(id, { id, parent_id: parentId });
                return {};
              }
              return {};
            },
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
}

function adoptReq(profiles) {
  return new Request('https://x/api/auth/adopt', {
    method: 'POST',
    headers: { Cookie: 'rl_session=tok', 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles }),
  });
}

const toServerShape = (id, name) => ({
  id, name, avatar: '🦊', track: null, placement_json: null, level: 0,
  mastery_json: '{}', misses_json: '[]', companion_json: '{}', sessions_json: '[]',
  exposure: 0, last_mission: null, birth_year: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});

test('server: unclaimed profiles are adopted and parent_id is set', async () => {
  const db = mockDb();
  const res = await onRequestPost({
    request: adoptReq([toServerShape('k1', 'Kid1'), toServerShape('k2', 'Kid2')]),
    env: { DB: db },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.adopted, ['k1', 'k2']);
  assert.deepEqual(body.skipped, []);
  assert.equal(db.profiles.get('k1').parent_id, 'par-caller');
  assert.equal(db.profiles.get('k2').parent_id, 'par-caller');
});

test('server: profiles owned by another parent are skipped AND reported, never touched', async () => {
  const profiles = new Map([['k9', { id: 'k9', parent_id: 'par-other' }]]);
  const db = mockDb({ profiles });
  const res = await onRequestPost({
    request: adoptReq([toServerShape('k9', 'Kid9'), toServerShape('k1', 'Kid1')]),
    env: { DB: db },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.adopted, ['k1']);
  assert.equal(body.skipped.length, 1);
  assert.equal(body.skipped[0].id, 'k9');
  assert.equal(body.skipped[0].reason, 'owned_by_another_account');
  assert.equal(db.profiles.get('k9').parent_id, 'par-other'); // untouched
});

test('server: re-adopting own profiles is idempotent', async () => {
  const profiles = new Map([['k1', { id: 'k1', parent_id: 'par-caller' }]]);
  const db = mockDb({ profiles });
  const res = await onRequestPost({
    request: adoptReq([toServerShape('k1', 'Kid1')]),
    env: { DB: db },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.adopted, ['k1']);
  assert.deepEqual(body.skipped, []);
});

test('server: unauthenticated adopt is 401', async () => {
  const db = mockDb({ sessionParentId: null });
  const res = await onRequestPost({
    request: adoptReq([toServerShape('k1', 'Kid1')]),
    env: { DB: db },
  });
  assert.equal(res.status, 401);
});

test('server: missing profiles array is 400', async () => {
  const db = mockDb();
  const res = await onRequestPost({
    request: new Request('https://x/api/auth/adopt', {
      method: 'POST',
      headers: { Cookie: 'rl_session=tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    env: { DB: db },
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------- client
function seedStore() {
  mem.clear();
  const store = loadStore();
  for (const [id, name] of [['k1', 'Kid1'], ['k9', 'Kid9']]) {
    const p = newProfile(name, '🦊');
    p.id = id;
    store.profiles[id] = p;
  }
  saveStore(store);
  return store;
}

test('client: adopted ids are marked claimed; skipped ids are flagged claimBlocked', () => {
  const store = seedStore();
  const out = applyAdoptResult(store, {
    adopted: ['k1'],
    skipped: [{ id: 'k9', name: 'Kid9', reason: 'owned_by_another_account' }],
  });
  assert.deepEqual(out.claimed, ['k1']);
  assert.equal(out.blocked.length, 1);
  assert.equal(out.blocked[0].reason, 'owned_by_another_account');
  assert.equal(store.profiles.k1.claimed, true);
  assert.equal(store.profiles.k1.serverPending, false);
  assert.equal(store.profiles.k9.claimed, false);
  assert.equal(store.profiles.k9.claimBlocked, 'owned_by_another_account');
});

test('client: empty adopted list is distinguishable from success', () => {
  const store = seedStore();
  const out = applyAdoptResult(store, {
    adopted: [],
    skipped: [{ id: 'k9', name: 'Kid9', reason: 'owned_by_another_account' }],
  });
  assert.deepEqual(out.claimed, []);
  assert.equal(out.blocked.length, 1);
  assert.equal(store.profiles.k1.claimed, false);
  assert.equal(store.profiles.k9.claimBlocked, 'owned_by_another_account');
});

test('client: clearClaimBlocked re-enables a retry', () => {
  const store = seedStore();
  applyAdoptResult(store, {
    adopted: [],
    skipped: [{ id: 'k9', name: 'Kid9', reason: 'owned_by_another_account' }],
  });
  clearClaimBlocked(store, ['k9']);
  assert.equal(store.profiles.k9.claimBlocked, undefined);
});

// ---- claim dialog honesty (structural): never silently close on blocked ----
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('claim dialog: blocked adopt keeps the dialog open with an honest error', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '../src/components/Claim.jsx'), 'utf8');
  // The error branch must come BEFORE onDone() and return without closing.
  const blockedIdx = src.indexOf('outcome.blocked.length > 0');
  assert.ok(blockedIdx > 0, 'blocked branch exists');
  const returnIdx = src.indexOf('return;', blockedIdx);
  assert.ok(returnIdx > blockedIdx, 'blocked branch returns without closing');
  const segment = src.slice(blockedIdx, returnIdx);
  assert.match(segment, /setError\(/);
  assert.match(segment, /different account/);
  assert.ok(!segment.includes('onDone()'), 'no silent close on the blocked path');
});

test('claim candidates exclude blocked profiles (no every-login nag)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '../src/App.jsx'), 'utf8');
  assert.match(src, /!p\.claimBlocked/);
});

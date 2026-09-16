// Client-side sync drain regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the production bug where "Sync now" NEVER visibly drained:
// syncNow() mutated localStorage directly (ackEvents + saveStore) while the
// React `store` state kept the old queue, and nothing re-rendered on state
// transitions — so the dashboard sat on "N changes waiting to sync" forever
// after a successful server drain, with no spinner ever painting.
//
// These tests exercise the REAL client sync code path (src/lib/sync.js) in a
// DOM-less harness with stubbed localStorage + fetch:
//  1. onSyncState emits 'syncing' and a terminal state for every run.
//  2. A claimed profile's queue drains to zero through the full
//     enqueue -> adopt -> syncNow(true) path, ending in 'idle' / 0 pending.
//  3. A fetch failure surfaces a terminal 'server_error' with a message —
//     never a stuck 'syncing', never silent.
//  4. Pre-claim events for an adopted reader are NOT skipped after adopt.

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

// ---- stub fetch: the events endpoint acks everything it receives ----
const posted = [];
let fetchImpl = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  posted.push({ url, method: opts && opts.method, events: body.events || [] });
  return {
    ok: true,
    status: 200,
    json: async () => ({ acked: (body.events || []).map((e) => e.id), failed: [] }),
  };
};
globalThis.fetch = (url, opts) => fetchImpl(url, opts);

const { syncNow, getSyncState, onSyncState } = await import('../src/lib/sync.js');
const { loadStore, saveStore, newProfile, queueEvent, applyAdoptResult } = await import(
  '../src/lib/store.js'
);

function freshClaimedStore(nEvents = 3) {
  mem.clear();
  posted.length = 0;
  const store = loadStore();
  const p = newProfile('TestKid', '🦊');
  p.claimed = true;
  store.profiles[p.id] = p;
  store.parentId = 'par1';
  for (let i = 0; i < nEvents; i++) queueEvent(store, p.id, 'lesson_completed', { n: i });
  saveStore(store);
  return p.id;
}

test('onSyncState emits syncing then a terminal state for a manual run', async () => {
  freshClaimedStore(2);
  const seen = [];
  const off = onSyncState((s) => seen.push(s.state));
  const res = await syncNow(true);
  off();
  assert.equal(res.ok, true);
  assert.ok(seen.includes('syncing'), `expected a 'syncing' emission, saw: ${seen.join(',')}`);
  const last = seen[seen.length - 1];
  assert.ok(last !== 'syncing', `last state must be terminal, saw: ${seen.join(',')}`);
  assert.equal(getSyncState().state, 'idle');
});

test('claimed profile queue drains to zero: enqueue -> adopt -> syncNow', async () => {
  mem.clear();
  posted.length = 0;
  // Start unclaimed (pre-account device reader), queue events, then adopt.
  const store = loadStore();
  const p = newProfile('TestKid', '🦊');
  store.profiles[p.id] = p;
  queueEvent(store, p.id, 'lesson_completed', { n: 1 });
  queueEvent(store, p.id, 'lesson_completed', { n: 2 });
  saveStore(store);
  // Adopt marks the profile claimed in the same store sync reads.
  const s2 = loadStore();
  applyAdoptResult(s2, { adopted: [p.id], skipped: [] });
  saveStore(s2);

  const res = await syncNow(true);
  assert.equal(res.ok, true);
  assert.equal(res.synced, 2);
  const after = loadStore();
  assert.equal(after.queue.length, 0, 'queue must drain after adopt + sync');
  assert.equal(getSyncState().state, 'idle');
  assert.equal(getSyncState().pending, 0);
  assert.ok(
    posted.some((r) => r.url === `/api/profiles/${p.id}/events` && r.events.length === 2),
    'events endpoint must have received both events'
  );
});

test('fetch failure surfaces terminal server_error, never stuck syncing', async () => {
  freshClaimedStore(2);
  fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'db exploded' }),
  });
  const seen = [];
  const off = onSyncState((s) => seen.push(s.state));
  try {
    await syncNow(true);
  } finally {
    off();
    fetchImpl = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      posted.push({ url, method: opts && opts.method, events: body.events || [] });
      return {
        ok: true,
        status: 200,
        json: async () => ({ acked: (body.events || []).map((e) => e.id), failed: [] }),
      };
    };
  }
  const st = getSyncState();
  assert.ok(seen.includes('syncing'), 'spinner state must be emitted even on failure');
  assert.notEqual(st.state, 'syncing', 'must never stick on syncing');
  assert.equal(st.state, 'server_error');
  assert.ok(st.error && st.error.length > 0, 'an honest error must be surfaced');
  assert.ok(st.lastAttemptAt, 'failed runs must record lastAttemptAt for diagnostics');
});

test('unclaimed events stay queued with honest unclaimed state, not silent idle', async () => {
  mem.clear();
  const store = loadStore();
  const p = newProfile('TestKid', '🦊'); // claimed=false
  store.profiles[p.id] = p;
  queueEvent(store, p.id, 'lesson_completed', { n: 1 });
  saveStore(store);
  const res = await syncNow(true);
  assert.equal(res.unclaimedPending, 1);
  assert.equal(getSyncState().state, 'unclaimed');
  assert.equal(loadStore().queue.length, 1, 'unclaimed events stay on device');
});

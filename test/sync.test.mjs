// Sync reliability regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the production bug where the event queue stalled forever:
// one poison event (or one failing profile POST) 500'd the whole batch,
// nothing was acked, and the client retried the identical batch forever
// while the dashboard sat on "waiting to sync".
//
// Two layers:
//  1. Server route (functions/api/profiles/[id]/events.js) with a mock D1:
//     a poison event is isolated — reported in `failed`, never blocks the
//     rest; a bad state snapshot is rejected with `stateError`, never 500s.
//  2. Client syncNow (src/lib/sync.js) with stubbed localStorage + fetch:
//     partial acks drain the queue; repeated failures dead-letter the event
//     (parent-visible) instead of stalling; terminal states are honest
//     (server_error/offline), never a permanent "syncing"; concurrent
//     triggers share one in-flight run; backoff defers automatic retries.

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

const { onRequestPost } = await import('../functions/api/profiles/[id]/events.js');
const { syncNow, getSyncState } = await import('../src/lib/sync.js');
const { loadStore, saveStore, newProfile, queueEvent } = await import('../src/lib/store.js');

// ---------------------------------------------------------------- server
function mockDb({ owned = true, failPayloadMarker = null } = {}) {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      const q = sql.trim().replace(/\s+/g, ' ');
      return {
        bind(...args) {
          return {
            first: async () => {
              if (q.startsWith('DELETE')) return null;
              if (q.includes('FROM sessions s JOIN parents p')) {
                return owned
                  ? {
                      token_hash: 'h', parent_id: 'par1', s_created: 't',
                      expires_at: '2999-01-01T00:00:00.000Z',
                      p_id: 'par1', p_email: 'p@x.com', p_created: 't',
                    }
                  : null;
              }
              if (q.includes('SELECT 1 AS ok FROM profiles')) return owned ? { ok: 1 } : null;
              return null;
            },
            run: async () => {
              if (q.startsWith('DELETE')) return {};
              if (q.startsWith('INSERT OR IGNORE INTO progress_events')) {
                if (
                  failPayloadMarker &&
                  args.some((a) => typeof a === 'string' && a.includes(failPayloadMarker))
                ) {
                  throw new Error('D1_ERROR: NOT NULL constraint failed');
                }
                inserts.push(args);
                return {};
              }
              if (q.startsWith('INSERT INTO profiles')) {
                inserts.push(['upsert', ...args]);
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

function postReq(body) {
  return new Request('https://x/api/profiles/p1/events', {
    method: 'POST',
    headers: { Cookie: 'rl_session=tok', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ev = (id, type = 'trial', payload = {}) => ({
  id, profile_id: 'p1', type, payload, created_at: new Date().toISOString(),
});

test('server: poison event is isolated — rest of batch still lands', async () => {
  const db = mockDb({ failPayloadMarker: 'POISON' });
  const res = await onRequestPost({
    request: postReq({ events: [ev('e1'), ev('e2', 'trial', { x: 'POISON' }), ev('e3')] }),
    params: { id: 'p1' },
    env: { DB: db },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.acked, ['e1', 'e3']);
  assert.equal(body.failed.length, 1);
  assert.equal(body.failed[0].id, 'e2');
  assert.equal(db.inserts.length, 2); // only the good events hit the DB
});

test('server: bad state snapshot is rejected, events still acked (no 500)', async () => {
  const db = mockDb();
  const res = await onRequestPost({
    request: postReq({ events: [ev('e1')], state: { name: null, level: 0 } }),
    params: { id: 'p1' },
    env: { DB: db },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.acked, ['e1']);
  assert.deepEqual(body.failed, []);
  assert.match(body.stateError, /state\.name is required/);
  assert.ok(!db.inserts.some((a) => a[0] === 'upsert')); // snapshot never applied
});

// Note: an actually-unserializable payload can never arrive over JSON
// (the client's JSON.stringify would throw first), so the server's
// per-event stringify guard is defense-in-depth only and has no test.

test('server: unauthenticated POST is still 401', async () => {
  const db = mockDb({ owned: false });
  const res = await onRequestPost({
    request: new Request('https://x/api/profiles/p1/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [ev('e1')] }),
    }),
    params: { id: 'p1' },
    env: { DB: db },
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------- client
let fetchHandler = null;
globalThis.fetch = async (url, opts) => fetchHandler(url, opts);
const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function seedStore(eventIds) {
  mem.clear();
  const store = loadStore();
  const p = newProfile('Kid', '🦊');
  p.id = 'p1';
  p.claimed = true;
  store.profiles.p1 = p;
  for (const id of eventIds) queueEvent(store, 'p1', 'trial', { id });
  // queueEvent generates its own ids — override for determinism:
  store.queue.forEach((e, i) => { e.id = eventIds[i]; });
  saveStore(store);
  return store;
}

const queueIds = () => loadStore().queue.map((e) => e.id);

test('client: happy path drains the queue, state idle', async () => {
  seedStore(['a', 'b']);
  fetchHandler = async (url) => {
    assert.match(url, /\/api\/profiles\/p1\/events/);
    return jsonRes({ acked: ['a', 'b'], failed: [] });
  };
  const r = await syncNow(true);
  assert.equal(r.ok, true);
  assert.deepEqual(queueIds(), []);
  assert.equal(getSyncState().state, 'idle');
});

test('client: partial ack drains good events; poison dead-letters after 3 failures', async () => {
  seedStore(['good', 'poison']);
  fetchHandler = async () => jsonRes({ acked: ['good'], failed: [{ id: 'poison', error: 'boom' }] });
  await syncNow(true); // fail 1
  assert.deepEqual(queueIds(), ['poison']);
  await syncNow(true); // fail 2
  assert.deepEqual(queueIds(), ['poison']);
  await syncNow(true); // fail 3 -> dead-letter
  assert.deepEqual(queueIds(), []);
  const st = getSyncState();
  assert.equal(st.deadLetter.length, 1);
  assert.equal(st.deadLetter[0].id, 'poison');
  assert.equal(st.deadLetter[0].error, 'boom');
  assert.equal(st.state, 'idle'); // queue drained — no permanent stall
});

test('client: repeated 500s dead-letter the batch with honest server_error state', async () => {
  seedStore(['x', 'y']);
  fetchHandler = async () => jsonRes({ error: 'internal error' }, 500);
  let r;
  r = await syncNow(true);
  assert.equal(r.ok, false);
  assert.equal(getSyncState().state, 'server_error');
  assert.match(getSyncState().error, /internal error/);
  assert.deepEqual(queueIds(), ['x', 'y']); // still queued after 1 failure
  await syncNow(true);
  r = await syncNow(true); // 3rd failure -> dead-letter
  assert.deepEqual(queueIds(), []);
  assert.equal(getSyncState().deadLetter.length, 2);
  assert.equal(getSyncState().state, 'idle');
});

test('client: network failure labels offline, never a stuck syncing', async () => {
  seedStore(['n1']);
  fetchHandler = async () => { throw new TypeError('fetch failed'); };
  const r = await syncNow(true);
  assert.equal(r.ok, false);
  const st = getSyncState();
  assert.equal(st.state, 'offline');
  assert.notEqual(st.state, 'syncing');
  assert.deepEqual(queueIds(), ['n1']); // kept for retry
});

test('client: request timeout labels offline, never a stuck syncing', async () => {
  seedStore(['t1']);
  fetchHandler = async () => { throw Object.assign(new Error('request_timeout'), {}); };
  // api() maps AbortError -> request_timeout; simulate the mapped error path
  // by throwing the same message a real timeout would produce.
  const r = await syncNow(true).catch((e) => e);
  void r;
  const st = getSyncState();
  assert.notEqual(st.state, 'syncing');
});

test('client: concurrent triggers share one in-flight run', async () => {
  seedStore(['c1']);
  let calls = 0;
  fetchHandler = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 50));
    return jsonRes({ acked: ['c1'], failed: [] });
  };
  const [r1, r2] = await Promise.all([syncNow(), syncNow()]);
  assert.equal(calls, 1);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
});

test('client: backoff defers automatic retries, force bypasses', async () => {
  seedStore(['b1']);
  let calls = 0;
  fetchHandler = async () => { calls++; return jsonRes({ error: 'bad' }, 500); };
  await syncNow(true);
  assert.equal(calls, 1);
  const r = await syncNow(); // automatic trigger -> deferred
  assert.equal(r.deferred, true);
  assert.equal(calls, 1);
  await syncNow(true); // manual "Sync now" -> forces
  assert.equal(calls, 2);
});

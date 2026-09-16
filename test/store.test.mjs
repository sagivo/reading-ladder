// Store regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards:
//  1. mutateStore writes localStorage SYNCHRONOUSLY — App.jsx's commit used
//     to defer saveStore into a React setState updater, so synchronous
//     loadStore() calls in the same tick (editKid's PUT payload, the claim
//     flow's syncNow) silently read stale data.
//  2. Readiness-check progress save/load/clear + 24h TTL — a reload
//     mid-readiness-check used to restart the child at the first question.

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

const {
  loadStore, saveStore, mutateStore, newProfile,
  saveReadinessProgress, loadReadinessProgress, clearReadinessProgress,
  didLessonToday,
} = await import('../src/lib/store.js');

test('mutateStore: localStorage reflects the mutation synchronously', () => {
  mem.clear();
  const before = loadStore();
  const p = newProfile('Kid', '🦊');
  p.id = 'k1';
  before.profiles.k1 = p;
  saveStore(before);
  const s = mutateStore((st) => { st.profiles.k1.name = 'Renamed'; });
  assert.equal(s.profiles.k1.name, 'Renamed');
  // The very next loadStore() — same tick, no flush needed — sees it.
  assert.equal(loadStore().profiles.k1.name, 'Renamed');
});

test('readiness progress: save -> load round-trips game + results', () => {
  mem.clear();
  saveReadinessProgress('kid1', 1, { seq: 2 });
  const r = loadReadinessProgress('kid1');
  assert.equal(r.game, 1);
  assert.deepEqual(r.results, { seq: 2 });
});

test('readiness progress: missing profile returns null', () => {
  mem.clear();
  assert.equal(loadReadinessProgress('nobody'), null);
});

test('readiness progress: clear removes it', () => {
  mem.clear();
  saveReadinessProgress('kid1', 2, { seq: 2, blend: 1 });
  clearReadinessProgress('kid1');
  assert.equal(loadReadinessProgress('kid1'), null);
});

test('readiness progress: stale entries (>24h) are dropped', () => {
  mem.clear();
  saveReadinessProgress('kid1', 1, { seq: 2 });
  // Backdate the entry beyond the TTL.
  const raw = JSON.parse(mem.get('reading-ladder-readiness-v1'));
  raw.kid1.savedAt = Date.now() - 25 * 60 * 60 * 1000;
  mem.set('reading-ladder-readiness-v1', JSON.stringify(raw));
  assert.equal(loadReadinessProgress('kid1'), null);
});

test('readiness progress: malformed entries are rejected', () => {
  mem.clear();
  mem.set('reading-ladder-readiness-v1', JSON.stringify({ kid1: { game: 'x' } }));
  assert.equal(loadReadinessProgress('kid1'), null);
});

test('didLessonToday: no sessions means the start button stays', () => {
  assert.equal(didLessonToday({ sessions: [] }), false);
  assert.equal(didLessonToday({}), false);
  assert.equal(didLessonToday(null), false);
});

test('didLessonToday: a session completed today blocks a second lesson', () => {
  assert.equal(didLessonToday({ sessions: [{ at: new Date().toISOString() }] }), true);
});

test('didLessonToday: yesterday\'s session does not block today\'s lesson', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(didLessonToday({ sessions: [{ at: yesterday }] }), false);
});

test('didLessonToday: malformed session entries never block', () => {
  assert.equal(didLessonToday({ sessions: [null, {}, { at: 'not-a-date' }] }), false);
  assert.equal(didLessonToday({ sessions: 'oops' }), false);
});

const {
  loadSitting, saveSitting, clearSitting, SITTING_GAP_MS,
} = await import('../src/lib/store.js');

test('sitting clock: save/load round-trips the sitting', () => {
  mem.clear();
  assert.equal(loadSitting(), null);
  const s = { profileId: 'k1', start: Date.now() - 60000, lastActive: Date.now() };
  saveSitting(s);
  assert.deepEqual(loadSitting(), s);
});

test('sitting clock: clearSitting removes it', () => {
  saveSitting({ profileId: 'k1', start: Date.now(), lastActive: Date.now() });
  clearSitting();
  assert.equal(loadSitting(), null);
});

test('sitting clock: malformed or incomplete values load as null', () => {
  mem.clear();
  mem.set('reading-ladder-sitting-v1', 'not-json');
  assert.equal(loadSitting(), null);
  saveSitting({ profileId: 'k1' }); // no start
  assert.equal(loadSitting(), null);
});

test('sitting clock: gap constant is one hour', () => {
  assert.equal(SITTING_GAP_MS, 60 * 60 * 1000);
});

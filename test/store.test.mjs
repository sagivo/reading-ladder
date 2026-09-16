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

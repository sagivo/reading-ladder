// v2 curriculum tests: mentava-style order, level mapping, decodability.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER, META, levelKind, newSound, taughtSet, levelOfGrapheme, MAX_LEVEL,
  decodableWordsForLevel, blendWordsForLevel, stepsForLevel, parseGraphemes2,
} from '../src/lib/curriculum2.js';

test('order starts a, m, s, t (mentava) and is lowercase, sounds not names', () => {
  assert.deepEqual(ORDER.slice(0, 4), ['a', 'm', 's', 't']);
  assert.ok(ORDER.every((g) => g === g.toLowerCase()));
  assert.equal(new Set(ORDER).size, ORDER.length); // no dupes
  for (const g of ORDER) assert.ok(META[g] && META[g].say, `meta for ${g}`);
});

test('level mapping: one new sound per level, review every 5th', () => {
  assert.equal(newSound(1), 'a');
  assert.equal(newSound(4), 't');
  assert.equal(newSound(5), null);
  assert.equal(levelKind(5), 'review');
  assert.equal(newSound(6), 'f');
  assert.equal(newSound(37), 'ck');
  assert.equal(MAX_LEVEL, 37);
  // every sound is taught exactly once
  const taught = [];
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const s = newSound(L);
    if (s) taught.push(s);
  }
  assert.deepEqual(taught, ORDER);
});

test('levelOfGrapheme inverts newSound', () => {
  for (const g of ORDER) {
    const L = levelOfGrapheme(g);
    assert.equal(newSound(L), g, g);
  }
});

test('taughtSet grows monotonically and stays decodable', () => {
  let prev = new Set();
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const t = taughtSet(L);
    for (const g of prev) assert.ok(t.has(g), `L${L} lost ${g}`);
    prev = t;
  }
});

test('level 4 blend words: only a/m/s/t, no rule-changes', () => {
  const words = blendWordsForLevel(4, 5, () => 0.99); // deterministic-ish
  assert.ok(words.length >= 3, `got ${words}`);
  const taught = taughtSet(4);
  for (const w of words) {
    const g = parseGraphemes2(w);
    assert.ok(g.every((x) => taught.has(x)), `${w} uses untaught graphemes`);
  }
  assert.ok(!words.includes('as'), 'as is irregular (s->z), must never appear');
});

test('blend words always decodable at their level', () => {
  for (const L of [4, 6, 7, 9, 11, 16, 21, 30]) {
    const taught = taughtSet(L);
    for (const w of blendWordsForLevel(L, 3)) {
      const g = parseGraphemes2(w);
      assert.ok(g.every((x) => taught.has(x)), `L${L}: ${w} not decodable`);
    }
  }
});

test('lesson arc steps', () => {
  assert.deepEqual(stepsForLevel(1), ['discover', 'recognize', 'recognize2', 'perform']);
  assert.deepEqual(stepsForLevel(4), ['discover', 'recognize', 'blend', 'read', 'perform']);
  assert.deepEqual(stepsForLevel(5), ['recognize', 'blend', 'read', 'perform']);
});

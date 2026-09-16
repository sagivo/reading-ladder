// v2 lesson-flow tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the v2 rebuild's load-bearing contracts:
//  1. Migration: old early/pre profiles become v2 main/basics exactly once.
//  2. Determinism: blend words and stories are seeded by level, so every
//     spoken word has a pre-generated clip (no runtime TTS).
//  3. Structure: LevelLesson owns the single shell (Screen/TopBar/
//     ProgressDots); step components render content only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_LEVEL, blendWordsForLevel, microStory, mulberry32,
  ensureV2Profile, currentV2Level, advanceV2, stepsForLevel,
} from '../src/lib/curriculum2.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '../src', p), 'utf8');

// ---- 1. migration ----
test('v2 migration: old early profile becomes main (sound-mapped level)', () => {
  const p = { id: 'x', track: 'early', level: 5 };
  assert.equal(ensureV2Profile(p), true);
  assert.equal(p.track, 'main');
  assert.equal(p.v2.track, 'main');
  assert.ok(p.v2.level >= 1 && p.v2.level <= MAX_LEVEL);
});

test('v2 migration: old pre profile becomes sounds-only basics', () => {
  const p = { id: 'x', track: 'pre', level: 0 };
  assert.equal(ensureV2Profile(p), true);
  assert.equal(p.track, 'basics');
  assert.equal(p.v2.track, 'basics');
});

test('v2 migration: already-v2 profile is untouched (idempotent)', () => {
  const p = { id: 'x', track: 'main', v2: { level: 3, stars: [], basicsAt: 1, track: 'main' } };
  assert.equal(ensureV2Profile(p), false);
  assert.equal(p.v2.level, 3);
});

test('v2 advance: main levels climb, stars recorded per level', () => {
  const p = { id: 'x', track: 'early', level: 1 };
  ensureV2Profile(p);
  const before = p.v2.level;
  advanceV2(p, before);
  assert.equal(currentV2Level(p), Math.min(before + 1, MAX_LEVEL));
  assert.ok(p.v2.stars.includes(before));
});

test('v2 advance: basics cycles 1..3 and never leaves sounds-only', () => {
  const p = { id: 'x', track: 'pre', level: 0 };
  ensureV2Profile(p);
  assert.equal(currentV2Level(p), 1);
  advanceV2(p, 1); assert.equal(currentV2Level(p), 2);
  advanceV2(p, 2); assert.equal(currentV2Level(p), 3);
  advanceV2(p, 3); assert.equal(currentV2Level(p), 1); // cycles
  assert.equal(p.track, 'basics');
});

// ---- 2. determinism (audio-clip contract) ----
test('v2 determinism: blend words are stable per level', () => {
  const a = blendWordsForLevel(9, 3, mulberry32(9));
  const b = blendWordsForLevel(9, 3, mulberry32(9));
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
});

test('v2 determinism: micro stories are stable per level', () => {
  assert.deepEqual(microStory(9, 9), microStory(9, 9));
});

test('v2 determinism: mulberry32 is a stable seeded RNG', () => {
  const seq = (s) => [mulberry32(s)(), mulberry32(s)(), mulberry32(s)()];
  assert.deepEqual(seq(7), seq(7));
  assert.notDeepEqual(seq(7), seq(8));
});

// ---- 3. structure: single shell ownership ----
const STEP_FILES = [
  'components/DiscoverBarn.jsx',
  'components/RecognizeSheep.jsx',
  'components/BlendVoice.jsx',
  'components/ReadStory.jsx',
  'components/GoFindSomeone.jsx',
  'components/LevelMap.jsx', // beanstalk map: content only, shell owns chrome
];

test('v2 structure: step components render no Screen/TopBar (shell owns chrome)', () => {
  for (const f of STEP_FILES) {
    const code = src(f);
    assert.doesNotMatch(code, /<Screen/, `${f} must not render <Screen>`);
    assert.doesNotMatch(code, /<TopBar/, `${f} must not render <TopBar>`);
  }
});

test('v2 structure: LevelLesson shell owns Screen, TopBar, ProgressDots', () => {
  const code = src('components/LevelLesson.jsx');
  assert.match(code, /<Screen/);
  assert.match(code, /<TopBar/);
  assert.match(code, /<ProgressDots/);
});

test('v2 structure: LevelLesson wires all five step components', () => {
  const code = src('components/LevelLesson.jsx');
  for (const name of ['DiscoverBarn', 'RecognizeSheep', 'BlendVoice', 'ReadStory', 'GoFindSomeone']) {
    assert.match(code, new RegExp(`<${name}`), `LevelLesson must render <${name}>`);
  }
});

test('v2 structure: lesson arcs match stepsForLevel', () => {
  assert.deepEqual(stepsForLevel(1), ['discover', 'recognize', 'recognize2', 'perform']);
  assert.ok(stepsForLevel(9).includes('blend'));
  assert.ok(stepsForLevel(9).includes('read'));
  assert.ok(!stepsForLevel(5).includes('discover')); // level 5 is review
  assert.equal(MAX_LEVEL, 37);
});

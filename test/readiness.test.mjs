// Readiness v2 regression tests (node:test, no new dependencies).
// The v2 gate is a two-trial dogfish/fishdog left-to-right order check —
// spoken + demoed, no QuizStep trial machines (the old architecture's
// dead-end class is gone by construction).
//
// Layers:
//  1. Placement rule: trackForScore(2) -> 'main', anything less -> 'basics'.
//  2. Trials: exactly two, dogfish then fishdog, both speakable.
//  3. Structural: Readiness.jsx has no QuizStep, speaks both trial ids,
//     and routes onDone through trackForScore.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { READINESS_TRIALS, trackForScore } from '../src/lib/readiness2.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readinessSrc = fs.readFileSync(path.join(here, '../src/components/Readiness.jsx'), 'utf8');

// ---- 1. placement rule ----
test('readiness v2: 2/2 routes to main track', () => {
  assert.equal(trackForScore(2), 'main');
});

test('readiness v2: anything less than 2/2 routes to sounds-only basics', () => {
  assert.equal(trackForScore(1), 'basics');
  assert.equal(trackForScore(0), 'basics');
});

// ---- 2. trials ----
test('readiness v2: exactly two trials, dogfish then fishdog', () => {
  assert.equal(READINESS_TRIALS.length, 2);
  assert.equal(READINESS_TRIALS[0].id, 'dogfish');
  assert.deepEqual(READINESS_TRIALS[0].parts, ['dog', 'fish']);
  assert.equal(READINESS_TRIALS[1].id, 'fishdog');
  assert.deepEqual(READINESS_TRIALS[1].parts, ['fish', 'dog']);
});

// ---- 3. structural ----
test('readiness v2: no QuizStep trial machines (dead-end class removed)', () => {
  assert.doesNotMatch(readinessSrc, /<QuizStep/);
});

test('readiness v2: speaks each trial by id and routes through trackForScore', () => {
  // Trial ids are interpolated into fixed templates; the catalog enumerates
  // every expansion ('Tap dogfish!', 'Tap fishdog!', …).
  assert.match(readinessSrc, /speak\(`Tap \${t\.id}!`\)/);
  assert.match(readinessSrc, /Listen: \${t\.parts\[0\]}… \${t\.parts\[1\]}! Try again!/);
  assert.match(readinessSrc, /trackForScore\(s\)/);
  assert.match(readinessSrc, /onDone\(\{[^}]*track: trackForScore\(s\)/);
});

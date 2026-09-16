// Readiness-check regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the SEVERE production bug where the readiness check dead-ended on
// Game 1 question 2 ("Listen: cat … sun"): the three Readiness QuizSteps
// were never remounted (missing key={trial}), so after question 1 the trial
// machine stayed done=true and swallowed every tap forever — the instruction
// said "cat … sun" while the buttons still showed question 1's emojis.
//
// Three layers:
//  1. Structural: every multi-question <QuizStep> in Readiness.jsx carries a
//     changing key={...} prop so a finished trial can never swallow input.
//  2. Content: every generated question's choices include its correct answer
//     id (an unwinnable question is a deterministic dead end by another name).
//  3. Behavioral: a finished trial machine ignores taps (reproduces the dead
//     end); a fresh machine per question advances normally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTrial } from '../src/lib/quizstep.js';
import {
  SEQ_ITEMS, BLEND_ITEMS, INVENTORY_SOUNDS, SEQ_CORRECT_ID,
  sequenceChoices, blendWordChoices, inventoryChoices, questionIsSound,
} from '../src/lib/readiness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readinessSrc = fs.readFileSync(path.join(here, '../src/components/Readiness.jsx'), 'utf8');

// ---- 1. structural: every QuizStep in Readiness.jsx has a key ----
test('readiness: every QuizStep remounts per question (key=)', () => {
  const blocks = readinessSrc.split('<QuizStep');
  assert.ok(blocks.length > 1, 'no QuizStep found in Readiness.jsx');
  for (const b of blocks.slice(1)) {
    const head = b.slice(0, 400);
    assert.match(head, /key=\{[^}]+\}/, `QuizStep without key prop: ${head.slice(0, 120)}…`);
  }
});

// ---- 2. content: correct answer is always among the choices ----
test('readiness game 1: every sequence question includes its correct answer', () => {
  assert.ok(SEQ_ITEMS.length >= 2);
  for (const item of SEQ_ITEMS) {
    const choices = sequenceChoices(item);
    assert.equal(choices.length, 2);
    assert.ok(questionIsSound(choices, SEQ_CORRECT_ID), `unwinnable: ${item.words.join(' ')}`);
    // The correct choice is the forward order the audio prompts.
    const fwd = choices.find((c) => c.id === SEQ_CORRECT_ID);
    assert.equal(fwd.label, item.emoji[0] + item.emoji[1]);
    assert.equal(fwd.speak, `${item.words[0]} ${item.words[1]}`);
    // The two options are genuinely different.
    assert.notEqual(choices[0].label, choices[1].label);
  }
});

test('readiness game 1: the cat…sun question is winnable', () => {
  const item = SEQ_ITEMS.find((i) => i.words[0] === 'cat');
  assert.ok(item, 'cat…sun item missing');
  const choices = sequenceChoices(item);
  assert.ok(questionIsSound(choices, SEQ_CORRECT_ID));
  assert.deepEqual(
    choices.map((c) => c.label).sort(),
    ['🐱☀️', '☀️🐱'].sort()
  );
});

test('readiness game 2: every blend question includes the blended word', () => {
  assert.ok(BLEND_ITEMS.length >= 2);
  for (const item of BLEND_ITEMS) {
    const choices = blendWordChoices(item);
    assert.equal(choices.length, 2);
    assert.ok(questionIsSound(choices, item.word), `unwinnable: ${item.word}`);
    assert.notEqual(choices[0].id, choices[1].id);
  }
});

test('readiness game 3: every inventory question includes the target letter', () => {
  assert.ok(INVENTORY_SOUNDS.length >= 2);
  for (const g of INVENTORY_SOUNDS) {
    const distract = INVENTORY_SOUNDS.filter((x) => x !== g).slice(0, 2);
    const choices = inventoryChoices(g, distract);
    assert.ok(choices.length >= 3);
    assert.ok(questionIsSound(choices, g), `unwinnable: ${g}`);
    assert.ok(choices.some((c) => c.id === 'unsure'), 'not-sure option missing');
  }
});

test('readiness: questionIsSound rejects malformed questions', () => {
  assert.equal(questionIsSound([{ id: 'a' }, { id: 'b' }], 'c'), false);
  assert.equal(questionIsSound([{ id: 'a' }], 'a'), false); // fewer than 2 choices
  assert.equal(questionIsSound([], 'a'), false);
  assert.equal(questionIsSound([{ id: 'a' }, { id: 'c' }], 'c'), true);
});

// ---- 3. behavioral: finished trial swallows taps; fresh trial advances ----
test('readiness: a finished trial machine ignores taps (the dead end), a fresh one advances', () => {
  const q1 = sequenceChoices(SEQ_ITEMS[0]);
  const stale = createTrial(q1, SEQ_CORRECT_ID);
  stale.tap(SEQ_CORRECT_ID); // question 1 answered correctly -> done
  assert.equal(stale.tap(SEQ_CORRECT_ID).kind, 'ignored');
  assert.equal(stale.tap('bwd').kind, 'ignored');

  // The fix: the parent remounts per question, so question 2 gets a fresh
  // machine with its OWN choices — the cat…sun answer is tappable.
  const q2 = sequenceChoices(SEQ_ITEMS[1]);
  const fresh = createTrial(q2, SEQ_CORRECT_ID);
  const ev = fresh.tap(SEQ_CORRECT_ID);
  assert.equal(ev.kind, 'correct');
});

// Lesson-loop regression tests (node:test, no new dependencies).
// Run with: npm test  (node --test test/)
//
// Guards the SEVERE production bug where the early-reader lesson dead-ended
// on "First sounds": the QuizStep was never remounted (missing key={trial}),
// so its trial machine stayed done=true and swallowed every tap forever —
// celebration showed, the lesson never advanced.
//
// Two layers:
//  1. Structural: every multi-question <QuizStep> in LessonEarly.jsx carries
//     a changing key={...} prop so a finished trial can never swallow input.
//  2. Behavioral: walk the pure lesson runner (stepsForPlan +
//     createLessonRunner) through a full early lesson, completing every step
//     with fresh trial machines, and assert it reaches `done`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTrial } from '../src/lib/quizstep.js';
import {
  buildEarlyLesson,
  buildPreLesson,
  stepsForPlan,
  createLessonRunner,
} from '../src/lib/lesson.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function fakeProfile(over = {}) {
  return {
    id: 'ptest',
    name: 'TestKid',
    track: 'early',
    placement: { track: 'early' },
    level: 0,
    mastery: {},
    misses: [],
    sessions: [],
    exposure: 0,
    ...over,
  };
}

/** Complete one multiple-choice question with a fresh trial (the contract). */
function answerQuestion(correctId = 'yes') {
  const t = createTrial(
    [
      { id: correctId, label: 'A' },
      { id: 'no', label: 'B' },
    ],
    correctId
  );
  const ev = t.tap(correctId);
  assert.equal(ev.kind, 'correct');
  assert.equal(ev.done, true);
  return ev;
}

test('stepsForPlan: full early lesson order', () => {
  const p = fakeProfile();
  const plan = buildEarlyLesson(p);
  const steps = stepsForPlan(plan);
  assert.ok(steps.includes('sound'), 'new sound step always present');
  assert.ok(steps.includes('blend') || steps.includes('firstsound'), 'a reading step always present');
  assert.equal(steps[steps.indexOf('sound') + 1] === 'blend' || steps[steps.indexOf('sound') + 1] === 'firstsound', true);
  // Story only appears once the sound set can form sentences (stage >= 3).
  if (plan.story) assert.ok(steps.includes('story'));
  if (plan.buildWord) assert.ok(steps.includes('build'));
  // No step id may repeat or be unknown.
  assert.deepEqual(new Set(steps).size, steps.length);
  for (const s of steps) assert.ok(['review', 'sound', 'blend', 'firstsound', 'build', 'story'].includes(s));
});

test('stepsForPlan: review skipped when no misses; firstsound fallback when blending is impossible', () => {
  const p = fakeProfile();
  const plan = buildEarlyLesson(p);
  assert.equal(plan.review.length, 0);
  assert.ok(!stepsForPlan(plan).includes('review'));
  // Stage 0 cannot blend yet -> first-sound fallback step.
  assert.ok(stepsForPlan(plan).includes('firstsound'));
  assert.ok(!stepsForPlan(plan).includes('blend'));
});

test('stepsForPlan: pre-reader track order', () => {
  const plan = buildPreLesson(fakeProfile());
  assert.deepEqual(stepsForPlan(plan), ['same', 'first', 'pair', 'order']);
});

test('full early lesson walk: every step completes and the runner finishes', () => {
  const p = fakeProfile({
    misses: [
      { id: 'm1', kind: 'word', ref: 'am', cleared: false },
      { id: 'm2', kind: 'word', ref: 'at', cleared: false },
    ],
  });
  const plan = buildEarlyLesson(p);
  const runner = createLessonRunner(plan);
  let guard = 0;
  let finished = false;
  while (guard++ < 20) {
    const step = runner.current();
    if (step === 'review') {
      for (const miss of plan.review) answerQuestion(miss.ref);
    } else if (step === 'sound') {
      answerQuestion('m'); // trial 1
      answerQuestion('m'); // trial 2 (NewSoundStep requires t >= 2)
    } else if (step === 'blend') {
      for (const b of plan.blendWords) answerQuestion(b.word);
    } else if (step === 'firstsound') {
      answerQuestion('yes');
      answerQuestion('yes');
      answerQuestion('yes'); // 3 trials before onDone
    } else if (step === 'build') {
      // BuildStep completes via tile taps; the runner just advances.
    } else if (step === 'story') {
      if (plan.story && plan.story.question) answerQuestion(plan.story.question.correct);
    } else {
      assert.fail(`unknown step ${step}`);
    }
    const r = runner.advance();
    if (r.done) {
      finished = true;
      break;
    }
  }
  assert.ok(finished, 'lesson runner must reach done (no dead-end step)');
  assert.ok(guard <= plan.review.length + 10, 'lesson completes in a bounded number of steps');
});

test('full pre-reader lesson walk finishes', () => {
  const plan = buildPreLesson(fakeProfile());
  const runner = createLessonRunner(plan);
  let finished = false;
  for (let k = 0; k < 10 && !finished; k++) {
    const step = runner.current();
    // same/different: 5 rounds; first: 4 rounds; pair: 4 rounds; order: 2 rounds.
    const rounds = { same: 5, first: 4, pair: 4, order: 2 }[step];
    for (let r = 0; r < rounds; r++) answerQuestion('yes');
    finished = runner.advance().done;
  }
  assert.ok(finished, 'pre-reader lesson must reach done');
});

test('structural: every multi-question QuizStep in LessonEarly remounts per question', () => {
  const src = fs.readFileSync(path.join(here, '..', 'src', 'components', 'LessonEarly.jsx'), 'utf8');
  // Find each <QuizStep ...> block and require a key={...} prop. The one
  // exception is the story comprehension quiz: a single question per mount,
  // so a static key is unnecessary (but harmless).
  const blocks = [...src.matchAll(/<QuizStep([\s\S]*?)\/>/g)];
  assert.ok(blocks.length >= 4, `expected several QuizStep usages, found ${blocks.length}`);
  const missing = blocks.filter((b) => !/key=/.test(b[1]));
  assert.deepEqual(
    missing.map((b) => b[1].slice(0, 60)),
    [],
    'every QuizStep in LessonEarly must remount per question (key={...}); a finished trial otherwise swallows all taps'
  );
});

test('createTrial contract: finished trial ignores taps; fresh trial accepts them', () => {
  const t = createTrial([{ id: 'a' }, { id: 'b' }], 'a');
  t.tap('a');
  assert.equal(t.tap('b').kind, 'ignored');
  const t2 = createTrial([{ id: 'a' }, { id: 'b' }], 'a');
  assert.equal(t2.tap('b').kind, 'retry'); // wrong answer on a FRESH trial gives feedback, not silence
});

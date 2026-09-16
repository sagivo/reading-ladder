// Decodability contract tests.
// Run with: npm test  (node --test test/)
// These run during the build and fail the build if the contract is violated.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGraphemes,
  stageOfWord,
  taughtThrough,
  isDecodable,
  validateTokens,
  assertDecodable,
  decodableWords,
} from '../src/lib/decodability.js';
import { SOUNDS, WORD_BANK, PREVIEW_WORDS } from '../src/lib/curriculum.js';
import { generateStory, storyTokens } from '../src/lib/story.js';

// Deterministic RNG for reproducible tests.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('parseGraphemes handles digraphs greedily', () => {
  assert.deepEqual(parseGraphemes('ship').graphemes, ['sh', 'i', 'p']);
  assert.deepEqual(parseGraphemes('thick').graphemes, ['th', 'i', 'ck']);
  assert.deepEqual(parseGraphemes('sing').graphemes, ['s', 'i', 'ng']);
  assert.deepEqual(parseGraphemes('mat').graphemes, ['m', 'a', 't']);
});

test('stageOfWord matches the sound teaching order', () => {
  assert.equal(stageOfWord('mat'), 3); // m,s,a,t
  assert.equal(stageOfWord('am'), 2);
  assert.equal(stageOfWord('ship'), 25); // sh
  assert.equal(stageOfWord('duck'), 29); // ck
  assert.equal(stageOfWord('Sam'), 2); // case-insensitive
});

test('every word-bank word is parseable and decodable at its own stage', () => {
  for (const e of WORD_BANK) {
    const stage = stageOfWord(e.w);
    assert.ok(
      stage < SOUNDS.length,
      `word "${e.w}" contains a grapheme outside the curriculum`
    );
    const taught = taughtThrough(stage);
    assert.ok(
      isDecodable(e.w, taught, PREVIEW_WORDS),
      `word "${e.w}" not decodable at its own stage ${stage}`
    );
  }
});

test('isDecodable rejects words with untaught sounds', () => {
  const taught = taughtThrough(3); // m s a t
  assert.ok(isDecodable('mat', taught));
  assert.ok(isDecodable('sat', taught));
  assert.ok(!isDecodable('ship', taught)); // sh not taught
  assert.ok(!isDecodable('pat', taught)); // p not taught
  assert.ok(isDecodable('the', taught, PREVIEW_WORDS)); // explicitly previewed
  assert.ok(!isDecodable('the', taught)); // not previewed -> rejected
});

test('validateTokens reports every violation', () => {
  const taught = taughtThrough(3);
  const v = validateTokens(['mat', 'sat', 'ship', 'pat'], taught, PREVIEW_WORDS);
  assert.equal(v.length, 2);
  assert.ok(v.some((x) => x.word === 'ship'));
  assert.ok(v.some((x) => x.word === 'pat'));
  assert.equal(validateTokens(['mat', 'sat'], taught, PREVIEW_WORDS).length, 0);
});

test('assertDecodable throws before display on violation', () => {
  const taught = taughtThrough(3);
  assert.throws(
    () => assertDecodable(['mat', 'ship'], taught, PREVIEW_WORDS, 'test'),
    /Decodability contract violated/
  );
  assert.doesNotThrow(() =>
    assertDecodable(['mat', 'sat', 'the'], taught, PREVIEW_WORDS, 'test')
  );
});

test('decodableWords only returns constructible words', () => {
  const words = decodableWords(WORD_BANK, 3, PREVIEW_WORDS);
  const taught = taughtThrough(3);
  assert.ok(words.length > 0);
  for (const e of words) {
    assert.ok(isDecodable(e.w, taught, PREVIEW_WORDS), `"${e.w}" leaked through`);
  }
  // Spot check: stage-3 pool really is the tiny expected set.
  const got = new Set(words.map((e) => e.w));
  for (const w of ['am', 'sam', 'at', 'mat', 'sat']) {
    assert.ok(got.has(w), `expected "${w}" in stage-3 pool`);
  }
  assert.ok(!got.has('pat'), '"pat" must not appear at stage 3');
});

test('story generator never emits an untaught word (many stages x seeds)', () => {
  for (const stage of [3, 5, 9, 14, 22, 25, 29]) {
    const taught = taughtThrough(stage);
    for (let seed = 1; seed <= 25; seed++) {
      const story = generateStory(stage, mulberry32(seed));
      assert.ok(story.sentences.length >= 1, `stage ${stage}: no sentences`);
      const violations = validateTokens(storyTokens(story), taught, PREVIEW_WORDS);
      assert.equal(
        violations.length, 0,
        `stage ${stage} seed ${seed}: ${JSON.stringify(violations)} in "${story.sentences.map((s) => s.text).join(' ')}"`
      );
      // Contract double-check: the assertion the app itself runs.
      assert.doesNotThrow(() =>
        assertDecodable(storyTokens(story), taught, PREVIEW_WORDS, 'test story')
      );
      // Every sentence ends with a period (real sentences, not fragments).
      for (const s of story.sentences) {
        assert.ok(s.text.endsWith('.'), `sentence missing period: ${s.text}`);
      }
    }
  }
});

test('story comprehension question only uses story words', () => {
  const story = generateStory(9, mulberry32(7));
  if (story.question) {
    const tokens = new Set(storyTokens(story).map((w) => w.toLowerCase()));
    assert.ok(tokens.has(story.question.correct.toLowerCase()));
  }
});

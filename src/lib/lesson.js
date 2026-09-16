// Daily lesson planner.
// Picks review misses, the ONE new sound, blending words, build words,
// a decodable story, and an offline mission — all validated against the
// decodability contract.

import { SOUNDS, WORD_BANK, MISSIONS, PREVIEW_WORDS } from './curriculum.js';
import { taughtThrough, isDecodable, assertDecodable } from './decodability.js';
import { generateStory, mulberry32 } from './story.js';
import { pendingMisses, nextTargetIndex } from './mastery.js';

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spoken-only items for first-sound games (never displayed as text,
// so they are outside the decodability contract by design).
export const FIRST_SOUND_ITEMS = {
  m: [['moon', '🌙'], ['mouse', '🐭'], ['map', '🗺️']],
  s: [['sun', '☀️'], ['sock', '🧦'], ['soup', '🍲']],
  a: [['apple', '🍎'], ['ant', '🐜'], ['axe', '🪓']],
  t: [['tiger', '🐯'], ['taco', '🌮'], ['tent', '⛺']],
  p: [['pig', '🐷'], ['pan', '🍳'], ['pear', '🍐']],
  i: [['igloo', '🧊'], ['ice', '🍦'], ['insect', '🐛']],
  n: [['nose', '👃'], ['nut', '🥜'], ['nest', '🪹']],
  d: [['dog', '🐶'], ['door', '🚪'], ['drum', '🥁']],
  o: [['ox', '🐂'], ['otter', '🦦'], ['olive', '🫒']],
  c: [['cat', '🐱'], ['cup', '☕'], ['cake', '🍰']],
  g: [['goat', '🐐'], ['grapes', '🍇'], ['gift', '🎁']],
  e: [['egg', '🥚'], ['elephant', '🐘'], ['engine', '🚂']],
  u: [['umbrella', '☂️'], ['unicorn', '🦄'], ['up', '⬆️']],
  f: [['fish', '🐟'], ['frog', '🐸'], ['fork', '🍴']],
  r: [['rabbit', '🐰'], ['robot', '🤖'], ['rose', '🌹']],
  l: [['lion', '🦁'], ['leaf', '🍃'], ['lamp', '💡']],
  h: [['hat', '🎩'], ['house', '🏠'], ['horse', '🐴']],
  b: [['ball', '⚽'], ['bear', '🐻'], ['bus', '🚌']],
  k: [['kite', '🪁'], ['key', '🔑'], ['kangaroo', '🦘']],
  j: [['jelly', '🫙'], ['jacket', '🧥'], ['jar', '🫙']],
  v: [['van', '🚐'], ['violin', '🎻'], ['vest', '🦺']],
  w: [['whale', '🐳'], ['window', '🪟'], ['watch', '⌚']],
  x: [['box', '📦'], ['fox', '🦊'], ['six', '6️⃣']],
  y: [['yo-yo', '🪀'], ['yogurt', '🍦'], ['yarn', '🧶']],
  z: [['zebra', '🦓'], ['zipper', '🤐'], ['zoo', '🦁']],
  sh: [['ship', '🚢'], ['shoe', '👟'], ['shark', '🦈']],
  ch: [['cheese', '🧀'], ['chair', '🪑'], ['chicken', '🐔']],
  th: [['thumb', '👍'], ['three', '3️⃣'], ['thunder', '⛈️']],
  ng: [['ring', '💍'], ['king', '🤴'], ['song', '🎵']],
  ck: [['duck', '🦆'], ['sock', '🧦'], ['clock', '🕐']],
};

function fillMission(template, sound, word) {
  return template
    .replaceAll('{G}', sound.g.toUpperCase())
    .replaceAll('{g}', sound.g)
    .replaceAll('{say}', sound.say)
    .replaceAll('{word}', word || '')
    .replaceAll('{keyword}', sound.keyword);
}

export function buildEarlyLesson(profile) {
  const review = pendingMisses(profile, 3);
  const soundIndex = Math.min(nextTargetIndex(profile, SOUNDS), SOUNDS.length - 1);
  const sound = SOUNDS[soundIndex];
  const taught = taughtThrough(soundIndex);

  // Blending words: decodable now, contain the target grapheme.
  const withTarget = shuffle(
    WORD_BANK.filter((e) => e.w.includes(sound.g) && isDecodable(e.w, taught, PREVIEW_WORDS))
  );
  const blendWords = withTarget.slice(0, 3).map((e, i, arr) => ({
    word: e.w,
    transfer: i === arr.length - 1, // last one is unseen -> transfer check
  }));
  // Contract: never display an unvalidated word.
  assertDecodable(blendWords.map((b) => b.word), taught, PREVIEW_WORDS, 'blend list');

  const buildWord = blendWords.length ? blendWords[0].word : null;

  // Story: only when the sound set can form sentences (stage >= 3).
  let story = null;
  try {
    // Stories are pre-generated ONCE per (stage, seed) and stored as MP3s
    // (scripts/build_manifest.mjs). Pin the RNG to the seeded pool
    // (seeds 1..25) so the runtime never needs live TTS.
    if (soundIndex >= 3) {
      const seed = 1 + ((profile.sessions ? profile.sessions.length : 0) % 25);
      story = generateStory(soundIndex, mulberry32(seed));
    }
  } catch {
    story = null;
  }

  const mission = fillMission(
    MISSIONS[Math.floor(Math.random() * MISSIONS.length)],
    sound,
    blendWords[0] ? blendWords[0].word : sound.keyword
  );

  return { kind: 'early', review, soundIndex, sound, blendWords, buildWord, story, mission };
}

export function buildPreLesson(profile) {
  // Pre-reader: listening, same/different, first sounds, letter-sound
  // pairing, order awareness. Exposure grows one sound per session.
  const exposure = Math.min(profile.exposure || 0, SOUNDS.length - 1);
  const sounds = SOUNDS.slice(0, exposure + 3);
  const focus = SOUNDS[exposure];
  const mission = fillMission(
    MISSIONS[Math.floor(Math.random() * MISSIONS.length)],
    focus,
    focus.keyword
  );
  return { kind: 'pre', sounds, focus, exposure, mission };
}

// ---- Lesson orchestration (pure, shared by components and tests) ----------

/**
 * Ordered step ids for a built plan. The single source of truth for the
 * lesson loop: review -> sound -> blend|firstsound -> build? -> story?
 * (pre-reader track: same -> first -> pair -> order).
 */
export function stepsForPlan(plan) {
  if (plan.kind === 'pre') return ['same', 'first', 'pair', 'order'];
  const steps = [];
  if (plan.review && plan.review.length) steps.push('review');
  steps.push('sound');
  steps.push(plan.blendWords && plan.blendWords.length >= 2 ? 'blend' : 'firstsound');
  if (plan.buildWord) steps.push('build');
  if (plan.story) steps.push('story');
  return steps;
}

/**
 * Minimal lesson-runner state machine (pure, unit-testable).
 * Regression guard for the dead-end bug where a lesson step never
 * advanced: every step must be completable and advance() must eventually
 * report done. Components mirror this machine; tests walk it end to end.
 */
export function createLessonRunner(plan) {
  const steps = stepsForPlan(plan);
  let i = 0;
  return {
    steps: steps.slice(),
    index: () => i,
    current: () => steps[i],
    /** Mark the current step complete and move on. Returns {done}. */
    advance: () => {
      if (i + 1 < steps.length) {
        i += 1;
        return { done: false, step: steps[i], index: i };
      }
      return { done: true, index: i };
    },
  };
}

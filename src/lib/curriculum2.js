// Reading Ladder v2 curriculum — mentava-inspired scope & sequence.
//
// Letter order follows mentava's: ordered by combinability + speech-sound
// acquisition, NOT alphabetical. Lowercase only; sounds, never letter names.
// One new grapheme per level; every 5th level is review. Blending starts at
// level 4 (a, m, s, t -> am, at, mat, sat, Sam).
//
// Pure data + pure functions — no browser APIs, no JSX. Safe for node tests.

import { WORD_BANK } from './curriculum.js';

// Mentava-style order. Index 4 of the old list etc. is irrelevant here;
// this is the single source of truth for v2 progression.
export const ORDER = [
  'a', 'm', 's', 't',
  'f', 'd', 'g', 'i',
  'n', 'p', 'h', 'b',
  'l', 'j', 'c', 'v',
  'w', 'r', 'k', 'e',
  'o', 'u', 'x', 'y',
  'z', 'sh', 'ch', 'th',
  'ng', 'ck',
];

export const META = {
  a:  { say: 'ah',  keyword: 'apple',    emoji: '🍎' },
  m:  { say: 'mmm', keyword: 'moon',     emoji: '🌙' },
  s:  { say: 'sss', keyword: 'sun',      emoji: '☀️' },
  t:  { say: 't',   keyword: 'tiger',    emoji: '🐯' },
  f:  { say: 'fff', keyword: 'fish',     emoji: '🐟' },
  d:  { say: 'd',   keyword: 'dog',      emoji: '🐶' },
  g:  { say: 'g',   keyword: 'goat',     emoji: '🐐' },
  i:  { say: 'ih',  keyword: 'igloo',    emoji: '🧊' },
  n:  { say: 'nnn', keyword: 'nose',     emoji: '👃' },
  p:  { say: 'p',   keyword: 'pig',      emoji: '🐷' },
  h:  { say: 'h',   keyword: 'hat',      emoji: '🎩' },
  b:  { say: 'b',   keyword: 'ball',     emoji: '⚽' },
  l:  { say: 'lll', keyword: 'lion',     emoji: '🦁' },
  j:  { say: 'j',   keyword: 'jelly',    emoji: '🫙' },
  c:  { say: 'k',   keyword: 'cat',      emoji: '🐱' },
  v:  { say: 'vvv', keyword: 'van',      emoji: '🚐' },
  w:  { say: 'w',   keyword: 'whale',    emoji: '🐳' },
  r:  { say: 'rrr', keyword: 'rabbit',   emoji: '🐰' },
  k:  { say: 'k',   keyword: 'kite',     emoji: '🪁' },
  e:  { say: 'eh',  keyword: 'egg',      emoji: '🥚' },
  o:  { say: 'aw',  keyword: 'ox',       emoji: '🐂' },
  u:  { say: 'uh',  keyword: 'umbrella', emoji: '☂️' },
  x:  { say: 'ks',  keyword: 'box',      emoji: '📦' },
  y:  { say: 'y',   keyword: 'yo-yo',    emoji: '🪀' },
  z:  { say: 'zzz', keyword: 'zebra',    emoji: '🦓' },
  sh: { say: 'sh',  keyword: 'ship',     emoji: '🚢' },
  ch: { say: 'ch',  keyword: 'cheese',   emoji: '🧀' },
  th: { say: 'th',  keyword: 'thumb',    emoji: '👍' },
  ng: { say: 'ng',  keyword: 'ring',     emoji: '💍' },
  ck: { say: 'k',   keyword: 'duck',     emoji: '🦆' },
};

// Multi-letter graphemes, longest first for greedy parsing.
const DIGRAPHS = ['sh', 'ch', 'th', 'ng', 'ck'];

export function parseGraphemes2(word) {
  const w = String(word).toLowerCase();
  const out = [];
  let i = 0;
  while (i < w.length) {
    let matched = null;
    for (const d of DIGRAPHS) {
      if (w.startsWith(d, i)) { matched = d; break; }
    }
    if (!matched) matched = w[i];
    out.push(matched);
    i += matched.length;
  }
  return out;
}

/** 'review' when L is a multiple of 5, else 'new'. Levels are 1-based. */
export function levelKind(L) {
  return L % 5 === 0 ? 'review' : 'new';
}

/** The new grapheme introduced at level L (null on review levels). */
export function newSound(L) {
  if (levelKind(L) === 'review') return null;
  const idx = (L - 1) - Math.floor((L - 1) / 5);
  return ORDER[idx] || null;
}

/** Set of graphemes taught through level L (inclusive). */
export function taughtSet(L) {
  const idx = (L - 1) - Math.floor((L - 1) / 5);
  return new Set(ORDER.slice(0, Math.min(idx + 1, ORDER.length)));
}

/** Highest level at which `grapheme` has been taught (1-based). */
export function levelOfGrapheme(g) {
  const oi = ORDER.indexOf(g);
  if (oi < 0) return Infinity;
  // level L teaches ORDER[(L-1) - floor((L-1)/5)]; invert: L = oi + 1 + floor(oi / 4)
  return oi + 1 + Math.floor(oi / 4);
}

/** Total levels: one per sound plus a review level every 5th level. */
export const MAX_LEVEL = ORDER.length + Math.floor(ORDER.length / 4);

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Decodable words for level L: every grapheme taught, at most
 * `maxGraphemes` graphemes long. Sorted to prefer words containing the
 * level's new sound, then shuffled (seedable via rng).
 */
export function decodableWordsForLevel(L, maxGraphemes = 4, rng = Math.random) {
  const taught = taughtSet(L);
  const ns = newSound(L);
  const cands = WORD_BANK.filter((e) => {
    const g = parseGraphemes2(e.w);
    return g.length <= maxGraphemes && g.every((x) => taught.has(x));
  });
  const withNew = shuffle(cands.filter((e) => ns && parseGraphemes2(e.w).includes(ns)), rng);
  const rest = shuffle(cands.filter((e) => !(ns && parseGraphemes2(e.w).includes(ns))), rng);
  return withNew.concat(rest).map((e) => e.w);
}

/** Blending words for the Blend step: 2-4 graphemes, new-sound-first. */
export function blendWordsForLevel(L, n = 3, rng = Math.random) {
  return decodableWordsForLevel(L, 4, rng).slice(0, n);
}

/** Deterministic RNG so level content (and its audio clips) is stable. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordered step ids for a level's lesson arc. */
export function stepsForLevel(L) {
  const kind = levelKind(L);
  if (kind === 'review') return ['recognize', 'blend', 'read', 'perform'];
  const steps = ['discover', 'recognize'];
  if (L >= 4) steps.push('blend', 'read');
  else steps.push('recognize2');
  steps.push('perform');
  return steps;
}

// Spoken-first-sound keyword items per grapheme (for Recognize sheep
// distractors and Discover keyword anchoring). [keyword, emoji].
export const KEYWORD_ITEMS = {
  a: [['apple', '🍎'], ['ant', '🐜']],
  m: [['moon', '🌙'], ['mouse', '🐭']],
  s: [['sun', '☀️'], ['sock', '🧦']],
  t: [['tiger', '🐯'], ['tent', '⛺']],
  f: [['fish', '🐟'], ['frog', '🐸']],
  d: [['dog', '🐶'], ['drum', '🥁']],
  g: [['goat', '🐐'], ['gift', '🎁']],
  i: [['igloo', '🧊'], ['insect', '🐛']],
  n: [['nose', '👃'], ['nest', '🪹']],
  p: [['pig', '🐷'], ['pan', '🍳']],
  h: [['hat', '🎩'], ['horse', '🐴']],
  b: [['ball', '⚽'], ['bear', '🐻']],
  l: [['lion', '🦁'], ['leaf', '🍃']],
  j: [['jelly', '🫙'], ['jar', '🫙']],
  c: [['cat', '🐱'], ['cake', '🍰']],
  v: [['van', '🚐'], ['vest', '🦺']],
  w: [['whale', '🐳'], ['window', '🪟']],
  r: [['rabbit', '🐰'], ['rose', '🌹']],
  k: [['kite', '🪁'], ['key', '🔑']],
  e: [['egg', '🥚'], ['engine', '🚂']],
  o: [['ox', '🐂'], ['otter', '🦦']],
  u: [['umbrella', '☂️'], ['up', '⬆️']],
  x: [['box', '📦'], ['fox', '🦊']],
  y: [['yo-yo', '🪀'], ['yarn', '🧶']],
  z: [['zebra', '🦓'], ['zoo', '🦁']],
  sh: [['ship', '🚢'], ['shark', '🦈']],
  ch: [['cheese', '🧀'], ['chicken', '🐔']],
  th: [['thumb', '👍'], ['three', '3️⃣']],
  ng: [['ring', '💍'], ['king', '🤴']],
  ck: [['duck', '🦆'], ['clock', '🕐']],
};

/**
 * Micro-story for the Read step: 1-3 short sentences, every word decodable
 * at level L ('the'/'a' allowed as preview words). Deterministic per (L, seed).
 */
export function microStory(L, seed = 1) {
  const taught = taughtSet(L);
  const ok = (w) => {
    const lw = w.toLowerCase();
    if (lw === 'the' || lw === 'a') return true;
    return parseGraphemes2(lw).every((g) => taught.has(g));
  };
  let rngState = seed * 2654435761;
  const rng = () => {
    rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
    return ((rngState >>> 0) % 1000) / 1000;
  };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const nouns = WORD_BANK.filter((e) => e.pos === 'noun' && e.anim === 'anim' && ok(e.w)).map((e) => e.w);
  const verbs = WORD_BANK.filter((e) => e.pos === 'verbPast' && ok(e.w)).map((e) => e.w);
  const things = WORD_BANK.filter((e) => e.pos === 'noun' && e.anim !== 'anim' && ok(e.w)).map((e) => e.w);
  if (!nouns.length || !verbs.length) return [];
  const n = pick(nouns);
  const v = pick(verbs);
  const out = [`${cap(n)} ${v}.`];
  if (things.length && out.length < 3) {
    const t = pick(things);
    if (t !== n) out.push(`${cap(n)} ${v} on the ${t}.`);
  }
  if (nouns.length > 1 && out.length < 3) {
    const n2 = pick(nouns.filter((x) => x !== n));
    if (n2) out.push(`${cap(n2)} ${pick(verbs)}.`);
  }
  return out;
}

/* ---------- v2 profile migration & progress ---------- */

import { SOUNDS as OLD_SOUNDS } from './curriculum.js';

// Ensure a profile has v2 progress fields. Migrates from the old
// early/pre scheme: old next-target sound -> new level via levelOfGrapheme.
// Returns true when a migration was applied (caller should persist).
export function ensureV2Profile(p) {
  if (p.v2 && typeof p.v2.level === 'number') {
    if (!p.v2.track) p.v2.track = p.track === 'pre' ? 'basics' : 'main';
    if (!p.v2.stars) p.v2.stars = [];
    if (!p.v2.basicsAt) p.v2.basicsAt = 1;
    return false;
  }
  let level = 1;
  const idx = typeof p.level === 'number' ? p.level : 0;
  const oldSound = OLD_SOUNDS[idx] || OLD_SOUNDS[0];
  if (oldSound) level = levelOfGrapheme(oldSound.g) || 1;
  p.v2 = {
    level: Math.min(Math.max(1, level), MAX_LEVEL),
    stars: [],
    basicsAt: 1,
    track: p.track === 'pre' ? 'basics' : 'main',
    completedAll: false,
  };
  // Old scheme used early/pre; v2 uses main/basics.
  if (p.track === 'early' || p.track === 'pre') p.track = p.v2.track;
  return true;
}

// The level a child should play right now.
export function currentV2Level(p) {
  ensureV2Profile(p);
  return p.v2.track === 'basics' ? p.v2.basicsAt : p.v2.level;
}

// Advance progress after completing `level`. Returns the next level to play.
export function advanceV2(p, level) {
  ensureV2Profile(p);
  if (p.v2.track === 'basics') {
    p.v2.basicsAt = (p.v2.basicsAt % 3) + 1; // sounds-only spiral: a, m, s
    return p.v2.basicsAt;
  }
  if (!p.v2.stars.includes(level)) p.v2.stars.push(level);
  if (level >= MAX_LEVEL) {
    // Every sound introduced: further play is practice, not progression.
    p.v2.level = MAX_LEVEL;
    p.v2.completedAll = true;
    return MAX_LEVEL;
  }
  p.v2.level = Math.min(level + 1, MAX_LEVEL);
  return p.v2.level;
}

// Authoritative narration catalog for The Reading Ladder.
//
// Enumerates EVERY string the app can speak through lib/narration.js,
// computes the content-hash address for the single Kristy voice
//   sha256('kristy|' + text).slice(0,32) + '.mp3'
// (exactly what lib/narration.js audioUrl() computes at runtime) and
// compares against the staged clips in public/audio/kristy/.
//
// Two categories:
//   FIXED  — finite strings; each must have a pre-generated MP3.
//            Missing ones are the backlog for scripts/generate_audio_speechify.py.
//   DYNAMIC — genuinely unbounded at runtime (the filled offline mission:
//            template × sound × lesson word); these honestly fall back
//            to Web Speech at runtime and are never "missing".
//
// Run: node scripts/build_audio_catalog.mjs
// Writes: $RL_CATALOG or /tmp/audio_catalog.json (full list) + coverage report.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SOUNDS, WORD_BANK, PREVIEW_WORDS } from '../src/lib/curriculum.js';
import {
  ORDER as ORDER2, META as META2, MAX_LEVEL as MAX_LEVEL2,
  blendWordsForLevel, microStory, mulberry32 as mulberry32_2,
} from '../src/lib/curriculum2.js';
// Safety net against catalog drift: every plain string literal passed to the
// narration API in src/ is picked up automatically, so a reworded speak()
// can never again silently lose its pre-generated clip (the way the old
// blend direction did). Interpolated templates still need hand enumeration
// below — they're listed in the end-of-run report for review.
import { extractSpokenLiterals } from './speech_strings.mjs';

// The runtime (lib/narration.js audioUrl) hashes the RAW spoken string:
//   sha256(`${voice}|${text}`).slice(0, 32)
// so the catalog must hash exactly that — no cleaning — or the coverage
// numbers lie. (An earlier revision imported a cleanSpokenText that never
// existed in narration.js, which crashed this script outright.)

// Single voice: Kristy (Speechify). Hash scheme unchanged:
//   sha256(`${voice}|${text}`).slice(0, 32)
const VOICES = ['kristy'];
// Clips ship in the repo under public/audio/ (vendored); override with
// RL_AUDIO_DIR for a local staging folder.
const AUDIO_DIR = process.env.RL_AUDIO_DIR || new URL('../public/audio', import.meta.url).pathname;

const hash = (voice, text) =>
  createHash('sha256').update(`${voice}|${text}`, 'utf8').digest('hex').slice(0, 32);

const fixed = new Map();   // text -> Set(categories)
const dynamic = new Map(); // template -> reason
function add(text, cat) {
  if (!text) return;
  if (!fixed.has(text)) fixed.set(text, new Set());
  fixed.get(text).add(cat);
}
function addDynamic(template, reason) {
  dynamic.set(template, reason);
}

// ---------- 1. Phonemes + graphemes + letter names ----------
for (const s of SOUNDS) {
  add(s.say, 'phoneme');
  add(s.g, 'grapheme');                 // speak(miss.ref), BuildStep tiles
  add(`the letter ${s.g}`, 'letter-name'); // QuizStep model branch
}

// ---------- 3. Decodable word bank (warmup / build / blend speak the word) ----------
for (const e of WORD_BANK) add(e.w, 'word-bank');
for (const w of PREVIEW_WORDS) add(w, 'preview-word');

// ---------- 7. QuizStep feedback language ----------
add('Tap the glowing one.', 'quiz-feedback');
add("Let's try again.", 'quiz-feedback');
add('Fewer choices.', 'quiz-feedback');
add('Watch. The answer is', 'quiz-feedback');
add('Now you tap it.', 'quiz-feedback');

// ---------- 8. Praise (emoji stripped — overlay keeps it, audio is clean) ----------
for (const p of ['You did it!', 'You looked at every sound.', 'That was careful reading.', 'Your brain is growing!', 'You figured it out!', 'Good copying!']) {
  add(p, 'praise');
}

// ---------- 8b. Source-literal safety net (anti-drift) ----------
// Every plain string literal handed to the narration API anywhere in src/
// is catalogued automatically. If a speak() is reworded, its new string
// shows up here with no hand-edit needed.
const SRC_DIR = new URL('../src', import.meta.url).pathname;
const { literals: srcLiterals, interpolated: interpSites } = extractSpokenLiterals(SRC_DIR);
for (const text of srcLiterals.keys()) add(text, 'source-literal');

// ---------- 9. Parent-gate / placement odds and ends ----------
add('Try again, grown-up.', 'parent-gate');
add('Try again.', 'parent-gate');
add("Let's go!", 'placement');

// ---------- 11. v2 lesson flow (deterministic per level — full finite set) ----------
// LevelLesson seeds blend words and stories by level, so every word the app
// can ever speak is enumerable here. Per-sound reveal/direction strings are
// enumerated for all 30 sounds (DiscoverBarn, RecognizeSheep, shell replay).
for (const s of ['Tap the barn!', "Who's inside?", 'Keep your voice ON!',
  'Now you! Hold the button and say the sounds.',
  'Hold the button and say the sounds. Keep your voice ON!',
  'Try again. Keep your voice ON!',
  "Keep your voice ON! Don't stop!",
  'Tap the sounds to hear them!',
  'Now you! Tap the sounds, say the word, then tap the star!',
  'You learned all the sounds!',
  "Let's read!", 'You did it!',
  'You read a story!', 'Go find someone and read it to them!',
  'All done! The animals are getting sleepy.', 'See you tomorrow!',
  'Tap dogfish!', 'Tap fishdog!',
  'Listen: dog… fish! Try again!', 'Listen: fish… dog! Try again!',
  'This one is dogfish.', 'This one is fishdog.', 'Yes!',
  'Tap the glowing leaf!',
]) add(s, 'v2-fixed');
for (let n = 1; n <= 15; n++) add(`You earned ${n} ${n === 1 ? 'star' : 'stars'}!`, 'v2-stars');
for (const g of ORDER2) {
  const { say, keyword } = META2[g];
  add(`It's ${say}!`, 'v2-reveal');
  add(`${say}, like ${keyword}.`, 'v2-reveal');
  add(`Say it with me: ${say}!`, 'v2-reveal');
  add(`Tap the sheep with ${say}!`, 'v2-recognize');
}
for (let L = 1; L <= MAX_LEVEL2; L++) {
  for (const w of blendWordsForLevel(L, 3, mulberry32_2(L))) {
    add(`${w}! You said it!`, 'v2-blend');
  }
  for (const s of microStory(L, L)) {
    add(s, 'v2-story');
    for (const w of s.split(/\s+/)) {
      add(w.replace(/[.,!?]$/, '').toLowerCase(), 'v2-story-word');
    }
  }
}

// ---------- compare with staged clips ----------
const staged = {};
for (const v of VOICES) {
  const dir = path.join(AUDIO_DIR, v);
  staged[v] = fs.existsSync(dir) ? new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'))) : new Set();
}

const rows = [];
for (const [text, cats] of fixed) {
  const per = {};
  for (const v of VOICES) {
    const fn = `${hash(v, text)}.mp3`;
    per[v] = staged[v].has(fn);
  }
  rows.push({ text, categories: [...cats], kristy: per.kristy });
}

const missing = rows.filter((r) => !r.kristy);
const byCat = {};
for (const r of missing) {
  for (const c of r.categories) {
    byCat[c] = byCat[c] || { n: 0, sample: [] };
    byCat[c].n++;
    if (byCat[c].sample.length < 3) byCat[c].sample.push(r.text.slice(0, 70));
  }
}

fs.writeFileSync(process.env.RL_CATALOG || '/tmp/audio_catalog.json', JSON.stringify({ generated: new Date().toISOString(), rows }, null, 1));

console.log('=== Reading Ladder narration catalog ===');
console.log(`fixed strings: ${fixed.size} | dynamic (name-bearing): ${dynamic.size}`);
console.log(`staged clips: kristy=${staged.kristy.size}`);
console.log(`covered: ${rows.length - missing.length}`);
console.log(`missing: ${missing.length}`);
console.log('\n--- missing by category ---');
for (const [c, s] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${c}: ${s.n} missing, e.g. ${JSON.stringify(s.sample)}`);
}
console.log('\n--- dynamic (Web Speech fallback, never "missing") ---');
for (const [t, why] of dynamic) console.log(`• ${t} — ${why}`);
console.log('\n--- interpolated speak() sites (need hand enumeration above) ---');
for (const s of interpSites) console.log(`• ${s.file}:${s.line} [${s.call}] "${s.preview}"`);
console.log('\nfull catalog: /tmp/audio_catalog.json');

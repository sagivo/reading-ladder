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
import { generateStory, mulberry32 } from '../src/lib/story.js';
import { FIRST_SOUND_ITEMS } from '../src/lib/lesson.js';
import {
  SEQ_ITEMS, BLEND_ITEMS, INVENTORY_SOUNDS,
  sequenceInstruction, blendWordChoices, inventoryChoices,
} from '../src/lib/readiness.js';

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

// ---------- 2. First-sound game words (spoken as model answers) ----------
for (const items of Object.values(FIRST_SOUND_ITEMS)) {
  for (const [word] of items) add(word, 'first-sound-word');
}

// ---------- 3. Decodable word bank (warmup / build / blend speak the word) ----------
for (const e of WORD_BANK) add(e.w, 'word-bank');
for (const w of PREVIEW_WORDS) add(w, 'preview-word');

// ---------- 4. Readiness games ----------
for (const item of SEQ_ITEMS) {
  add(`Listen. ${item.words[0]}. ${item.words[1]}. Tap what you heard, in order.`, 'readiness-seq');
  add(`${item.words[0]} ${item.words[1]}`, 'readiness-seq-choice');
  add(`${item.words[1]} ${item.words[0]}`, 'readiness-seq-choice');
}
add('Push one token for each sound you hear. Then tell me the word.', 'readiness-blend');
for (const item of BLEND_ITEMS) {
  for (const c of blendWordChoices(item)) add(c.speak, 'readiness-blend-choice');
}
for (let taps = 0; taps <= 5; taps++) {
  add(`You pushed ${taps}. What word do the sounds make?`, 'readiness-blend-quiz');
}
for (const g of INVENTORY_SOUNDS) {
  const s = SOUNDS.find((x) => x.g === g);
  add(`Which letter says ${s.say}, like ${s.keyword}? Tap it. Or tap "not sure".`, 'readiness-inventory');
  for (const c of inventoryChoices(g, ['x', 'y'])) {
    if (c.speak) add(c.speak, 'readiness-inventory-choice');
  }
}

// ---------- 5. Pre-reader lesson ----------
add('Are these two sounds the same or different? Listen.', 'pre-same');
add('Yes! Same sound.', 'pre-same');
add('Yes! Different sounds!', 'pre-same');
add("Let's listen again.", 'pre-same');
add('Same!', 'pre-same');
add('Different!', 'pre-same');
for (const s of SOUNDS) {
  add(`Which one starts with /${s.say}/, like ${s.keyword}? Tap it.`, 'pre-first');
  add(`Which letter says ${s.say}? Tap it.`, 'pre-pair');
  add(`Tap the letter that says /${s.say}/.`, 'pre-pair');
}
add('Last game! Listen. dog. fish. Tap what you heard.', 'pre-order');
add('Last game! Listen. cat. sun. Tap what you heard.', 'pre-order');
add('Listen: dog … fish. Tap what you heard, in order.', 'pre-order');
add('Listen: cat … sun. Tap what you heard, in order.', 'pre-order');
for (const w of ['dog fish', 'fish dog', 'cat sun', 'sun cat']) add(w, 'pre-order-choice');
add("Let's play with sounds!", 'pre-start');

// ---------- 6. Early-reader lesson ----------
add("Let's warm up. Tap the word you hear.", 'early-warmup');
for (const s of SOUNDS) {
  add(`Today's new sound. This letter says ${s.say}, like ${s.keyword}. Say it with me: ${s.say}.`, 'early-new-sound');
  add(`Which one starts with ${s.say}? Tap it.`, 'early-first-sound');
  add(`Not yet. Find /${s.say}/.`, 'early-build');
  add(`Watch: tap ${s.g}. Now you do it.`, 'early-build');
  add(`You learned the sound ${s.say}.`, 'end-screen');
}
add('Slide the sounds together. Then say the word fast.', 'early-blend');
add('Now say it fast!', 'early-blend');
add('Now read a real story. Tap each line to hear it, then read it yourself.', 'early-story');
add('Tap the word you just read.', 'early-blend-quiz');
for (let n = 1; n <= 30; n++) {
  add(`You read ${n} ${n === 1 ? 'word' : 'words'}.`, 'end-screen');
}
add('All done for today! Come back tomorrow for a new lesson.', 'home');
add('Welcome back! Let\'s keep going.', 'home');
add('You are ready to be an early reader! You will learn letter sounds and read real words.', 'placement');
add('You are a listening reader! You will play sound games and learn letter sounds by ear.', 'placement');
// Session-end offline mission: filled per lesson ({say}/{g}/{word}/{keyword})
// — unbounded combinations, Web Speech fallback. Everything else is fixed.
addDynamic('{mission template × sound × word} — offline mission, filled per lesson', 'unbounded combinations');

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

// ---------- 9. Parent-gate / placement odds and ends ----------
add('Try again, grown-up.', 'parent-gate');
add('Try again.', 'parent-gate');
add("Let's go!", 'placement');

// ---------- 10. Seeded story pool (stage × seed — the full finite set) ----------
// lesson.js: seed = 1 + (sessions.length % 25), stage = sound index 0..29.
let storyCount = 0;
for (let stage = 0; stage < SOUNDS.length; stage++) {
  for (let seed = 1; seed <= 25; seed++) {
    try {
      const story = generateStory(stage, mulberry32(seed));
      for (const s of story.sentences) add(s.text, 'story');
      if (story.question) add(`${story.question.prompt} Tap the answer.`, 'story-quiz');
      for (const c of story.question?.choices || []) add(c, 'story-quiz-choice');
      storyCount++;
    } catch { /* infeasible combo — runtime throws too */ }
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
console.log(`seeded stories generated: ${storyCount}`);
console.log('\n--- missing by category ---');
for (const [c, s] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${c}: ${s.n} missing, e.g. ${JSON.stringify(s.sample)}`);
}
console.log('\n--- dynamic (Web Speech fallback, never "missing") ---');
for (const [t, why] of dynamic) console.log(`• ${t} — ${why}`);
console.log('\nfull catalog: /tmp/audio_catalog.json');

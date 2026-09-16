// Narration: ElevenLabs MP3-first audio with layered fallbacks.
//
// Primary: pre-generated MP3s in R2, addressed by content hash:
//   {AUDIO_BASE_URL}/audio/{voice}/{sha256(voice + '|' + text).slice(0,32)}.mp3
// The hash is computed client-side from the exact string, so no manifest
// lookup is needed at runtime. Every fixed string + the full seeded story
// pool is pre-generated (scripts/build_manifest.mjs); the runtime never
// calls ElevenLabs TTS during normal use.
//
// Fallback chain per clip:
//   1. R2 MP3 (HTMLAudio)
//   2. Safety net: POST /api/audio {text, voice} — generates, caches in R2,
//      and LOGS the miss server-side so we can backfill the manifest.
//   3. Web Speech (speechSynthesis) — last resort only.
//
// API: setVoice/getVoice, narrate(text), narrateQueue([texts]),
//      narrateParts for composed utterances, stop(), preload(texts),
//      onStatus(cb) for the parent audio indicator.

import { speak as webSpeak, stop as webStop, setSoundEnabled as setWebSoundEnabled } from './speech.js';

export const VOICES = {
  sarah: { label: 'Sarah', hint: 'Warm feminine voice' },
  brian: { label: 'Brian', hint: 'Warm masculine voice' },
};
export const VOICE_IDS = Object.keys(VOICES);
export const DEFAULT_VOICE = 'sarah';

// Clips ship WITH the app as static assets (scripts/stage_audio.mjs copies
// the pre-generated MP3s into dist/audio/ at build time), so the primary
// path is same-origin: fast, cacheable, and needs no R2 bucket or CORS.
// (An earlier revision pointed at a not-yet-created R2 bucket, which meant
// every clip fell through to the slow safety net — the root cause of the
// "voice is buggy / taps feel ignored" reports.)
export const AUDIO_BASE_URL = '';

let currentVoice = DEFAULT_VOICE;
let currentAudio = null;
let generation = 0;
let lastSpoken = null; // text | string[] — what replayLast() re-plays
const statusListeners = new Set();

// Master sound switch (the 🔊 toggle). When off, narrate()/narrateQueue()
// are no-ops and any in-flight audio stops — this covers the MP3 path AND
// the Web Speech fallback (speech.js has its own flag, synced below).
let narrationEnabled = true;
/** Mute or unmute all narration. */
export function setSoundEnabled(v) {
  narrationEnabled = !!v;
  setWebSoundEnabled(narrationEnabled);
  if (!narrationEnabled) stop();
}
/** Current mute state (for initializing toggle buttons). */
export function isSoundEnabled() {
  return narrationEnabled;
}

// Narration hold: after a celebration, the next question's instruction
// waits instead of cutting the praise audio off mid-word. Set by
// celebrate() in praise.js; respected by narrate()/narrateQueue() unless
// the caller passes { ignoreHold: true } (the praise itself).
let holdUntil = 0;
/** Hold the narration channel for ms: incoming narrate() calls wait. */
export function holdNarration(ms) {
  holdUntil = Math.max(holdUntil, Date.now() + ms);
}

export function setVoice(v) {
  if (VOICES[v]) currentVoice = v;
}
export function getVoice() {
  return currentVoice;
}
export function onStatus(cb) {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}
function emitStatus(state, source) {
  for (const cb of statusListeners) {
    try { cb({ state, source, voice: currentVoice }); } catch { /* ignore */ }
  }
}

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function audioUrl(voice, text) {
  const h = await sha256hex(`${voice}|${text}`);
  return `${AUDIO_BASE_URL}/audio/${voice}/${h.slice(0, 32)}.mp3`;
}

/** Cancel everything: in-flight MP3, queued clips, Web Speech. */
export function stop() {
  generation++;
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
  webStop();
  emitStatus('idle', null);
}

function playMp3(url, gen) {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve(false);
    const audio = new Audio(url);
    currentAudio = audio;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) currentAudio = null;
      resolve(ok && gen === generation);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    // If the file 404s or stalls, fail fast to the next fallback.
    const timer = setTimeout(() => done(false), 15000);
    audio.onended = () => { clearTimeout(timer); done(true); };
    audio.onerror = () => { clearTimeout(timer); done(false); };
    audio.play().then(() => emitStatus('playing', 'mp3')).catch(() => { clearTimeout(timer); done(false); });
  });
}

async function safetyNet(text, voice, gen) {
  try {
    const res = await fetch('/api/audio', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok || gen !== generation) return false;
    const blob = await res.blob();
    if (!blob || blob.size < 100) return false;
    const objUrl = URL.createObjectURL(blob);
    const ok = await playMp3(objUrl, gen);
    URL.revokeObjectURL(objUrl);
    if (ok) emitStatus('playing', 'safety-net');
    return ok;
  } catch {
    return false;
  }
}

async function playClip(text, voice, opts = {}) {
  const gen = generation;
  if (!text) return false;
  // 1. Pre-generated R2 MP3.
  try {
    const url = await audioUrl(voice, text);
    if (gen !== generation) return false;
    if (await playMp3(url, gen)) return true;
  } catch { /* fall through */ }
  if (gen !== generation) return false;
  // 2. Safety net (logged server-side for backfill).
  if (!opts.noSafetyNet) {
    if (await safetyNet(text, voice, gen)) return true;
  }
  if (gen !== generation) return false;
  // 3. Web Speech, last resort.
  emitStatus('playing', 'web-speech');
  try {
    await webSpeak(text, opts);
  } catch { /* ignore */ }
  return gen === generation;
}

/** Speak one string. Cancels anything currently playing first. */
export async function narrate(text, opts = {}) {
  if (!narrationEnabled) return;
  // Respect a celebration hold: wait (briefly) instead of cutting praise off.
  const gen0 = generation;
  const wait = holdUntil - Date.now();
  if (wait > 0 && !opts.ignoreHold) {
    await new Promise((r) => setTimeout(r, Math.min(wait, 4000)));
    if (gen0 !== generation) return; // stopped/navigated while waiting
  }
  stop();
  const gen = generation;
  if (text && !opts.noRecord) lastSpoken = text;
  await playClip(text, currentVoice, opts);
  if (gen === generation) emitStatus('idle', null);
}

/**
 * Speak several strings back-to-back with minimal gap (for composed
 * utterances like "Let's try again." + instruction, or celebration parts).
 * All parts are pre-generated; this never synthesizes.
 */
export async function narrateQueue(texts, opts = {}) {
  if (!narrationEnabled) return;
  const gen0 = generation;
  const wait = holdUntil - Date.now();
  if (wait > 0 && !opts.ignoreHold) {
    await new Promise((r) => setTimeout(r, Math.min(wait, 4000)));
    if (gen0 !== generation) return;
  }
  stop();
  const gen = generation;
  if (texts && texts.length && !opts.noRecord) lastSpoken = texts.slice();
  for (const text of texts) {
    if (gen !== generation) break;
    await playClip(text, currentVoice, opts);
  }
  if (gen === generation) emitStatus('idle', null);
}

/** Re-play whatever was last narrated (powers the 🔁 replay button). */
export function replayLast() {
  if (!lastSpoken) return Promise.resolve(false);
  if (Array.isArray(lastSpoken)) return narrateQueue(lastSpoken, { noRecord: true });
  return narrate(lastSpoken, { noRecord: true });
}

/** Warm the cache for clips likely to play next (fire-and-forget). */
export function preload(texts) {
  try {
    for (const text of (texts || []).slice(0, 4)) {
      audioUrl(currentVoice, text).then((url) => {
        const a = new Audio();
        a.preload = 'auto';
        a.src = url;
      }).catch(() => {});
    }
  } catch { /* ignore */ }
}

// ---- Drop-in replacements for src/lib/speech.js ---------------------------
// These let components switch from Web Speech to MP3-first audio by changing
// only their import line: `import { narrate as speak, stop } from '../lib/narration.js'`.

/** Speak a single phoneme (pre-generated phoneme clip).
 * Accepts a sound object ({say}) or a raw string — callers pass both. */
export function speakSound(say) {
  const text = say && typeof say === 'object' ? say.say || say.g || '' : say;
  return narrate(text);
}

/** Speak sounds one at a time (blending preparation).
 * Accepts sound objects ({say}) or raw strings — callers pass both. */
export function speakSoundsSeparately(sounds, opts = {}) {
  const texts = (sounds || []).map((s) => (s && typeof s === 'object' ? s.say || s.g || '' : s));
  return narrateQueue(texts, opts);
}

/** narrate with a slower fallback rate (MP3 path plays at natural pace). */
export function speakSlow(text, opts = {}) {
  return narrate(text, { ...opts, rate: 0.75 });
}

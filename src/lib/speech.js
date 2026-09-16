// Web Speech API wrapper. All narration goes through here.
// Audio-first: every instruction is spoken; text is a visual aid.

let enabled = true;

export function setSoundEnabled(v) {
  enabled = v;
  if (!v) stop();
}
export function isSoundEnabled() {
  return enabled;
}

function synth() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis || null;
}

export function stop() {
  const u = synth();
  if (u) u.cancel();
}

/**
 * Speak text. Cancels anything currently playing first (one instruction
 * at a time — a 3-year-old can't follow overlapping audio).
 * Always resolves, even when speech is unavailable.
 */
export function speak(text, { rate = 0.95, pitch = 1.1 } = {}) {
  return new Promise((resolve) => {
    const u = synth();
    if (!enabled || !u || !text) {
      resolve();
      return;
    }
    u.cancel();
    const utt = new SpeechSynthesisUtterance(String(text));
    utt.rate = rate;
    utt.pitch = pitch;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    utt.onend = finish;
    utt.onerror = finish;
    // Safety: never hang the lesson on a stuck utterance.
    setTimeout(finish, 12000);
    u.speak(utt);
  });
}

/** Stretched, slow speech for modeling individual sounds. */
export function speakSlow(text) {
  return speak(text, { rate: 0.6, pitch: 1.05 });
}

/**
 * Speak a phoneme from its `say` field (e.g. "mmm", "ah").
 * Web Speech can't do pure phonemes; a stretched syllable at slow
 * rate is the pragmatic approximation.
 */
export function speakSound(sound) {
  return speakSlow(sound.say);
}

/** Speak each sound separately with a pause — for oral blending. */
export async function speakSoundsSeparately(sounds, pauseMs = 700) {
  for (const s of sounds) {
    await speakSlow(s.say);
    await new Promise((r) => setTimeout(r, pauseMs));
  }
}

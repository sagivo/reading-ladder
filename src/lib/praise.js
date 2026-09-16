// Global celebration channel: a correct answer advances the lesson
// IMMEDIATELY (no post-correct pause — a waiting screen feels broken to a
// small child), while the praise itself survives the transition as a
// floating overlay + audio that is never cut off by the next question.
//
// Flow: QuizStep calls celebrate(text) on a correct/copy tap. celebrate()
//   1. notifies overlay subscribers (App.jsx renders the floating banner),
//   2. holds narration so the next question's instruction can't interrupt,
//   3. plays the praise audio fire-and-forget.

import { narrate, holdNarration } from './narration.js';

/** How long the praise overlay stays up and narration stays held (ms). */
export const PRAISE_MS = 1500;

const subs = new Set();

/** Subscribe to celebration events. Returns an unsubscribe function. */
export function onPraise(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function celebrate(text) {
  if (!text) return;
  for (const cb of subs) {
    try {
      cb(text);
    } catch {
      /* ignore */
    }
  }
  // Hold the narration channel so the incoming question's instruction
  // waits instead of cutting the praise off mid-word.
  holdNarration(PRAISE_MS);
  // The overlay keeps the emoji; the spoken clip is the clean string the
  // audio catalog generates (emoji-stripped), otherwise the content hash
  // never matches a pre-generated MP3 and praise always falls back.
  const spoken = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
  narrate(spoken || text, { ignoreHold: true, noRecord: true }).catch(() => {});
}

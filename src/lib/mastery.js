// Mastery state machine.
// A sound is mastered only after correct responses across formats +
// transfer to an unseen word — never from taps alone.
// Formats: 'recall' (letter<->sound), 'blend' (in a word), 'transfer' (unseen word).
// Pure logic — no browser APIs; importable from node tests.

export function newSoundMastery() {
  return { status: 'introduced', attempts: [] };
}

export function recordAttempt(mastery, { format, correct, hints = 0, transfer = false }) {
  mastery.attempts.push({ format, correct, hints, transfer, at: new Date().toISOString() });
  // Keep the log bounded.
  if (mastery.attempts.length > 40) mastery.attempts = mastery.attempts.slice(-40);
  if (mastery.status === 'introduced' && mastery.attempts.length > 0) {
    mastery.status = 'learning';
  }
  if (isMastered(mastery)) mastery.status = 'mastered';
  return mastery;
}

/**
 * Mastery rule (from the blueprint's advance criteria):
 * - correct across at least 2 formats
 * - at least 1 correct unseen transfer
 * - last 2 attempts correct
 * - low hint use on recent correct attempts
 */
export function isMastered(m) {
  const a = m.attempts;
  if (a.length < 3) return false;
  const correct = a.filter((x) => x.correct);
  const formats = new Set(correct.map((x) => x.format));
  if (formats.size < 2) return false;
  if (!correct.some((x) => x.transfer)) return false;
  const last2 = a.slice(-2);
  if (!last2.every((x) => x.correct)) return false;
  const recentHints = a.slice(-4).reduce((n, x) => n + (x.hints || 0), 0);
  if (recentHints > 2) return false;
  return true;
}

/** First sound index in SOUNDS order that is not yet mastered. */
export function nextTargetIndex(profile, sounds) {
  for (let i = 0; i < sounds.length; i++) {
    const m = profile.mastery[sounds[i].g];
    if (!m || m.status !== 'mastered') return i;
  }
  return sounds.length - 1;
}

// ---- Miss queue -------------------------------------------------
// Misses are recorded and resurfaced in the next session's review step.

export function addMiss(profile, miss) {
  profile.misses.push({
    id: `m${Date.now()}${Math.floor(Math.random() * 1e4)}`,
    cleared: false,
    at: new Date().toISOString(),
    ...miss,
  });
  return profile;
}

export function pendingMisses(profile, limit = 3) {
  return profile.misses.filter((m) => !m.cleared).slice(0, limit);
}

export function clearMiss(profile, id) {
  const m = profile.misses.find((x) => x.id === id);
  if (m) m.cleared = true;
  return profile;
}

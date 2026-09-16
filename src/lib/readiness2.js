// Readiness gate v2 — pure logic (no JSX, testable under node:test).

export const READINESS_TRIALS = [
  { id: 'dogfish', parts: ['dog', 'fish'], emoji: '🐶🐟' },
  { id: 'fishdog', parts: ['fish', 'dog'], emoji: '🐟🐶' },
];

// Placement rule: both trials right on the first try -> main track;
// anything less -> sounds-only basics track ("we don't push kids").
export function trackForScore(score) {
  return score >= 2 ? 'main' : 'basics';
}

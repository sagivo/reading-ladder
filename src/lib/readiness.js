// Readiness-check question data + pure choice builders.
// Kept in a JSX-free module so node tests can import and validate every
// question's content: each question's choices MUST contain its correct
// answer, and each trial must be remountable per question (the QuizStep
// contract requires callers to pass key={trial} — a finished trial machine
// swallows every tap forever, which once dead-ended the whole check).

export const SEQ_ITEMS = [
  { words: ['dog', 'fish'], emoji: ['🐶', '🐟'] },
  { words: ['cat', 'sun'], emoji: ['🐱', '☀️'] },
  { words: ['pig', 'moon'], emoji: ['🐷', '🌙'] },
];

export const BLEND_ITEMS = [
  { word: 'map', sounds: ['m', 'a', 'p'] },
  { word: 'sun', sounds: ['s', 'u', 'n'] },
  { word: 'pig', sounds: ['p', 'i', 'g'] },
  { word: 'hat', sounds: ['h', 'a', 't'] },
];

export const INVENTORY_SOUNDS = ['m', 's', 'a', 't', 'p'];

export const SEQ_CORRECT_ID = 'fwd';

/**
 * Game 1 (Listening ears 👂): hear two words in order, tap the matching
 * emoji sequence. The correct choice id is always SEQ_CORRECT_ID ('fwd').
 */
export function sequenceChoices(item) {
  const forward = {
    id: 'fwd',
    label: item.emoji[0] + item.emoji[1],
    speak: `${item.words[0]} ${item.words[1]}`,
  };
  const backward = {
    id: 'bwd',
    label: item.emoji[1] + item.emoji[0],
    speak: `${item.words[1]} ${item.words[0]}`,
  };
  return [forward, backward];
}

export function sequenceInstruction(item) {
  // NOTE: the words must NOT appear in the visible text — the child hears
  // them via narration; showing them turns a listening task into visual
  // matching. (item is unused here but kept for API stability.)
  return 'Listen. Tap what you heard, in order.';
}

/**
 * Game 2 (Sound tokens 🔵): push one token per sound, then pick the word.
 * correctId is always the blended word itself.
 */
export function blendWordChoices(item) {
  const other = item.word === 'map' ? 'tap' : 'map';
  return [
    { id: item.word, label: item.word, speak: item.word },
    { id: other, label: other, speak: other },
  ];
}

/**
 * Game 3 (Letter sounds 🔤): which letter says the target sound?
 * correctId is the grapheme; 'unsure' (🤷) is always offered and scores
 * as not-known (never penalized).
 */
export function inventoryChoices(targetG, distractGs) {
  const choices = [
    { id: targetG, label: targetG, speak: `the letter ${targetG}` },
    ...distractGs.map((d) => ({ id: d, label: d, speak: `the letter ${d}` })),
    { id: 'unsure', label: '🤷', sub: 'not sure' },
  ];
  return choices;
}

/**
 * Content invariant: a question is only valid if its correct answer id is
 * among the offered choices. Used by tests AND can be asserted at runtime.
 */
export function questionIsSound(choices, correctId) {
  return (
    Array.isArray(choices) &&
    choices.length >= 2 &&
    choices.some((c) => c && c.id === correctId)
  );
}

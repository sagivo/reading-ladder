// Decodability contract.
// The decoding engine must NEVER present a word containing an untaught sound.
// Every word/story generator takes the set of taught sounds and only emits
// words constructible from them. Words are validated before display.
//
// Pure ESM — no browser APIs, no JSX — so node unit tests can import it.

import { SOUNDS, SOUND_INDEX } from './curriculum.js';

// Multi-letter graphemes, longest first for greedy parsing.
const DIGRAPHS = ['sh', 'ch', 'th', 'ng', 'ck'];

/**
 * Parse a word into graphemes using longest-match against the taught
 * grapheme inventory. Returns { graphemes } or { unknown } on failure.
 */
export function parseGraphemes(word) {
  const w = String(word).toLowerCase();
  const out = [];
  let i = 0;
  while (i < w.length) {
    let matched = null;
    for (const d of DIGRAPHS) {
      if (w.startsWith(d, i)) { matched = d; break; }
    }
    if (!matched) {
      const ch = w[i];
      if (ch >= 'a' && ch <= 'z') matched = ch;
      else return { unknown: w.slice(i) };
    }
    out.push(matched);
    i += matched.length;
  }
  return { graphemes: out };
}

/**
 * The earliest stage (index into SOUNDS) at which `word` is decodable,
 * i.e. the max index of its graphemes. Infinity if it contains a
 * grapheme outside the curriculum inventory.
 */
export function stageOfWord(word) {
  const { graphemes, unknown } = parseGraphemes(word);
  if (unknown) return Infinity;
  let stage = 0;
  for (const g of graphemes) {
    const idx = SOUND_INDEX[g];
    if (idx === undefined) return Infinity;
    if (idx > stage) stage = idx;
  }
  return stage;
}

/** Set of graphemes taught through `stage` (inclusive). */
export function taughtThrough(stage) {
  return new Set(SOUNDS.slice(0, stage + 1).map((s) => s.g));
}

const normPreview = (preview) => new Set((preview || []).map((w) => String(w).toLowerCase()));

/**
 * True when every grapheme of `word` is in `taughtSet`, or the word is
 * an explicitly previewed word (previewed words are surfaced to parents).
 */
export function isDecodable(word, taughtSet, preview = []) {
  const w = String(word).toLowerCase();
  if (normPreview(preview).has(w)) return true;
  const { graphemes, unknown } = parseGraphemes(word);
  if (unknown) return false;
  return graphemes.every((g) => taughtSet.has(g));
}

/**
 * Validate a list of tokens. Returns an array of violations:
 * [{ word, reason }]. Empty array = fully decodable.
 */
export function validateTokens(tokens, taughtSet, preview = []) {
  const previewSet = normPreview(preview);
  const violations = [];
  for (const token of tokens) {
    const w = String(token).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) continue;
    if (previewSet.has(w)) continue;
    const { graphemes, unknown } = parseGraphemes(w);
    if (unknown) {
      violations.push({ word: token, reason: `contains non-curriculum characters: "${unknown}"` });
      continue;
    }
    const untaught = graphemes.filter((g) => !taughtSet.has(g));
    if (untaught.length) {
      violations.push({ word: token, reason: `untaught grapheme(s): ${[...new Set(untaught)].join(', ')}` });
    }
  }
  return violations;
}

/**
 * Assertion used before ANY word/story is displayed to the child.
 * Throws on the first contract violation.
 */
export function assertDecodable(tokens, taughtSet, preview = [], context = 'display') {
  const violations = validateTokens(tokens, taughtSet, preview);
  if (violations.length) {
    throw new Error(
      `Decodability contract violated before ${context}: ` +
      violations.map((v) => `"${v.word}" (${v.reason})`).join('; ')
    );
  }
}

/** Filter a word bank to words decodable at `stage` (or previewed). */
export function decodableWords(bank, stage, preview = []) {
  const taught = taughtThrough(stage);
  return bank.filter((e) => isDecodable(e.w, taught, preview));
}

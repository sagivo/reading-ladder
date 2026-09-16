// Decodable story generator.
// Builds short fully-decodable stories from sentence templates, using only
// words constructible from the taught sound set plus the explicit PREVIEW_WORDS.
// The decodability contract is ENFORCED: every story is validated with
// assertDecodable() before it is returned — a violation throws instead of
// ever reaching the child.
//
// Pure logic — no browser APIs; importable from node tests.

import { WORD_BANK, TEMPLATES, PREVIEW_WORDS, NOUN_EMOJI } from './curriculum.js';
import { taughtThrough, isDecodable, assertDecodable } from './decodability.js';

function groupByPos(pool) {
  const byPos = {};
  for (const e of pool) {
    (byPos[e.pos] = byPos[e.pos] || []).push(e);
  }
  return byPos;
}

function pick(arr, rng, avoid) {
  const choices = avoid ? arr.filter((e) => e !== avoid) : arr;
  const list = choices.length ? choices : arr;
  return list[Math.floor(rng() * list.length)];
}

function candidatesFor(slot, byPos) {
  if (slot.slot === 'noun') {
    let nouns = byPos.noun || [];
    if (slot.anim) nouns = nouns.filter((e) => e.anim === 'anim');
    return nouns;
  }
  if (slot.slot === 'verbPast') {
    // trans:true -> verbPastTrans only; trans:false -> intransitive verbPast only.
    return slot.trans ? byPos.verbPastTrans || [] : byPos.verbPast || [];
  }
  return byPos[slot.slot] || [];
}

function templateFeasible(tpl, byPos, taught, preview) {
  for (const part of tpl) {
    if (part.lit) {
      if (!isDecodable(part.lit, taught, preview)) return false;
    } else {
      if (candidatesFor(part, byPos).length === 0) return false;
    }
  }
  return true;
}

function fillTemplate(tpl, byPos, rng) {
  const words = [];
  const filled = [];
  let lastNoun = null;
  for (const part of tpl) {
    if (part.lit) {
      words.push(part.lit);
      filled.push({ lit: part.lit });
    } else {
      const cands = candidatesFor(part, byPos);
      const word = pick(cands, rng, lastNoun);
      words.push(word.w);
      filled.push({ word: word.w, pos: part.slot, entry: word });
      if (part.slot === 'noun') lastNoun = word;
    }
  }
  return { words, filled };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a short decodable story for `stage`.
 * Returns { sentences:[{text, words:[{w, emoji?}]}], nouns:[...], question }.
 * Throws if no decodable story can be built (never show a bad story).
 */
export function generateStory(stage, rng = Math.random, sentenceCount = 3) {
  const taught = taughtThrough(stage);
  const pool = WORD_BANK.filter((e) => isDecodable(e.w, taught, PREVIEW_WORDS));
  const byPos = groupByPos(pool);
  const feasible = TEMPLATES.filter((t) => templateFeasible(t, byPos, taught, PREVIEW_WORDS));
  if (!feasible.length) {
    throw new Error(`No feasible story template at stage ${stage}`);
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    const sentences = [];
    const usedNouns = [];
    for (let s = 0; s < sentenceCount; s++) {
      const tpl = pick(feasible, rng);
      const { words, filled } = fillTemplate(tpl, byPos, rng);
      // Contract enforcement: validate every token before display.
      assertDecodable(words, taught, PREVIEW_WORDS, 'story generation');
      const text = capitalize(words.join(' ')) + '.';
      sentences.push({
        text,
        words: words.map((w) => ({
          w,
          emoji: NOUN_EMOJI[w.toLowerCase()] || null,
        })),
      });
      for (const f of filled) {
        if (f.pos === 'noun') usedNouns.push(f.entry);
      }
    }

    // Comprehension question from the first sentence's subject + verb.
    const first = sentences[0];
    const subj = first.words.find((x) => {
      const e = pool.find((p) => p.w === x.w.toLowerCase());
      return e && e.pos === 'noun';
    });
    const verb = first.words
      .map((x) => pool.find((p) => p.w === x.w.toLowerCase()))
      .find((e) => e && (e.pos === 'verbPast' || e.pos === 'verbPastTrans' || e.pos === 'verb'));
    let question = null;
    if (subj && verb) {
      const distractors = pool.filter(
        (e) => e.pos === 'noun' && e.w !== subj.w.toLowerCase()
      );
      if (distractors.length >= 1) {
        const wrong = pick(distractors, rng);
        question = {
          prompt: `Who ${verb.w}?`,
          correct: subj.w,
          choices: shuffle([subj.w, wrong.w], rng),
        };
        usedNouns.push();
      }
    }
    void usedNouns;
    return { sentences, question };
  }
  throw new Error(`Could not generate a decodable story at stage ${stage}`);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** All story tokens flattened — handy for tests. */
export function storyTokens(story) {
  return story.sentences.flatMap((s) => s.words.map((x) => x.w));
}

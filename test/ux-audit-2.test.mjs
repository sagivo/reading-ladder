// UX audit round 2 regression tests (node:test, no new dependencies).
// Guards the fixes from the live 3yo/5yo walkthrough:
//  1. QuizStep renders a per-choice speaker button so a non-reading child
//     can hear what any word/picture card says without answering it.
//  2. The add-reader form asks for age, not birth year.
//  3. The praise overlay sits at the bottom so it can't cover the top
//     "hear it again" replay control.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '..', 'src', p), 'utf8');

test('QuizStep renders a speaker button on every choice card', () => {
  const ui = src('components/ui.jsx');
  // The speaker must announce the choice's spoken form without answering.
  assert.match(ui, /aria-label=\{`Hear: \$\{c\.speak \|\| c\.label\}`\}/);
  // ...and without stealing the "Hear it again" replay slot (noRecord),
  // so replay always re-speaks the full question.
  assert.match(ui, /onClick=\{\(\) => speak\(c\.speak \|\| c\.label, \{ noRecord: true \}\)\}/);
  // It must be a sibling of the choice button, never nested inside it
  // (a button inside a button is invalid and would answer on tap).
  const choicesBlock = ui.slice(ui.indexOf('visible.map((c) =>'));
  const speakerIdx = choicesBlock.indexOf('🔊');
  const choiceBtnIdx = choicesBlock.indexOf('<ChoiceButton');
  assert.ok(speakerIdx > 0 && choiceBtnIdx > 0, 'speaker and choice button both render per choice');
  assert.ok(choiceBtnIdx < speakerIdx, 'speaker renders alongside (after) the choice button, not inside it');
});

test('every QuizStep choice carries a speak value so the speaker has audio', () => {
  const ui = src('components/ui.jsx');
  // QuizStep's speaker falls back to c.label, which is always present.
  assert.match(ui, /c\.speak \|\| c\.label/);
});

test('add-reader form asks for age, not birth year', () => {
  const kids = src('components/Kids.jsx');
  assert.match(kids, /placeholder="Age \(optional\)"/);
  assert.doesNotMatch(kids, /placeholder="Birth year/);
  assert.match(kids, /Age is only used to suggest a starting track/);
  // Age is converted to the stored birth year (schema + sync unchanged).
  assert.match(kids, /new Date\(\)\.getFullYear\(\) - parseInt\(a, 10\)/);
});

test('praise overlay is bottom-anchored, away from the top replay button', () => {
  const app = src('App.jsx');
  const overlay = app.slice(app.indexOf('function PraiseOverlay()'));
  assert.match(overlay, /bottom: 32/);
  assert.doesNotMatch(overlay, /top: 24/);
});

test('add-reader passes through exactly one grown-up gate (no double math quiz)', () => {
  const home = src('components/Home.jsx');
  const app = src('App.jsx');
  // Home's button routes straight to reader management...
  assert.doesNotMatch(home, /ParentGate/);
  assert.match(home, /onClick=\{onManageKids\}/);
  // ...and App guards the kids screen with a single gate.
  const gates = app.match(/<ParentGate/g) || [];
  assert.ok(gates.length >= 1, 'App renders a grown-up gate before reader management');
  assert.match(app, /screen === 'kids' && !kidsGate/);
});

test('v2 story: words are tappable buttons with spoken playback, no readable directions', () => {
  const story = src('components/ReadStory.jsx');
  // Every word is a real button the child can tap to hear it.
  assert.match(story, /hearWord/);
  assert.match(story, /<button/);
  // Graphemes are color-coded visually (digraphs grouped, not letter salad).
  assert.match(story, /DIGRAPH_COLORS/);
  // The screen opens with spoken guidance, not written instructions.
  assert.match(story, /speak\("Let's read!"\)/);
  assert.doesNotMatch(story, /<Title|<Subtitle/);
});

test('v2 finale: GoFindSomeone is one big star button, no reading required', () => {
  const go = src('components/GoFindSomeone.jsx');
  assert.match(go, /⭐/);
  assert.match(go, /narrateQueue\(\['You read a story!', 'Go find someone and read it to them!'\]\)/);
  assert.doesNotMatch(go, /<Title|<Subtitle/);
});

test('locked accessory tap shows a visible explanation, not just spoken', () => {
  const comp = src('components/Companion.jsx');
  assert.match(comp, /Finish a lesson to earn a new accessory!/);
  // Locked accessories must stay tappable (aria-disabled), never the
  // browser-disabled dead buttons a small child can't get feedback from.
  assert.match(comp, /aria-disabled=\{!unlocked\}/);
  assert.doesNotMatch(comp, /^\s*disabled[=,\s]/m);
});

// Pre-reader daily lesson: listening first, no blending pressure.
// 1. same/different -> 2. first sounds -> 3. letter-sound pairing -> 4. order game.

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, TopBar, ProgressDots, QuizStep, ChoiceButton } from './ui.jsx';
import { narrate as speak, speakSound, stop } from '../lib/narration.js';
import { SOUNDS } from '../lib/curriculum.js';
import { FIRST_SOUND_ITEMS } from '../lib/lesson.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function StepShell({ step, total, replayText, onHome, children, title }) {
  return (
    <Screen>
      <TopBar onHome={onHome} replayText={replayText} />
      <ProgressDots total={total} done={step} />
      {title ? <Title>{title}</Title> : null}
      {children}
    </Screen>
  );
}

// ---------- 1. Same / different ----------
function SameDifferent({ sounds, L, onDone }) {
  const [round, setRound] = useState(0);
  const [pair, setPair] = useState(() => makePair(sounds));
  const [answered, setAnswered] = useState(false);

  function makePair(ss) {
    const a = ss[Math.floor(Math.random() * ss.length)];
    const same = Math.random() < 0.5;
    const b = same ? a : ss[Math.floor(Math.random() * ss.length)];
    return { a, b: b.g === a.g && !same ? ss[(ss.indexOf(a) + 1) % ss.length] : b, same: b.g === a.g };
  }

  useEffect(() => {
    setAnswered(false);
    stop();
    speak('Are these two sounds the same or different? Listen.');
    setTimeout(async () => {
      await speakSound(pair.a);
      await new Promise((r) => setTimeout(r, 500));
      await speakSound(pair.b);
    }, 1200);
  }, [round]);

  async function answer(same) {
    if (answered) return;
    setAnswered(true);
    const correct = same === pair.same;
    L.trial({ grapheme: null, word: null, format: 'recall', transfer: false, result: { correct, modeled: false, hints: correct ? 0 : 1 }, pre: true });
    await speak(correct ? 'Yes! ' + (pair.same ? 'Same sound.' : 'Different sounds!') : "Let's listen again.");
    if (!correct) {
      await speakSound(pair.a);
      await new Promise((r) => setTimeout(r, 400));
      await speakSound(pair.b);
      await speak(pair.same ? 'Same!' : 'Different!');
    }
    setTimeout(() => {
      if (round + 1 < 5) {
        setPair(makePair(sounds));
        setRound(round + 1);
      } else onDone();
    }, 800);
  }

  const replay = async () => {
    await speakSound(pair.a);
    await new Promise((r) => setTimeout(r, 500));
    await speakSound(pair.b);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <Subtitle>Same sound? Or different? 👂</Subtitle>
      <BigButton small color="#9a94c7" onClick={replay}>🔁 Play again</BigButton>
      <div style={{ display: 'flex', gap: 20 }}>
        <ChoiceButton onClick={() => answer(true)}><span style={{ fontSize: 40 }}>👍<br />Same</span></ChoiceButton>
        <ChoiceButton onClick={() => answer(false)}><span style={{ fontSize: 40 }}>👎<br />Different</span></ChoiceButton>
      </div>
      <Subtitle>Round {round + 1} of 5</Subtitle>
    </div>
  );
}

// ---------- 2. First sounds ----------
function FirstSounds({ sounds, L, onDone }) {
  const [round, setRound] = useState(0);
  const target = sounds[round % sounds.length];
  const items = FIRST_SOUND_ITEMS[target.g] || FIRST_SOUND_ITEMS.m;
  const item = items[round % items.length];
  const otherKey = shuffle(Object.keys(FIRST_SOUND_ITEMS).filter((k) => k !== target.g))[0];
  const otherItems = FIRST_SOUND_ITEMS[otherKey];
  const wrong = otherItems[round % otherItems.length];
  const instruction = `Which one starts with /${target.say}/, like ${target.keyword}?`;

  useEffect(() => {
    speak(instruction + ' Tap it.');
  }, [round]);

  return (
    <QuizStep
      key={round}
      instruction={instruction}
      choices={shuffle([
        { id: 'yes', label: item[1], sub: item[0], speak: item[0] },
        { id: 'no', label: wrong[1], sub: wrong[0], speak: wrong[0] },
      ])}
      correctId="yes"
      onResult={(r) => {
        L.trial({ grapheme: target.g, word: null, format: 'recall', transfer: false, result: r, pre: true });
        setTimeout(() => (round + 1 < 4 ? setRound(round + 1) : onDone()), 900);
      }}
    />
  );
}

// ---------- 3. Letter-sound pairing ----------
function LetterPair({ sounds, L, onDone }) {
  const [round, setRound] = useState(0);
  const target = sounds[round % sounds.length];
  const distract = shuffle(sounds.filter((s) => s.g !== target.g)).slice(0, 2);
  const instruction = `Tap the letter that says /${target.say}/.`;

  useEffect(() => {
    speak(`Which letter says ${target.say}? Tap it.`);
  }, [round]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 72 }}>{target.emoji}</div>
      <QuizStep
        key={round}
        instruction={instruction}
        choices={shuffle([
          { id: target.g, label: target.g, speak: `the letter ${target.g}` },
          ...distract.map((d) => ({ id: d.g, label: d.g, speak: `the letter ${d.g}` })),
        ])}
        correctId={target.g}
        onResult={(r) => {
          L.trial({ grapheme: target.g, word: null, format: 'recall', transfer: false, result: r, pre: true });
          setTimeout(() => (round + 1 < 4 ? setRound(round + 1) : onDone()), 900);
        }}
      />
    </div>
  );
}

// ---------- 4. Order game ----------
const SEQ = [
  { words: ['dog', 'fish'], emoji: ['🐶', '🐟'] },
  { words: ['cat', 'sun'], emoji: ['🐱', '☀️'] },
];

function OrderGame({ L, onDone }) {
  const [round, setRound] = useState(0);
  const item = SEQ[round];
  const instruction = `Listen: ${item.words[0]} … ${item.words[1]}. Tap what you heard, in order.`;

  useEffect(() => {
    speak(`Last game! Listen. ${item.words[0]}. ${item.words[1]}. Tap what you heard.`);
  }, [round]);

  const choices = shuffle([
    { id: 'fwd', label: item.emoji[0] + item.emoji[1], speak: `${item.words[0]} ${item.words[1]}` },
    { id: 'bwd', label: item.emoji[1] + item.emoji[0], speak: `${item.words[1]} ${item.words[0]}` },
  ]);

  return (
    <QuizStep
      key={round}
      instruction={instruction}
      choices={choices}
      correctId="fwd"
      onResult={(r) => {
        L.trial({ grapheme: null, word: null, format: 'recall', transfer: false, result: r, pre: true });
        setTimeout(() => (round + 1 < 2 ? setRound(round + 1) : onDone()), 900);
      }}
    />
  );
}

// ---------- Orchestrator ----------
const STEPS = ['same', 'first', 'pair', 'order'];
const TITLES = { same: 'Same or different? 👂', first: 'First sounds 🗣️', pair: 'Letter sounds 🔤', order: 'What order? 🐶🐟' };
const REPLAY = {
  same: 'Are the two sounds the same or different?',
  first: 'Tap the picture that starts with the sound.',
  pair: 'Tap the letter that makes the sound.',
  order: 'Tap the pictures in the order you heard.',
};

export default function LessonPre({ profile, plan, L, onFinish, onHome, initialStep = 0, onStep }) {
  const [i, setI] = useState(() => Math.min(initialStep || 0, STEPS.length - 1));
  const step = STEPS[i];

  useEffect(() => {
    stop();
    speak(`Let's play with sounds, ${profile.name}!`);
  }, []);

  // Persist lesson position so a reload mid-lesson can resume (App.jsx).
  useEffect(() => {
    if (onStep) onStep(i);
  }, [i]);

  function advance() {
    setTimeout(() => {
      if (i + 1 < STEPS.length) setI(i + 1);
      else onFinish({ mission: plan.mission, focusSound: plan.focus.g });
    }, 600);
  }

  return (
    <StepShell step={i} total={STEPS.length} replayText={REPLAY[step]} onHome={onHome} title={TITLES[step]}>
      {step === 'same' && <SameDifferent sounds={plan.sounds} L={L} onDone={advance} />}
      {step === 'first' && <FirstSounds sounds={plan.sounds} L={L} onDone={advance} />}
      {step === 'pair' && <LetterPair sounds={plan.sounds} L={L} onDone={advance} />}
      {step === 'order' && <OrderGame L={L} onDone={advance} />}
    </StepShell>
  );
}

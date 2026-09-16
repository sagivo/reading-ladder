// Readiness check: a 4-minute audio-led game, not a test.
// Decides track by demonstrated skill, not age.
// Game 1: order awareness — hear two words, pick the matching emoji sequence.
// Game 2: oral blending — push one token per sound, then pick the word.
// Game 3: letter-sound mini-inventory.

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, TopBar, ProgressDots, QuizStep, ChoiceButton, randomPraise } from './ui.jsx';
import { speak, speakSoundsSeparately, stop } from '../lib/speech.js';
import { SOUNDS } from '../lib/curriculum.js';
import { parseGraphemes } from '../lib/decodability.js';

const SEQ_ITEMS = [
  { words: ['dog', 'fish'], emoji: ['🐶', '🐟'] },
  { words: ['cat', 'sun'], emoji: ['🐱', '☀️'] },
  { words: ['pig', 'moon'], emoji: ['🐷', '🌙'] },
];

const BLEND_ITEMS = [
  { word: 'map', sounds: ['m', 'a', 'p'] },
  { word: 'sun', sounds: ['s', 'u', 'n'] },
  { word: 'pig', sounds: ['p', 'i', 'g'] },
  { word: 'hat', sounds: ['h', 'a', 't'] },
];

const INVENTORY_SOUNDS = ['m', 's', 'a', 't', 'p'];

function soundOf(g) {
  return SOUNDS.find((s) => s.g === g);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Game 1: sequence match ----------
function SequenceGame({ onDone }) {
  const [trial, setTrial] = useState(0);
  const [score, setScore] = useState(0);
  const item = SEQ_ITEMS[trial];
  const instruction = `Listen: ${item.words[0]} … ${item.words[1]}. Tap what you heard.`;

  useEffect(() => {
    speak(`Listen. ${item.words[0]}. ${item.words[1]}. Tap what you heard, in order.`);
  }, [trial]);

  const forward = { id: 'fwd', label: item.emoji[0] + item.emoji[1], speak: `${item.words[0]} ${item.words[1]}` };
  const backward = { id: 'bwd', label: item.emoji[1] + item.emoji[0], speak: `${item.words[1]} ${item.words[0]}` };
  const choices = shuffle([forward, backward]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <ProgressDots total={3} done={0} />
      <Title>Game 1 of 3 · Listening ears 👂</Title>
      <QuizStep
        instruction={instruction}
        choices={choices}
        correctId="fwd"
        onResult={({ correct }) => {
          const s = score + (correct ? 1 : 0);
          setScore(s);
          // Immediate: celebration travels with the transition (praise.js).
          if (trial + 1 < 2) setTrial(trial + 1);
          else onDone(s);
        }}
      />
    </div>
  );
}

// ---------- Game 2: push a token per sound, then blend ----------
function BlendGame({ onDone }) {
  const [trial, setTrial] = useState(0);
  const [score, setScore] = useState(0);
  const [taps, setTaps] = useState(0);
  const [counted, setCounted] = useState(false);
  const item = BLEND_ITEMS[trial];
  const tokens = [0, 1, 2, 3, 4];

  useEffect(() => {
    stop();
    speak(`Push one token for each sound you hear. Then tell me the word.`);
    setTimeout(() => {
      speakSoundsSeparately(item.sounds.map(soundOf));
    }, 1200);
  }, [trial]);

  const instruction = 'Push one token for each sound, then pick the word.';

  function finishTrial(wordCorrect) {
    const ok = taps === item.sounds.length && wordCorrect;
    const s = score + (ok ? 1 : 0);
    setScore(s);
    setTaps(0);
    setCounted(false);
    // Immediate: celebration travels with the transition (praise.js).
    if (trial + 1 < 2) setTrial(trial + 1);
    else onDone(s);
  }

  const wordChoices = shuffle([
    { id: item.word, label: item.word, speak: item.word },
    { id: 'other', label: item.word === 'map' ? 'tap' : 'map', speak: item.word === 'map' ? 'tap' : 'map' },
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <ProgressDots total={3} done={1} />
      <Title>Game 2 of 3 · Sound tokens 🔵</Title>
      {!counted ? (
        <>
          <Subtitle>{instruction}</Subtitle>
          <div style={{ display: 'flex', gap: 14 }}>
            {tokens.map((i) => (
              <button
                key={i}
                onClick={() => setTaps(Math.min(taps + 1, 5))}
                aria-label={`token ${i + 1}`}
                style={{
                  width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
                  background: i < taps ? '#7c5cd6' : '#fff',
                  border: '5px solid #7c5cd6',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <BigButton small color="#9a94c7" onClick={() => setTaps(0)}>↺ Start over</BigButton>
            <BigButton small onClick={() => setCounted(true)}>I pushed {taps} ✓</BigButton>
          </div>
          <button
            onClick={() => speakSoundsSeparately(item.sounds.map(soundOf))}
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#7c5cd6', textDecoration: 'underline', cursor: 'pointer' }}
          >🔁 Play the sounds again</button>
        </>
      ) : (
        <QuizStep
          instruction={`You pushed ${taps}. What word do the sounds make?`}
          choices={wordChoices}
          correctId={item.word}
          onResult={({ correct }) => finishTrial(correct)}
        />
      )}
    </div>
  );
}

// ---------- Game 3: letter-sound inventory ----------
function InventoryGame({ onDone }) {
  const [trial, setTrial] = useState(0);
  const [score, setScore] = useState(0);
  const g = INVENTORY_SOUNDS[trial];
  const s = soundOf(g);
  const instruction = `Which letter says /${s.say}/, like ${s.keyword}?`;

  useEffect(() => {
    speak(`Which letter says ${s.say}, like ${s.keyword}? Tap it. Or tap "not sure".`);
  }, [trial]);

  const distract = shuffle(SOUNDS.filter((x) => x.g !== g && x.g.length === 1)).slice(0, 2);
  const choices = shuffle([
    { id: g, label: g, speak: `the letter ${g}` },
    ...distract.map((d) => ({ id: d.g, label: d.g, speak: `the letter ${d.g}` })),
    { id: 'unsure', label: '🤷', sub: 'not sure' },
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <ProgressDots total={3} done={2} />
      <Title>Game 3 of 3 · Letter sounds 🔤</Title>
      <div style={{ fontSize: 72 }}>{s.emoji}</div>
      <QuizStep
        instruction={instruction}
        choices={choices}
        correctId={g}
        onResult={({ correct, modeled }) => {
          // "not sure" or modeled counts as not-known, without penalty language
          const s2 = score + (correct && !modeled ? 1 : 0);
          setScore(s2);
          // Immediate: celebration travels with the transition (praise.js).
          if (trial + 1 < INVENTORY_SOUNDS.length) setTrial(trial + 1);
          else onDone(s2);
        }}
      />
    </div>
  );
}

// ---------- Orchestrator ----------
export default function Readiness({ profile, onDone, onHome }) {
  const [game, setGame] = useState(0);
  const [results, setResults] = useState({});

  useEffect(() => {
    speak(`Hi ${profile.name}! Let's play three listening games.`);
  }, []);

  function next(r) {
    const res = { ...results, ...r };
    setResults(res);
    if (game < 2) {
      setGame(game + 1);
    } else {
      // Placement rule: order awareness + oral blending + letter inventory.
      const track = res.seq >= 1 && res.blend >= 1 && res.letters >= 3 ? 'early' : 'pre';
      onDone({
        done: true,
        at: new Date().toISOString(),
        seq: res.seq, blend: res.blend, letters: res.letters,
        track,
      });
    }
  }

  return (
    <Screen>
      <TopBar onHome={onHome} replayText="Listen carefully, then tap your answer." />
      {game === 0 && <SequenceGame onDone={(seq) => next({ seq })} />}
      {game === 1 && <BlendGame onDone={(blend) => next({ blend })} />}
      {game === 2 && <InventoryGame onDone={(letters) => next({ letters })} />}
    </Screen>
  );
}

// Readiness gate v2 — the dogfish/fishdog left-to-right check.
// The child must understand that ORDER matters (🐶🐟 "dogfish" vs 🐟🐶
// "fishdog") before the main track. Fail -> Basics track (sounds only,
// never blending). "We don't push kids, we stop making them wait."
//
// No readable instructions for the child: spoken directions + demo only.

import React, { useState, useEffect, useMemo } from 'react';
import { Screen, TopBar, ProgressDots } from './ui.jsx';
import { narrate as speak, stop } from '../lib/narration.js';
import { READINESS_TRIALS as TRIALS, trackForScore } from '../lib/readiness2.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Readiness({ onDone, onHome }) {
  const [trial, setTrial] = useState(0);
  const [score, setScore] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [wiggle, setWiggle] = useState(null);
  const [demo, setDemo] = useState(true); // pulsing demo until first tap

  const t = TRIALS[trial];
  const cards = useMemo(() => shuffle(TRIALS), [trial]);

  useEffect(() => {
    setDemo(true);
    setRetrying(false);
    speak(`Tap ${t.id}!`);
    return () => stop();
  }, [trial]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (correct) => {
    const s = score + (correct ? 1 : 0);
    setScore(s);
    if (trial + 1 < TRIALS.length) {
      setTrial(trial + 1);
    } else {
      onDone({ done: true, at: new Date().toISOString(), track: trackForScore(s), score: s });
    }
  };

  const tap = (id) => {
    setDemo(false);
    if (id === t.id) {
      speak('Yes!').then(() => advance(!retrying));
    } else {
      setWiggle(id);
      setTimeout(() => setWiggle(null), 500);
      if (!retrying) {
        setRetrying(true);
        speak(`Listen: ${t.parts[0]}… ${t.parts[1]}! Try again!`);
      } else {
        // Second miss: model once more, then move on without pressure.
        speak(`This one is ${t.id}.`).then(() => advance(false));
      }
    }
  };

  return (
    <Screen>
      <TopBar onHome={onHome} replayText={`Tap ${t.id}!`} />
      <ProgressDots total={TRIALS.length} done={trial} />
      {/* Demo: a ghost hand bounces between the cards — it shows THAT to tap,
          never WHICH card is right (pulsing the correct card would give away
          the answer and make the gate meaningless). */}
      {demo ? (
        <div
          aria-hidden="true"
          style={{ fontSize: 64, textAlign: 'center', marginTop: 8, pointerEvents: 'none', animation: 'ghostTap 1.1s ease-in-out infinite' }}
        >
          👆
        </div>
      ) : (
        <div style={{ height: 72, marginTop: 8 }} />
      )}
      <div style={{ display: 'flex', gap: '6vw', justifyContent: 'center', marginTop: '1vh' }}>
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => tap(c.id)}
            aria-label={c.id}
            style={{
              width: 'min(40vw, 28vh)', aspectRatio: '1', borderRadius: '18%',
              fontSize: 'min(13vh, 15vw)',
              background: '#ffffff', border: '1vmin solid #d9d2f5', cursor: 'pointer',
              animation: wiggle === c.id ? 'wiggle 0.5s ease-in-out' : 'none',
            }}
          >
            {c.emoji}
          </button>
        ))}
      </div>
      <style>{`
        @keyframes ghostTap { 0%,100% { transform: translateY(-6px); } 50% { transform: translateY(10px); } }
        @keyframes wiggle { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
      `}</style>
    </Screen>
  );
}

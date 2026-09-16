// Shared UI primitives.
// Interaction grammar: one actionable object per screen, targets >= 48px
// (here: much bigger), replay always visible, audio instruction + visual demo.

import React, { useState } from 'react';
import { speak, stop } from '../lib/speech.js';

export function Screen({ children, bg = 'linear-gradient(160deg, #f5f0ff 0%, #eef6ff 100%)' }) {
  return (
    <div style={{
      minHeight: '100vh', background: bg, display: 'flex',
      flexDirection: 'column', alignItems: 'center', padding: '24px 20px 40px',
      fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#2d2a45',
    }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        {children}
      </div>
    </div>
  );
}

export function BigButton({ onClick, children, color = '#7c5cd6', small = false, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: small ? 56 : 84, minWidth: small ? 120 : 240, padding: small ? '12px 28px' : '18px 48px',
        fontSize: small ? 22 : 30, fontWeight: 800, color: '#fff', background: disabled ? '#b9b3d6' : color,
        border: 'none', borderRadius: 28, cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : '0 6px 0 rgba(0,0,0,0.15)', opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function ChoiceButton({ onClick, children, dimmed = false, highlight = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 110, minWidth: 140, padding: 16, fontSize: 44, fontWeight: 800,
        background: highlight ? '#fff7d6' : '#ffffff',
        border: highlight ? '6px solid #f5b301' : '4px solid #d9d4f5',
        borderRadius: 28, cursor: 'pointer', opacity: dimmed ? 0.35 : 1,
        boxShadow: '0 4px 12px rgba(80,60,160,0.12)',
      }}
    >
      {children}
    </button>
  );
}

export function Title({ children }) {
  return <h1 style={{ fontSize: 34, textAlign: 'center', margin: '8px 0', lineHeight: 1.25 }}>{children}</h1>;
}

/** Human label for a learner track. */
export function trackLabel(track) {
  return track === 'early' ? '📖 Early reader'
    : track === 'pre' ? '👂 Listening reader'
    : '✨ New reader';
}

export function Subtitle({ children }) {
  return <p style={{ fontSize: 22, textAlign: 'center', margin: 0, color: '#5b567d', lineHeight: 1.4 }}>{children}</p>;
}

export function ProgressDots({ total, done }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} aria-label={`step ${done + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 16, height: 16, borderRadius: '50%',
          background: i <= done ? '#7c5cd6' : '#d9d4f5',
        }} />
      ))}
    </div>
  );
}

/**
 * Top bar: small home button (top-left) + always-visible replay button.
 * Replay re-speaks the current instruction.
 */
export function TopBar({ onHome, replayText, replayLabel = '🔁 Hear it again' }) {
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <button
        onClick={() => { stop(); onHome && onHome(); }}
        aria-label="Home"
        style={{
          width: 56, height: 56, fontSize: 26, borderRadius: 18,
          border: '3px solid #d9d4f5', background: '#fff', cursor: 'pointer',
        }}
      >🏠</button>
      {replayText ? (
        <button
          onClick={() => speak(replayText)}
          style={{
            minHeight: 56, padding: '8px 20px', fontSize: 20, fontWeight: 700,
            borderRadius: 18, border: '3px solid #7c5cd6', background: '#fff',
            color: '#7c5cd6', cursor: 'pointer',
          }}
        >{replayLabel}</button>
      ) : <div style={{ width: 56 }} />}
    </div>
  );
}

/** Gentle encouragement — never a buzzer or red X. */
export const PRAISE = [
  'You did it!', 'You looked at every sound.', 'That was careful reading.',
  'Your brain is growing!', 'You figured it out!',
];

export function randomPraise() {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}

/**
 * A forgiving multiple-choice trial implementing the error language:
 *  1st miss -> repeat the goal (same choices, re-spoken instruction)
 *  2nd miss -> reduce choices
 *  3rd miss -> model it: highlight the answer, child taps to copy
 * onResult({ correct, modeled, hints }) — correct=false when modeled.
 */
export function QuizStep({ instruction, choices, correctId, onResult, speakInstruction = true }) {
  const [misses, setMisses] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [modeled, setModeled] = useState(false);
  const [done, setDone] = useState(false);

  const visible = choices.filter((c) => {
    if (!reduced) return true;
    if (c.id === correctId) return true;
    // keep one distractor: the first non-correct choice
    return c.id === choices.find((x) => x.id !== correctId).id;
  });

  const correctChoice = choices.find((c) => c.id === correctId);

  async function handleTap(choice) {
    if (done) return;
    if (modeled) {
      if (choice.id === correctId) {
        setDone(true);
        await speak('Good copying!');
        onResult({ correct: false, modeled: true, hints: 3 });
      } else {
        await speak('Tap the glowing one.');
      }
      return;
    }
    if (choice.id === correctId) {
      setDone(true);
      await speak(randomPraise());
      onResult({ correct: true, modeled: false, hints: misses });
      return;
    }
    const n = misses + 1;
    setMisses(n);
    if (n === 1) {
      await speak("Let's try again. " + instruction);
    } else if (n === 2) {
      setReduced(true);
      await speak('Fewer choices. ' + instruction);
    } else {
      setModeled(true);
      await speak(`Watch. The answer is ${correctChoice.speak || correctChoice.label}. Now you tap it.`);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <Subtitle>{instruction}</Subtitle>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {visible.map((c) => (
          <ChoiceButton
            key={c.id}
            onClick={() => handleTap(c)}
            highlight={modeled && c.id === correctId}
            dimmed={done && c.id !== correctId}
          >
            {c.label}
            {c.sub ? <div style={{ fontSize: 20, fontWeight: 600 }}>{c.sub}</div> : null}
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

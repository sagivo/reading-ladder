// Shared UI primitives.
// Interaction grammar: one actionable object per screen, targets >= 48px
// (here: much bigger), replay always visible, audio instruction + visual demo.

import React, { useState, useRef, useEffect } from 'react';
import { narrate as speak, narrateQueue, stop, replayLast, isSoundEnabled, setSoundEnabled } from '../lib/narration.js';
import { celebrate } from '../lib/praise.js';
import { createTrial } from '../lib/quizstep.js';

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
 * Top bar: small home button (top-left) + always-visible replay button
 * and sound toggle (top-right). Replay re-speaks the current instruction.
 */
export function TopBar({ onHome, replayText, replayLabel = '🔁 Hear it again' }) {
  const [on, setOn] = useState(() => isSoundEnabled());
  function toggle() {
    const v = !on;
    setOn(v);
    setSoundEnabled(v);
  }
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {replayText ? (
          <button
            onClick={() => replayLast()}
            style={{
              minHeight: 56, padding: '8px 20px', fontSize: 20, fontWeight: 700,
              borderRadius: 18, border: '3px solid #7c5cd6', background: '#fff',
              color: '#7c5cd6', cursor: 'pointer',
            }}
          >{replayLabel}</button>
        ) : null}
        <button
          onClick={toggle}
          aria-label={on ? 'Sound on' : 'Sound off'}
          aria-pressed={!!on}
          title={on ? 'Sound on' : 'Sound off'}
          style={{
            width: 56, height: 56, fontSize: 26, borderRadius: 18, cursor: 'pointer',
            border: on ? '3px solid #22a06b' : '3px solid #d9d4f5',
            background: on ? '#e7f7ef' : '#fff',
          }}
        >{on ? '🔊' : '🔇'}</button>
      </div>
    </div>
  );
}

/**
 * Grown-up gate: a small arithmetic question a preschooler can't answer
 * (and can't reliably guess repeatedly). Used before any parent-only
 * screen reachable from a kid-facing surface.
 */
export function ParentGate({ onPass, onCancel }) {
  const [a] = useState(4 + Math.floor(Math.random() * 5));
  const [b] = useState(3 + Math.floor(Math.random() * 5));
  const [missed, setMissed] = useState(false);
  const answer = a + b;
  const options = [answer - 1, answer, answer + 1].sort(() => Math.random() - 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <Title>🔒 Grown-ups only</Title>
      <Subtitle>What is {a} + {b}?</Subtitle>
      <div style={{ display: 'flex', gap: 12 }}>
        {options.map((o) => (
          <ChoiceButton
            key={o}
            onClick={() => {
              if (o === answer) { onPass(); return; }
              setMissed(true);
              speak('Try again, grown-up.');
            }}
          >
            <span style={{ fontSize: 36 }}>{o}</span>
          </ChoiceButton>
        ))}
      </div>
      <div aria-live="polite" style={{ minHeight: 30, fontSize: 20, fontWeight: 700, color: '#5b567d', visibility: missed ? 'visible' : 'hidden' }}>
        Not quite — try again.
      </div>
      <button
        onClick={onCancel}
        style={{ background: 'none', border: 'none', color: '#6f66a8', fontSize: 20, textDecoration: 'underline', cursor: 'pointer', minHeight: 48, padding: '8px 16px' }}
      >Back</button>
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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A forgiving multiple-choice trial implementing the error language:
 *  1st miss -> repeat the goal (same choices, re-spoken instruction)
 *  2nd miss -> reduce choices
 *  3rd miss -> model it: highlight the answer, child taps to copy
 * onResult({ correct, modeled, hints }) — correct=false when modeled.
 *
 * Every tap gets immediate gentle VISUAL feedback (a 3-year-old can't rely
 * on audio alone); audio narration mirrors it. Callers must remount per
 * question (key={trial}) so a finished trial never swallows input.
 */
export function QuizStep({ instruction, choices, correctId, onResult, speakInstruction = true }) {
  // Shuffle once per trial: re-shuffling on every render makes the buttons
  // jump around mid-question, which is miserable for a small child.
  const [shuffled] = useState(() => shuffle(choices));
  const trialRef = useRef(null);
  if (!trialRef.current) trialRef.current = createTrial(shuffled, correctId);
  const [, bump] = useState(0);
  const [feedback, setFeedback] = useState(null); // { text } — gentle, never harsh
  const render = () => bump((n) => n + 1);

  const trial = trialRef.current;
  const st = trial.getState();
  const visible = trial.visibleChoices();
  const correctChoice = trial.correctChoice;

  // Speak the instruction when the question appears (audio-first for pre-readers).
  useEffect(() => {
    // Content invariant: an unwinnable question (correct answer not among
    // the choices) must never render silently — it once dead-ended a game.
    if (!shuffled.some((c) => c && c.id === correctId)) {
      console.error(
        `QuizStep: correctId "${correctId}" is not among the choices — this question can never be answered correctly.`
      );
    }
    if (speakInstruction && instruction) {
      speak(instruction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTap(choice) {
    const ev = trial.tap(choice.id);
    if (ev.kind === 'ignored') return;
    render();
    if (ev.kind === 'correct') {
      const praise = randomPraise();
      setFeedback({ text: `🎉 ${praise}` });
      // Celebrate globally AND advance immediately: the praise survives the
      // transition as a floating overlay + uncut audio (praise.js), while the
      // lesson moves on without the old post-correct dead pause that felt
      // "stuck" to small children. onResult must fire synchronously so the
      // parent advances in the same tick as the tap.
      celebrate(`🎉 ${praise}`);
      onResult({ correct: true, modeled: false, hints: ev.hints });
      return;
    }
    if (ev.kind === 'copied') {
      setFeedback({ text: '🎉 Good copying!' });
      celebrate('🎉 Good copying!');
      onResult({ correct: false, modeled: true, hints: 3 });
      return;
    }
    if (ev.kind === 'copy-hint') {
      setFeedback({ text: 'Tap the glowing one! ✨' });
      await speak('Tap the glowing one.');
      return;
    }
    if (ev.kind === 'retry') {
      setFeedback({ text: 'Good try! Listen once more. 🌱' });
      await narrateQueue(["Let's try again.", instruction]);
      return;
    }
    if (ev.kind === 'reduce') {
      setFeedback({ text: "You're working hard — fewer choices now. 💪" });
      await narrateQueue(['Fewer choices.', instruction]);
      return;
    }
    if (ev.kind === 'model') {
      const c = ev.correctChoice || correctChoice;
      setFeedback({ text: 'Watch me, then you tap it! 👀' });
      await narrateQueue(['Watch. The answer is', c.speak || c.label, 'Now you tap it.']);
      return;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>
      <Subtitle>{instruction}</Subtitle>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {visible.map((c) => (
          // Relative wrapper: the speaker is a sibling of the choice button
          // (never nested inside it), so hearing a choice never answers it.
          <div key={c.id} style={{ position: 'relative' }}>
            <ChoiceButton
              onClick={() => handleTap(c)}
              highlight={st.modeled && c.id === correctId}
              dimmed={st.done && c.id !== correctId}
            >
              {c.label}
              {c.sub ? <div style={{ fontSize: 20, fontWeight: 600 }}>{c.sub}</div> : null}
            </ChoiceButton>
            {/* Audio-first for pre-readers: tap the speaker to hear what the
                card says, without answering. Critical for word/picture
                choices a non-reading 3-year-old can't decode visually.
                noRecord: previewing a choice must not steal the "Hear it
                again" slot — that always re-speaks the full question. */}
            <button
              aria-label={`Hear: ${c.speak || c.label}`}
              onClick={() => speak(c.speak || c.label, { noRecord: true })}
              style={{
                position: 'absolute', top: -14, right: -14, width: 52, height: 52,
                borderRadius: '50%', border: '3px solid #7c5cd6', background: '#fff',
                fontSize: 24, cursor: 'pointer', lineHeight: 1,
                boxShadow: '0 2px 8px rgba(80,60,160,0.25)',
              }}
            >
              🔊
            </button>
          </div>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          minHeight: 34, fontSize: 22, fontWeight: 700, color: '#5b567d',
          textAlign: 'center', visibility: feedback ? 'visible' : 'hidden',
        }}
      >
        {feedback ? feedback.text : '·'}
      </div>
    </div>
  );
}

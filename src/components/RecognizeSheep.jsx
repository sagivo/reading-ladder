// RecognizeSheep — v2 rapid recognition game ("tap the running sheep").
// Audio-first: spoken direction + a looping demo (a target sheep pulses)
// until the first tap. Two target sheep among four distractors walk across
// the field; catching both ends the round. Wrong taps wiggle gently — never
// punished, never scolded. Taps on empty space do nothing.

import React, { useState, useEffect, useRef } from 'react';
import { narrate as speak, stop } from '../lib/narration.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Visually confusable pairs — never use one as the other's distractor.
const CONFUSABLE = {
  b: ['d'], d: ['b'], p: ['q'], q: ['p'],
  m: ['w'], w: ['m'], n: ['u'], u: ['n'],
};
const FALLBACK_DISTRACTORS = ['a', 'm', 's', 't', 'f', 'd'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 6 sheep: 2 carry the target grapheme, 4 carry distractors drawn from
// `taught` (excluding the target and its confusables), cycling if needed.
function buildSheep(target, taught) {
  const banned = new Set([target, ...(CONFUSABLE[target] || [])]);
  let pool = (taught || []).filter((g) => !banned.has(g));
  if (pool.length === 0) pool = FALLBACK_DISTRACTORS.filter((g) => !banned.has(g));
  const distractors = [];
  for (let i = 0; i < 4; i++) distractors.push(pool[i % pool.length]);
  const letters = shuffle([target, target, ...distractors]);
  const tops = shuffle([4, 56, 108, 160, 212, 264]);
  return letters.map((letter, i) => ({
    id: `sheep-${i}`,
    letter,
    isTarget: letter === target,
    top: tops[i],
    duration: 7 + ((i * 1.37) % 5), // slightly different speeds, ~7–12s
    delay: -(i * 2.13), // staggered starts
  }));
}

export function RecognizeSheep({ target, say, taught, roundKey, onDone, onHome }) {
  const [sheep, setSheep] = useState(() => buildSheep(target, taught));
  const [status, setStatus] = useState({}); // id -> 'walking' | 'caught' | 'wiggle'
  const [hasTapped, setHasTapped] = useState(false);
  const caughtRef = useRef(new Set());
  const attemptsRef = useRef(0);
  const doneRef = useRef(false);
  const mountedRef = useRef(false);

  const direction = `Tap the sheep with ${say}!`;

  // New round (mount or roundKey change): rebuild the flock and speak the
  // direction. Cleanup always stops narration so it never bleeds screens.
  useEffect(() => {
    mountedRef.current = true;
    caughtRef.current = new Set();
    attemptsRef.current = 0;
    doneRef.current = false;
    setSheep(buildSheep(target, taught));
    setStatus({});
    setHasTapped(false);
    speak(direction);
    return () => {
      mountedRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  // The demo highlights the first target sheep until the child taps anything.
  const demoId = !hasTapped ? (sheep.find((s) => s.isTarget) || {}).id : null;

  async function handleTap(s) {
    const st = status[s.id] || 'walking';
    if (st === 'caught' || doneRef.current) return;
    setHasTapped(true);
    attemptsRef.current += 1;
    if (s.isTarget) {
      caughtRef.current.add(s.id);
      setStatus((prev) => ({ ...prev, [s.id]: 'caught' }));
      if (caughtRef.current.size === 2) {
        doneRef.current = true;
        await speak('Yes!');
        await wait(600);
        if (!mountedRef.current) return;
        onDone({ attempts: attemptsRef.current, hits: 2 });
      }
      return;
    }
    // Wrong sheep: gentle wiggle, keeps walking. No sound, no scolding.
    setStatus((prev) => ({ ...prev, [s.id]: 'wiggle' }));
    setTimeout(() => {
      if (mountedRef.current) {
        setStatus((prev) => ({ ...prev, [s.id]: 'walking' }));
      }
    }, 700);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <style>{`
        @keyframes rsWalk {
          from { left: -150px; }
          to { left: calc(100% + 30px); }
        }
        @keyframes rsHop {
          0%, 100% { transform: translateY(0); }
          35% { transform: translateY(-28px); }
          70% { transform: translateY(0); }
        }
        @keyframes rsWiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-12deg); }
          75% { transform: rotate(12deg); }
        }
        @keyframes rsPulseRing {
          0%, 100% { box-shadow: 0 0 0 6px rgba(124, 92, 214, 0.25); }
          50% { box-shadow: 0 0 0 16px rgba(124, 92, 214, 0.55); }
        }
        @keyframes rsPop {
          from { transform: scale(0) rotate(-30deg); }
          to { transform: scale(1) rotate(0deg); }
        }
      `}</style>

      {/* The field — taps on empty grass do nothing (no onClick here). */}
      <div style={{
        position: 'relative', width: '100%', height: 360, overflow: 'hidden',
        borderRadius: 28, background: 'rgba(255,255,255,0.45)',
        border: '4px solid #d9d4f5',
      }}>
        {sheep.map((s) => {
          const st = status[s.id] || 'walking';
          const caught = st === 'caught';
          return (
            <button
              key={s.id}
              onClick={() => handleTap(s)}
              aria-label="sheep"
              style={{
                position: 'absolute', top: s.top, left: 0,
                width: 'min(30vw, 22vh)', height: 'min(24vw, 18vh)', padding: 0,
                background: 'none', border: 'none', borderRadius: '50%',
                cursor: 'pointer',
                animation: `rsWalk ${s.duration.toFixed(2)}s linear infinite`,
                animationDelay: `${s.delay.toFixed(2)}s`,
                animationPlayState: caught ? 'paused' : 'running',
                // Demo sheep stands still and pulses until the first tap —
                // the child always knows where to start.
                ...(s.id === demoId ? {
                  left: '50%', transform: 'translateX(-50%)',
                  animation: 'rsPulseRing 1.2s ease-in-out infinite',
                  animationDelay: '0s',
                } : {}),
              }}
            >
              <span style={{
                position: 'relative', display: 'inline-block',
                // Mentava-sized: the animal is ~1/4 of screen height.
                fontSize: 'min(22vh, 26vw)', lineHeight: 1,
                animation:
                  caught ? 'rsHop 0.6s ease 2'
                  : st === 'wiggle' ? 'rsWiggle 0.6s ease'
                  : undefined,
              }}>
                🐑
                <span style={{
                  position: 'absolute', top: 0, right: '-0.15em',
                  minWidth: '1.1em', height: '1.1em', padding: '0.05em 0.12em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'min(5.5vh, 6.5vw)', fontWeight: 900, color: '#2d2a45',
                  background: '#fff', border: '0.09em solid #7c5cd6', borderRadius: '0.35em',
                }}>
                  {s.letter}
                </span>
              </span>
              {caught ? (
                <span style={{
                  position: 'absolute', top: '-0.5em', left: '50%', transform: 'translateX(-50%)',
                  fontSize: 'min(6vh, 7vw)', animation: 'rsPop 0.35s ease',
                }}>
                  ⭐
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RecognizeSheep;

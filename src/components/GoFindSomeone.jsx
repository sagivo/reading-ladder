// GoFindSomeone — the social finale (v2).
// "You read a story! Go find someone and read it to them!"
// Confetti + dancing cow + the story shown BIG so the child can "read" it
// to a family member. One unmissable ⭐ button ends the level when the
// child returns. No readable instructions for the child.

import React, { useEffect, useRef } from 'react';
import { narrateQueue, stop } from '../lib/narration.js';
import { Confetti, DanceCow } from './Celebration.jsx';

function FloatingStars() {
  const stars = [
    { left: '8%', size: 44, delay: 0, dur: 2.6 },
    { left: '20%', size: 30, delay: 0.7, dur: 3.1 },
    { left: '78%', size: 52, delay: 0.3, dur: 2.8 },
    { left: '90%', size: 34, delay: 1.1, dur: 3.4 },
  ];
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`@keyframes rl-star-float {
        0%, 100% { transform: translateY(12px) rotate(-10deg); opacity: 0.85; }
        50% { transform: translateY(-18px) rotate(10deg); opacity: 1; }
      }`}</style>
      {stars.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: s.left, top: '12%', fontSize: s.size,
            animation: `rl-star-float ${s.dur}s ${s.delay}s ease-in-out infinite`,
          }}
        >
          ⭐
        </div>
      ))}
    </div>
  );
}

export default function GoFindSomeone({ sentences, onDone, onHome }) {
  const mountedRef = useRef(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    mountedRef.current = true;
    narrateQueue(['You read a story!', 'Go find someone and read it to them!']);
    return () => { mountedRef.current = false; stop(); };
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
      <Confetti />
      <FloatingStars />

      <DanceCow size="min(26vh, 30vw)" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', maxWidth: '92vw' }}>
        {(sentences || []).map((s, i) => (
          <div key={i} style={{ fontSize: 'min(6vh, 7vw)', fontWeight: 800, textAlign: 'center', color: '#2d2a45', lineHeight: 1.3 }}>
            {s}
          </div>
        ))}
      </div>

      {/* The only button: the child (or the grown-up they found) taps it when back. */}
      <button
        onClick={() => { if (mountedRef.current) doneRef.current({}); }}
        aria-label="We read it"
        style={{
          width: 168, height: 168, borderRadius: '50%', fontSize: 100, lineHeight: 1,
          border: '8px solid #ffffff', background: '#f5b301', cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.20)',
          animation: 'rl-star-pulse 1.4s ease-in-out infinite',
        }}
      >
        <style>{`@keyframes rl-star-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }`}</style>
        ⭐
      </button>
    </div>
  );
}

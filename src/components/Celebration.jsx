// Celebration primitives — shared, dependency-free.
// Confetti burst, silly dancing cow, popping star. Emoji art only.

import React, { useEffect, useMemo, useState } from 'react';

const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15', '#ec4899'];

/**
 * Celebratory burst on mount. Hand-rolled: absolutely-positioned divs
 * falling with rotation via CSS keyframes. ~2.5s of fall, removed after.
 * pointer-events: none — never blocks the child's taps.
 */
export function Confetti({ pieces = 90 }) {
  const parts = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.7,
        dur: 1.8 + Math.random() * 1.4,
        size: 8 + Math.random() * 9,
        round: Math.random() > 0.6,
        drift: (Math.random() - 0.5) * 180,
      })),
    [pieces]
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 4200);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998, overflow: 'hidden' }}>
      <style>{`@keyframes rl-confetti-fall {
        0% { transform: translate3d(0, -8vh, 0) rotate(0deg); opacity: 1; }
        100% { transform: translate3d(var(--rl-drift), 112vh, 0) rotate(720deg); opacity: 0.85; }
      }`}</style>
      {parts.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute', top: 0, left: `${p.left}%`,
            width: p.size, height: p.round ? p.size : p.size * 0.55,
            background: p.color, borderRadius: p.round ? '50%' : 2,
            ['--rl-drift']: `${p.drift}px`,
            animation: `rl-confetti-fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.6,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * A 🐄 doing a silly dance: outer element bounces with a wiggle,
 * inner element spins continuously. Two nested animations so the spin
 * never snaps back.
 */
export function DanceCow({ size = 120 }) {
  return (
    <div aria-hidden style={{ display: 'inline-block', animation: 'rl-cow-bounce 0.9s ease-in-out infinite' }}>
      <style>{`@keyframes rl-cow-bounce {
        0%, 100% { transform: translateY(0) skewX(0deg); }
        30% { transform: translateY(-30px) skewX(-7deg); }
        60% { transform: translateY(0) skewX(7deg); }
        80% { transform: translateY(-12px) skewX(-4deg); }
      }
      @keyframes rl-cow-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }`}</style>
      <div style={{ fontSize: size, lineHeight: 1, animation: 'rl-cow-spin 2.4s linear infinite' }}>
        🐄
      </div>
    </div>
  );
}

/** Big ⭐ that pops in with a springy scale, then calls onDone. */
export function StarPop({ onDone, size = 160 }) {
  useEffect(() => {
    const t = setTimeout(() => { if (onDone) onDone(); }, 1300);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div aria-hidden style={{ fontSize: size, lineHeight: 1, animation: 'rl-star-pop 1.2s cubic-bezier(.2,1.6,.4,1) forwards' }}>
      <style>{`@keyframes rl-star-pop {
        0% { transform: scale(0) rotate(-30deg); opacity: 0; }
        60% { transform: scale(1.25) rotate(10deg); opacity: 1; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }`}</style>
      ⭐
    </div>
  );
}

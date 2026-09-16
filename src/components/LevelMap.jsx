// LevelMap — the beanstalk climb (v2).
// Our own take on the level map: not a farm, but a beanstalk the child climbs.
// One node per activity, ordered bottom → top along the stalk. Completed nodes
// hold a star, future nodes are closed buds, and the current node glows — it
// is the only tap target. The child taps it to launch the activity, then
// returns here between activities. No readable instructions for the child:
// spoken direction + pulsing node + ghost-tap demo only. The shell owns all
// chrome (Screen/TopBar/ProgressDots); this is content only.

import React, { useEffect, useMemo } from 'react';
import { narrate as speak, stop } from '../lib/narration.js';

export const MAP_DIRECTION = 'Tap the glowing leaf!';

const STEP_ICONS = {
  discover: '🎁',
  recognize: '🐑',
  recognize2: '🐑',
  blend: '🎤',
  read: '📖',
  perform: '👥',
};

// Node positions along a winding stalk: bottom (first activity) → top (last).
function nodePoints(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = 50 + Math.sin(i * 1.15) * 25;
    const y = n === 1 ? 52 : 86 - (i * 62) / (n - 1);
    pts.push({ x, y });
  }
  return pts;
}

export default function LevelMap({ steps, currentIdx, sound, companion, onPick }) {
  const pts = useMemo(() => nodePoints(steps.length), [steps.length]);

  useEffect(() => {
    speak(MAP_DIRECTION);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A gently waving stalk through the node points (viewBox 0..100).
  const stalkPath = useMemo(() => {
    const all = [{ x: 50, y: 104 }, ...pts];
    return 'M ' + all.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  }, [pts]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '68vh' }}>
      <style>{`
        @keyframes lm-glow {
          0%, 100% { box-shadow: 0 0 0 6px rgba(245, 179, 1, 0.55), 0 0 34px 10px rgba(245, 179, 1, 0.45); transform: translate(-50%, -50%) scale(1); }
          50% { box-shadow: 0 0 0 10px rgba(245, 179, 1, 0.75), 0 0 46px 16px rgba(245, 179, 1, 0.55); transform: translate(-50%, -50%) scale(1.07); }
        }
        @keyframes lm-drift {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(26px); }
        }
        @keyframes lm-ghost-tap {
          0%, 100% { transform: translate(-50%, -8px) scale(1); opacity: 1; }
          50% { transform: translate(-50%, 12px) scale(0.92); opacity: 0.95; }
        }
        @keyframes lm-sway {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }
      `}</style>

      {/* Sun + drifting clouds */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '1%', right: '6%', fontSize: 64, zIndex: 0 }}>☀️</div>
      <div aria-hidden="true" style={{ position: 'absolute', top: '4%', left: '4%', fontSize: 56, zIndex: 0, animation: 'lm-drift 7s ease-in-out infinite' }}>☁️</div>
      <div aria-hidden="true" style={{ position: 'absolute', top: '11%', right: '14%', fontSize: 44, zIndex: 0, animation: 'lm-drift 9s ease-in-out infinite' }}>☁️</div>

      {/* The level's sound on a floating cloud card */}
      <div style={{
        position: 'absolute', top: '1%', left: '50%', transform: 'translateX(-50%)', zIndex: 3,
        background: '#ffffff', borderRadius: 28, padding: '10px 26px',
        border: '4px solid #d9e9f5', boxShadow: '0 6px 18px rgba(90, 140, 190, 0.25)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 64, fontWeight: 900, color: '#2d2a45', lineHeight: 1 }}>{sound.g}</span>
        <span style={{ fontSize: 48, lineHeight: 1 }}>{sound.emoji}</span>
      </div>

      {/* The beanstalk */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, overflow: 'visible' }}
      >
        <path
          d={stalkPath}
          fill="none"
          stroke="#3e9e4f"
          strokeWidth={10}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Leaves + nodes */}
      {pts.map((p, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const leafSide = i % 2 === 0 ? 1 : -1;
        return (
          <React.Fragment key={i}>
            {/* Leaf the node sits on */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 1,
                width: done || current ? 120 : 70, height: done || current ? 72 : 44,
                background: done || current
                  ? 'linear-gradient(135deg, #57b868 0%, #2f8f43 100%)'
                  : 'linear-gradient(135deg, #a9cbb0 0%, #7fa88a 100%)',
                borderRadius: '6px 85% 6px 85%',
                transform: `translate(-50%, -50%) rotate(${leafSide * 28}deg)`,
                transformOrigin: 'center',
                opacity: done || current ? 1 : 0.75,
                animation: current ? 'lm-sway 3.2s ease-in-out infinite' : 'none',
              }}
            />
            {done ? (
              /* Completed: a star resting on the leaf. Not a tap target. */
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 2,
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #ffe9a8 0%, #f5b301 70%)',
                  border: '4px solid #ffffff',
                  boxShadow: '0 4px 14px rgba(245, 179, 1, 0.45)',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 52, lineHeight: 1,
                }}
              >
                ⭐
              </div>
            ) : current ? (
              /* Current: the glowing leaf — the single tap target. */
              <button
                onClick={() => onPick(i)}
                aria-label="Play the next activity"
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 2,
                  width: 116, height: 116, borderRadius: '50%', cursor: 'pointer',
                  background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #fdf3d8 100%)',
                  border: '6px solid #f5b301',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 62, lineHeight: 1, padding: 0,
                  animation: 'lm-glow 1.6s ease-in-out infinite',
                }}
              >
                {STEP_ICONS[steps[i]] || '🌱'}
              </button>
            ) : (
              /* Future: a closed bud. Not interactive. */
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 2,
                  width: 60, height: 60, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #b9d6bf 0%, #8fb898 100%)',
                  border: '3px solid #e4efe6',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
            {current ? (
              <React.Fragment>
                {/* Ghost-tap demo above the glowing node until the child taps. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 3,
                    marginTop: -104, fontSize: 56, pointerEvents: 'none',
                    animation: 'lm-ghost-tap 1.1s ease-in-out infinite',
                  }}
                >
                  👆
                </div>
                {/* The child's companion waits by the next activity. */}
                {companion ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, zIndex: 2,
                      // Flip to the side with room so the companion never clips
                      // off-screen on narrow phones.
                      marginLeft: p.x > 55 ? -168 : 88, marginTop: -34, fontSize: 76, lineHeight: 1,
                      filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.18))',
                    }}
                  >
                    {companion}
                  </div>
                ) : null}
              </React.Fragment>
            ) : null}
          </React.Fragment>
        );
      })}

      {/* Grass tufts at the base — meadow, not farm */}
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-8px', left: '4%', fontSize: 44, zIndex: 1 }}>🌷</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-8px', right: '8%', fontSize: 40, zIndex: 1 }}>🌼</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-6px', left: '38%', fontSize: 52, zIndex: 1 }}>🌱</div>
    </div>
  );
}

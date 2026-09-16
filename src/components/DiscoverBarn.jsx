// DiscoverBarn — v2 new-sound introduction ("open the barn door").
// Audio-first: a non-reading 3-year-old gets a spoken direction + a looping
// ghost-tap demo. The single door tap is the whole interaction — no text
// for the child to read anywhere on this screen.

import React, { useState, useEffect, useRef } from 'react';
import { narrate as speak, narrateQueue, stop } from '../lib/narration.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const DIRECTION = 'Tap the barn!';

export function DiscoverBarn({ sound, onDone, onHome }) {
  const { g, say, keyword, emoji } = sound;
  const [opened, setOpened] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const openedRef = useRef(false);
  const mountedRef = useRef(false);

  // Screen opens with the spoken direction. Cleanup always stops narration
  // so audio never bleeds into the next screen.
  useEffect(() => {
    mountedRef.current = true;
    speak(DIRECTION);
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, []);

  async function handleDoorTap() {
    if (openedRef.current) return;
    openedRef.current = true;
    setOpened(true);
    await wait(950); // let the door swing open
    if (!mountedRef.current) return;
    setRevealed(true);
    await wait(450); // let the letter pop in
    if (!mountedRef.current) return;
    await narrateQueue([
      "Who's inside?",
      `It's ${say}!`,
      `${say}, like ${keyword}.`,
      `Say it with me: ${say}!`,
    ]);
    await wait(1500);
    if (!mountedRef.current) return;
    onDone();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <style>{`
        @keyframes dlDoorPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.045); }
        }
        @keyframes dlGhostTap {
          0%, 100% { transform: translate(-50%, -10px) scale(1); opacity: 1; }
          50% { transform: translate(-50%, 14px) scale(0.9); opacity: 0.95; }
        }
        @keyframes dlRevealPop {
          from { transform: scale(0.3); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Barn — scales with the viewport; the revealed letter is ~1/4 of
          screen height, matching the observed in-app proportion. */}
      <div style={{ position: 'relative', width: 'min(92vw, 66vh)', aspectRatio: '340 / 400', marginTop: '1vh' }}>
        {/* Gambrel roof */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '32%',
          background: '#7a2f26',
          clipPath: 'polygon(50% 0%, 100% 58%, 82% 58%, 82% 100%, 18% 100%, 18% 58%, 0% 58%)',
        }} />
        {/* Body */}
        <div style={{
          position: 'absolute', top: '29%', left: '5.9%', width: '88.2%', height: '71%',
          background: '#d64541', border: '1vmin solid #ffffff', borderRadius: '0 0 2vmin 2vmin',
        }}>
          {/* Hayloft window */}
          <div style={{
            position: 'absolute', top: '3.5%', left: '50%', transform: 'translateX(-50%)',
            width: '18.7%', aspectRatio: '1', borderRadius: '50%', background: '#fdf6e3',
            border: '0.8vmin solid #ffffff', boxShadow: 'inset 0 0 0 0.6vmin #7a2f26',
          }} />

          {/* Dark interior behind the door, revealed on open */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '57.3%', height: '78.9%', background: '#3d2317', borderRadius: '1.5vmin 1.5vmin 0 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            opacity: revealed ? 1 : 0, transition: 'opacity 0.4s ease',
          }}>
            {revealed ? (
              <div style={{ animation: 'dlRevealPop 0.5s ease', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 'min(23vh, 27vw)', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{g}</div>
                <div style={{ fontSize: 'min(13vh, 16vw)', lineHeight: 1, marginTop: '0.5vh' }}>{emoji}</div>
              </div>
            ) : null}
          </div>

          {/* The big door — the single tap target (well over 72px).
              Wrapper centers it; the button itself only pulses / swings. */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '57.3%', height: '78.9%', perspective: 900,
          }}>
            <button
              onClick={handleDoorTap}
              aria-label="Tap the barn"
              style={{
                width: '100%', height: '100%', padding: 0, cursor: 'pointer',
                background: '#8b5a2b',
                backgroundImage:
                  'linear-gradient(45deg, transparent 44%, #ffffff 44%, #ffffff 56%, transparent 56%),' +
                  'linear-gradient(-45deg, transparent 44%, #ffffff 44%, #ffffff 56%, transparent 56%)',
                border: '1vmin solid #5f3c1c', borderBottom: 'none', borderRadius: '1.5vmin 1.5vmin 0 0',
                transformOrigin: 'left center',
                transition: 'transform 0.9s ease',
                ...(opened
                  ? { transform: 'rotateY(-104deg)' }
                  : { animation: 'dlDoorPulse 1.6s ease-in-out infinite' }),
              }}
            />
          </div>

          {/* Looping ghost-tap demo until the child taps the door. */}
          {!opened ? (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', bottom: '52%', left: '50%',
                fontSize: 'min(9vh, 11vw)', pointerEvents: 'none', zIndex: 5,
                animation: 'dlGhostTap 1.1s ease-in-out infinite',
              }}
            >
              👆
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default DiscoverBarn;

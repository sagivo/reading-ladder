// BlendVoice — v2 signature blending mechanic ("keep your voice ON").
// The child holds the big button and says the word's sounds WITHOUT
// stopping. A live mic waveform + a chick that flies while the voice is
// continuous and dips when they pause. No-mic fallback: tap the sounds,
// then "I said it!".
//
// A 3-year-old must operate this by listening + watching: every phase
// opens with a spoken direction and a looping visual demo. No readable
// instructions for the child.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BigButton } from './ui.jsx';
import { narrate as speak, speakSound, speakSoundsSeparately, stop } from '../lib/narration.js';
import { parseGraphemes2, META } from '../lib/curriculum2.js';

const DIGRAPH_COLORS = { sh: '#ffe1a8', ch: '#ffd1dc', th: '#c5e8ff', ng: '#d9f2c7', ck: '#e6dcff' };
const SILENCE_RMS = 0.018;   // below = silence
const DIP_MS = 350;          // voice gap that dips the chick
const MIN_VOICE_MS = 700;    // minimum continuous voice for success

function Tiles({ graphemes, active }) {
  // Mentava-sized: each letter ~1/4+ of viewport height, the word spanning
  // roughly 2/3 of the width. The size is fit-aware: n tiles of ~1.3em plus
  // gaps must fit the viewport width AND the 640px shell column.
  const n = Math.max(1, graphemes.length);
  const ems = n * 1.3 + (n - 1) * 0.35;
  const fs = `min(22vh, ${(92 / ems).toFixed(1)}vw, ${(600 / ems).toFixed(0)}px)`;
  return (
    <div style={{ display: 'flex', gap: '0.35em', justifyContent: 'center', margin: '3vh 0', fontSize: fs }}>
      {graphemes.map((g, i) => (
        <div
          key={i}
          style={{
            minWidth: '1.15em', padding: '0.12em 0.15em', borderRadius: '0.35em',
            background: DIGRAPH_COLORS[g] || '#ffffff',
            border: active === i ? '0.12em solid #7c5cd6' : '0.09em solid #d9d2f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: '#2d2a45', lineHeight: 1.1,
            transform: active === i ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform 150ms',
          }}
        >
          {g}
        </div>
      ))}
    </div>
  );
}

export default function BlendVoice({ words, onDone }) {
  const [wi, setWi] = useState(0);
  const [phase, setPhase] = useState('model'); // model | turn | worddone
  const [mic, setMic] = useState('unknown');   // unknown | ok | blocked
  const [holding, setHolding] = useState(false);
  const [said, setSaid] = useState(0);

  const word = words[wi];
  const graphemes = parseGraphemes2(word);
  const says = graphemes.map((g) => META[g].say);

  const canvasRef = useRef(null);
  const audioRef = useRef({ raf: 0, stream: null, actx: null, analyser: null, buf: null });
  const holdRef = useRef({ holding: false, voiceStart: 0, lastVoice: 0, voicedMs: 0, coached: false, chickY: 0.5 });
  const mountedRef = useRef(true);

  const teardownAudio = useCallback(() => {
    const a = audioRef.current;
    if (a.raf) cancelAnimationFrame(a.raf);
    a.raf = 0;
    if (a.stream) { a.stream.getTracks().forEach((t) => t.stop()); a.stream = null; }
    if (a.actx) { a.actx.close().catch(() => {}); a.actx = null; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    // Ask for the mic as soon as the blend step opens, so the spoken
    // directions match the UI path (hold-the-button vs tap-the-sounds).
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled || !mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        audioRef.current = { raf: 0, stream, actx, analyser, buf: new Float32Array(analyser.fftSize) };
        if (!cancelled && mountedRef.current) setMic('ok');
      } catch {
        if (!cancelled && mountedRef.current) setMic('blocked');
      }
    })();
    return () => { mountedRef.current = false; cancelled = true; stop(); teardownAudio(); };
  }, [teardownAudio]);

  // Model the blend when the word changes (once the mic path is known).
  useEffect(() => {
    if (mic === 'unknown') return;
    let cancelled = false;
    setPhase('model');
    (async () => {
      await speak(mic === 'blocked' ? 'Tap the sounds to hear them!' : 'Keep your voice ON!');
      if (cancelled || !mountedRef.current) return;
      await speakSoundsSeparately(says, { gapMs: 120 });
      if (cancelled || !mountedRef.current) return;
      await speak(mic === 'blocked'
        ? 'Now you! Tap the sounds, say the word, then tap the star!'
        : 'Now you! Hold the button and say the sounds.');
      if (!cancelled && mountedRef.current) setPhase('turn');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wi, mic]);

  const drawWave = useCallback((rms, voice) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx2d.clearRect(0, 0, W, H);
    const a = audioRef.current;
    ctx2d.strokeStyle = voice ? '#22c55e' : '#c4b5fd';
    ctx2d.lineWidth = 3;
    ctx2d.beginPath();
    if (a.analyser && a.buf) {
      a.analyser.getFloatTimeDomainData(a.buf);
      const step = Math.floor(a.buf.length / W);
      for (let x = 0; x < W; x++) {
        const v = a.buf[x * step] || 0;
        const y = H / 2 + v * H * 2.2;
        if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
      }
    } else {
      // Idle demo wave when mic is unavailable.
      const t = Date.now() / 300;
      for (let x = 0; x < W; x++) {
        const y = H / 2 + Math.sin(x / 18 + t) * H * 0.12;
        if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
      }
    }
    ctx2d.stroke();
    void rms;
  }, []);

  const loop = useCallback(() => {
    const a = audioRef.current;
    const h = holdRef.current;
    if (!h.holding) return;
    let rms = 0;
    if (a.analyser && a.buf) {
      a.analyser.getFloatTimeDomainData(a.buf);
      let sum = 0;
      for (let i = 0; i < a.buf.length; i++) sum += a.buf[i] * a.buf[i];
      rms = Math.sqrt(sum / a.buf.length);
    }
    const now = performance.now();
    const voice = rms > SILENCE_RMS;
    if (voice) {
      if (!h.voiceStart) h.voiceStart = now;
      h.lastVoice = now;
    } else if (h.voiceStart && now - h.lastVoice > DIP_MS) {
      if (!h.coached) {
        h.coached = true;
        speak("Keep your voice ON! Don't stop!");
      }
    }
    // Chick flies while voice is continuous, sinks in silence.
    const target = voice ? 0.85 : 0.25;
    h.chickY += (target - h.chickY) * 0.12;
    drawWave(rms, voice);
    a.raf = requestAnimationFrame(loop);
  }, [drawWave]);

  const startHold = useCallback(() => {
    if (holdRef.current.holding || phase !== 'turn') return;
    holdRef.current = { holding: true, voiceStart: 0, lastVoice: 0, voicedMs: 0, coached: false, chickY: 0.5 };
    setHolding(true);
    audioRef.current.raf = requestAnimationFrame(loop);
  }, [loop, phase]);

  const endHold = useCallback(() => {
    const h = holdRef.current;
    if (!h.holding) return;
    h.holding = false;
    setHolding(false);
    const a = audioRef.current;
    if (a.raf) { cancelAnimationFrame(a.raf); a.raf = 0; }
    const voicedMs = h.voiceStart ? h.lastVoice - h.voiceStart : 0;
    const continuous = h.voiceStart && !h.coached && voicedMs >= MIN_VOICE_MS;
    if (continuous) {
      setPhase('worddone');
      const n = said + 1;
      setSaid(n);
      (async () => {
        await speak(`${word}! You said it!`);
        if (!mountedRef.current) return;
        if (wi + 1 >= words.length) onDone({ said: n, total: words.length });
        else setWi(wi + 1);
      })();
    } else if (h.voiceStart) {
      speak('Try again. Keep your voice ON!');
    } else {
      speak('Hold the button and say the sounds.');
    }
  }, [said, wi, word, words.length, onDone]);

  // No-mic path: tap each sound to hear it, say the word aloud, tap the star.
  const saidIt = () => {
    if (phase !== 'turn') return;
    const n = said + 1;
    setSaid(n);
    speak(`${word}! You said it!`).then(() => {
      if (!mountedRef.current) return;
      if (wi + 1 >= words.length) onDone({ said: n, total: words.length });
      else setWi(wi + 1);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <Tiles graphemes={graphemes} active={phase === 'model' ? -1 : undefined} />

      {/* Sky: waveform canvas + flying chick */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, height: 190, background: '#eaf6ff', borderRadius: 24, overflow: 'hidden', border: '4px solid #d9d2f5' }}>
        <canvas ref={canvasRef} width={520} height={120} style={{ position: 'absolute', bottom: 0, width: '100%', height: 120 }} />
        <ChickCanvas chickYRef={holdRef} holding={holding} phase={phase} />
        {/* The dropping chick is the visual signal — no readable text needed. */}
      </div>

      <div style={{ height: 28 }} />

      {mic === 'blocked' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {says.map((s, i) => (
              <BigButton key={i} small onClick={() => speakSound(s, { noRecord: true })}>
                🔊
              </BigButton>
            ))}
          </div>
          {/* Big tappable star — no readable text; the spoken direction
              ("tap the star") is the instruction. */}
          <button
            onClick={saidIt}
            disabled={phase !== 'turn'}
            aria-label="I said it"
            style={{
              width: 168, height: 168, borderRadius: '50%',
              background: phase === 'turn' ? '#ffd94d' : '#e8e4f5',
              border: '8px solid #ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              fontSize: 72, cursor: phase === 'turn' ? 'pointer' : 'default',
              opacity: phase === 'turn' ? 1 : 0.55,
              transform: 'scale(1)', transition: 'transform 120ms',
            }}
          >
            ⭐
          </button>
        </div>
      ) : (
        <button
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={() => { if (holding) endHold(); }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={phase !== 'turn'}
          style={{
            width: 200, height: 200, borderRadius: '50%',
            background: holding ? '#22c55e' : phase === 'turn' ? '#7c5cd6' : '#c4b5fd',
            border: '8px solid #ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            fontSize: 64, cursor: phase === 'turn' ? 'pointer' : 'default',
            opacity: phase === 'turn' ? 1 : 0.55,
            touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
            transform: holding ? 'scale(0.94)' : 'scale(1)', transition: 'transform 120ms',
          }}
          aria-label="Hold and say the sounds"
        >
          🎤
        </button>
      )}
    </div>
  );
}

// Chick overlay drawn on its own canvas, driven by holdRef.chickY.
function ChickCanvas({ chickYRef, holding, phase }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx2d = cv.getContext('2d');
    let raf = 0;
    const draw = () => {
      const W = cv.width, H = cv.height;
      ctx2d.clearRect(0, 0, W, H);
      const y = H - 40 - (chickYRef.current.chickY || 0.5) * (H - 90);
      const bob = holding || phase === 'model' ? Math.sin(Date.now() / 180) * 6 : 0;
      ctx2d.font = '56px serif';
      ctx2d.textAlign = 'center';
      // Chick flies high when the voice is on; sits low otherwise.
      ctx2d.fillText('🐤', W / 2, y + bob);
      // Motion trail when flying high.
      if ((chickYRef.current.chickY || 0) > 0.6) {
        ctx2d.font = '28px serif';
        ctx2d.fillText('💨', W / 2 - 70, y + bob);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chickYRef, holding, phase]);
  return <canvas ref={ref} width={520} height={190} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

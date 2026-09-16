// ReadStory — decodable micro-story reader (v2).
// One sentence at a time, words HUGE and tappable. Multi-letter graphemes
// (sh, ch, th, ng, ck) render as single color-coded units. Tap any word to
// hear it. No readable instructions for the child — spoken direction +
// a pulsing first word demo only.

import React, { useState, useEffect, useRef } from 'react';
import { narrate as speak, stop } from '../lib/narration.js';
import { parseGraphemes2 } from '../lib/curriculum2.js';
import { StarPop } from './Celebration.jsx';

const DIGRAPH_COLORS = { sh: '#ffe1a8', ch: '#ffd1dc', th: '#c5e8ff', ng: '#d9f2c7', ck: '#e6dcff' };
// Mentava's book pages render the NEW letter gold/olive against dark old letters.
const NEW_GOLD = '#b8860b';

function splitWord(raw) {
  const m = String(raw).match(/^([A-Za-z']+)(.*)$/);
  return m ? { core: m[1], punct: m[2] } : { core: String(raw), punct: '' };
}

/** One tappable word: grapheme tiles with digraph color-coding.
 * The level's new grapheme renders gold (Mentava's "training wheels"). */
function WordTile({ raw, demo, onTap, newGrapheme }) {
  const { core, punct } = splitWord(raw);
  const graphemes = parseGraphemes2(core);
  // parseGraphemes2 lowercases; slice the original core so display case survives.
  let ci = 0;
  const display = graphemes.map((g) => {
    const text = core.slice(ci, ci + g.length);
    ci += g.length;
    return { text: text || g, color: DIGRAPH_COLORS[g] || null, isNew: newGrapheme && g === newGrapheme };
  });
  return (
    <button
      onClick={onTap}
      style={{
        minWidth: '2.2em', minHeight: '2.2em', padding: '0.25em 0.4em', margin: '0.18em',
        fontSize: 'min(7.5vh, 8.5vw)', fontWeight: 800, color: '#2d2a45', lineHeight: 1.2,
        background: '#fffdf6', border: demo ? '0.14em solid #7c5cd6' : '0.09em solid #e2d9c2',
        borderRadius: '0.5em', cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(80,60,160,0.12)',
        animation: demo ? 'rl-word-pulse 1.2s ease-in-out infinite' : 'none',
      }}
    >
      {display.map((d, i) => (
        <span key={i} style={{
          ...(d.color ? { background: d.color, borderRadius: '0.25em', padding: '0 0.12em' } : null),
          ...(d.isNew ? { color: NEW_GOLD } : null),
        }}>
          {d.text}
        </span>
      ))}
      <span>{punct}</span>
    </button>
  );
}

export default function ReadStory({ sentences, onDone, onHome, newGrapheme }) {
  const [si, setSi] = useState(0);
  const [demo, setDemo] = useState(true); // pulse the first word until the child taps anything
  const [celebrating, setCelebrating] = useState(false);
  const mountedRef = useRef(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    mountedRef.current = true;
    if (!sentences || !sentences.length) {
      doneRef.current({});
      return undefined;
    }
    speak("Let's read!");
    return () => { mountedRef.current = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentence = (sentences && sentences[si]) || '';
  const words = sentence.split(/\s+/).filter(Boolean);

  const hearWord = (w) => {
    setDemo(false);
    // noRecord: hearing a word must not steal the "Hear it again" slot,
    // which always re-speaks the full direction. Lowercase: the audio
    // catalog keys words in lowercase; display case is preserved.
    speak(splitWord(w).core.toLowerCase(), { noRecord: true });
  };

  const advance = () => {
    setDemo(false);
    if (si + 1 < (sentences || []).length) {
      setSi(si + 1);
      setDemo(true);
    } else {
      setCelebrating(true);
      speak('You did it!');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: '100%' }}>
      <style>{`@keyframes rl-word-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }`}</style>

      {/* Aged-paper book page (Mentava's decodable-book look). */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
        maxWidth: '92vw', padding: '3.5vmin 4vmin', borderRadius: '3vmin',
        background: 'linear-gradient(165deg, #fbf5e4 0%, #f4ead0 60%, #eeddbe 100%)',
        border: '0.6vmin solid #e0d0ac',
        boxShadow: '0 10px 30px rgba(120, 90, 40, 0.18), inset 0 0 60px rgba(160, 120, 60, 0.08)',
      }}>
        {words.map((w, i) => (
          <WordTile key={`${si}-${i}`} raw={w} demo={demo && i === 0} onTap={() => hearWord(w)} newGrapheme={newGrapheme} />
        ))}
      </div>

      {/* Huge green circular advance arrow, bottom-right like the observed app. */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '6vw' }}>
        <button
          onClick={advance}
          aria-label="Next"
          style={{
            width: 'min(22vw, 16vh)', aspectRatio: '1', fontSize: 'min(9vh, 10vw)', borderRadius: '50%',
            border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer',
            boxShadow: '0 6px 0 rgba(0,0,0,0.15)', lineHeight: 1,
          }}
        >
          ➡️
        </button>
      </div>

      {celebrating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9997, display: 'flex',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <StarPop onDone={() => { if (mountedRef.current) doneRef.current({}); }} />
        </div>
      )}
    </div>
  );
}

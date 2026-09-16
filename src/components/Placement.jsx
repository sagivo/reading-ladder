// Placement result: a conversation, not a test score.
// Parent sees known/learning/not-introduced — never a grade label.
// Parent can override the track (adult-gated).

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, TopBar, ParentGate } from './ui.jsx';
import { narrate as speak, stop } from '../lib/narration.js';

export default function Placement({ profile, onStart, onOverride, onHome }) {
  const [gating, setGating] = useState(false);
  const track = profile.placement.track;
  const early = track === 'early';

  useEffect(() => {
    stop();
    speak(early
      ? 'You are ready to be an early reader! You will learn letter sounds and read real words.'
      : 'You are a listening reader! You will play sound games and learn letter sounds by ear.');
  }, []);

  return (
    <Screen>
      <TopBar onHome={onHome} replayText={early ? 'You are an early reader!' : 'You are a listening reader!'} />
      <div style={{ fontSize: 80 }}>{early ? '📖' : '👂'}</div>
      <Title>{early ? 'Early reader!' : 'Listening reader!'}</Title>
      <Subtitle>
        {early
          ? 'The games showed strong listening and letter sounds. Lessons will teach new sounds and real stories to read.'
          : 'The games showed great listening is still growing. Lessons will play with sounds first — no rush into reading words.'}
      </Subtitle>
      {!gating ? (
        <>
          <BigButton color="#22a06b" onClick={() => { speak("Let's go!"); onStart(); }}>
            Start my first lesson ▶
          </BigButton>
          <button
            onClick={() => setGating(true)}
            style={{ background: 'none', border: 'none', color: '#6f66a8', fontSize: 20, textDecoration: 'underline', cursor: 'pointer', minHeight: 48, padding: '8px 16px' }}
          >🔒 Grown-up: switch track</button>
        </>
      ) : (
        <ParentGate
          onCancel={() => setGating(false)}
          onPass={() => { setGating(false); onOverride(track === 'early' ? 'pre' : 'early'); }}
        />
      )}
    </Screen>
  );
}

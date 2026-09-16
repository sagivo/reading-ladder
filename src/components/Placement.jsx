// Placement result: a conversation, not a test score.
// Parent sees known/learning/not-introduced — never a grade label.
// Parent can override the track (adult-gated).

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, TopBar, ChoiceButton } from './ui.jsx';
import { speak, stop } from '../lib/speech.js';

function ParentGate({ onPass, onCancel }) {
  const [a] = useState(4 + Math.floor(Math.random() * 5));
  const [b] = useState(3 + Math.floor(Math.random() * 5));
  const answer = a + b;
  const options = [answer - 1, answer, answer + 1].sort(() => Math.random() - 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <Subtitle>Grown-up check: what is {a} + {b}?</Subtitle>
      <div style={{ display: 'flex', gap: 12 }}>
        {options.map((o) => (
          <ChoiceButton key={o} onClick={() => (o === answer ? onPass() : speak('Try again, grown-up.'))}>
            <span style={{ fontSize: 36 }}>{o}</span>
          </ChoiceButton>
        ))}
      </div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#9a94c7', fontSize: 18, textDecoration: 'underline', cursor: 'pointer' }}>Cancel</button>
    </div>
  );
}

export default function Placement({ profile, onStart, onOverride, onHome }) {
  const [gating, setGating] = useState(false);
  const track = profile.placement.track;
  const early = track === 'early';

  useEffect(() => {
    stop();
    speak(early
      ? `${profile.name}, you are ready to be an early reader! You will learn letter sounds and read real words.`
      : `${profile.name}, you are a listening reader! You will play sound games and learn letter sounds by ear.`);
  }, []);

  return (
    <Screen>
      <TopBar onHome={onHome} replayText={early ? 'You are an early reader!' : 'You are a listening reader!'} />
      <div style={{ fontSize: 80 }}>{early ? '📖' : '👂'}</div>
      <Title>{early ? 'Early reader!' : 'Listening reader!'}</Title>
      <Subtitle>
        {early
          ? 'The games showed strong listening and letter sounds. Lessons will teach new sounds, blending, and real decodable stories.'
          : 'The games showed great listening is still growing. Lessons will play with sounds first — no rush into reading words.'}
      </Subtitle>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 20, width: '100%',
        border: '4px solid #d9d4f5', fontSize: 20, lineHeight: 1.6,
      }}>
        <div>👂 Sound order: <b>{profile.placement.seq}/2</b> · 🗣️ Sound blending: <b>{profile.placement.blend}/2</b> · 🔤 Letter sounds: <b>{profile.placement.letters}/5</b></div>
        <div style={{ color: '#5b567d', fontSize: 17, marginTop: 8 }}>
          Tracks are never locked — the app re-checks every few sessions, and you can always adjust below.
        </div>
      </div>
      {!gating ? (
        <>
          <BigButton color="#22a06b" onClick={() => { speak("Let's go!"); onStart(); }}>
            Start my first lesson ▶
          </BigButton>
          <button
            onClick={() => setGating(true)}
            style={{ background: 'none', border: 'none', color: '#9a94c7', fontSize: 17, textDecoration: 'underline', cursor: 'pointer' }}
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

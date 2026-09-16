// Session end v2 — the fatigue ending.
// "The animals are getting sleepy…" — screens off at mental fatigue,
// celebration of stars earned, "see you tomorrow". No readable directions
// for the child; everything is spoken.

import React, { useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { narrateQueue, stop } from '../lib/narration.js';
import { ACCESSORIES } from '../lib/curriculum.js';

const SLEEPY = ['🦉', '🐻', '🦊', '🐰', '🐼'];

export default function SessionEnd({ profile, summary, unlockedAccessory, onDone, onCompanion }) {
  const levels = summary.levels || [];
  const stars = levels.length;
  const done = !!summary.completedAll;

  useEffect(() => {
    stop();
    const parts = done
      ? ['You learned all the sounds!']
      : ['All done! The animals are getting sleepy.'];
    if (stars > 0) parts.push(`You earned ${stars} ${stars === 1 ? 'star' : 'stars'}!`);
    parts.push('See you tomorrow!');
    narrateQueue(parts);
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const acc = ACCESSORIES.find((a) => a.id === unlockedAccessory);

  return (
    <Screen bg={done
      ? 'linear-gradient(160deg, #7c3aed 0%, #db2777 100%)'
      : 'linear-gradient(160deg, #1f2a5a 0%, #3a2a6e 100%)'}>
      <div style={{ display: 'flex', gap: 12, fontSize: 56, marginTop: 24 }}>
        {(done ? ['🎉', '⭐', '🎊', '🌟', '🥳'] : SLEEPY).map((e, i) => (
          <span key={i} style={{ animation: `snooze 2.4s ease-in-out ${i * 0.3}s infinite`, display: 'inline-block' }}>
            {e}
          </span>
        ))}
      </div>
      <Title><span style={{ color: '#fff' }}>{done ? 'You learned all the sounds! 🎉' : 'All done! 🌙'}</span></Title>
      {!done && (
        <Subtitle><span style={{ color: '#cfd2ff' }}>The animals are getting sleepy…</span></Subtitle>
      )}

      {stars > 0 && (
        <div style={{ display: 'flex', gap: 10, fontSize: 44, flexWrap: 'wrap', justifyContent: 'center' }}>
          {levels.map((lv, i) => (
            <span key={i} title={`Level ${lv}`} style={{ animation: `starpop 0.5s ease-out ${i * 0.15}s both`, display: 'inline-block' }}>⭐</span>
          ))}
        </div>
      )}

      {acc && acc.emoji && (
        <div style={{
          background: '#fff7d6', border: '4px solid #f5b301', borderRadius: 20,
          padding: '14px 22px', fontSize: 22, fontWeight: 700, textAlign: 'center',
        }}>
          🎁 New for your buddy: {acc.emoji} {acc.name}!
          <div><button onClick={onCompanion} style={{ background: 'none', border: 'none', color: '#6f66a8', fontSize: 20, textDecoration: 'underline', cursor: 'pointer', minHeight: 48, padding: '8px 16px' }}>Try it on</button></div>
        </div>
      )}

      <BigButton color="#22a06b" onClick={() => { stop(); onDone(); }}>
        Done — put the tablet away 📴
      </BigButton>
      <style>{`
        @keyframes snooze { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(10px) rotate(-6deg); } }
        @keyframes starpop { 0% { transform: scale(0); } 70% { transform: scale(1.3); } 100% { transform: scale(1); } }
      `}</style>
    </Screen>
  );
}

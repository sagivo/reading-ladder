// Companion picker: finite cosmetic customization (the only reward).
// Accessories unlock one per completed session — no grinding, no randomness.

import React, { useEffect, useState } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { narrate as speak, stop } from '../lib/narration.js';
import { COMPANIONS, COMPANION_COLORS, ACCESSORIES } from '../lib/curriculum.js';
import { companionBg } from './Home.jsx';

export default function Companion({ profile, onChange, onBack }) {
  const c = profile.companion;
  // Visible echo of the spoken locked-accessory explanation: spoken-only
  // feedback is silent in a muted room, so the child also SEES it.
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    stop();
    speak('Pick your buddy! Tap an animal, then a color. Finish lessons to earn more accessories.');
  }, []);

  function set(patch) {
    onChange({ ...c, ...patch });
  }

  const preview = { ...c };
  const acc = ACCESSORIES.find((a) => a.id === preview.accessory);

  return (
    <Screen>
      <Title>Your reading buddy 🐾</Title>
      <div style={{
        width: 150, height: 150, borderRadius: '50%', fontSize: 84,
        background: companionBg(preview), display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {(COMPANIONS.find((x) => x.id === preview.animal) || COMPANIONS[0]).emoji}{acc ? acc.emoji : ''}
      </div>

      <Subtitle>Pick your buddy</Subtitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {COMPANIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => set({ animal: a.id })}
            style={{
              width: 84, height: 84, fontSize: 44, borderRadius: 22, cursor: 'pointer', background: '#fff',
              border: c.animal === a.id ? '5px solid #7c5cd6' : '3px solid #e4e0f7',
            }}
          >{a.emoji}</button>
        ))}
      </div>

      <Subtitle>Pick a color</Subtitle>
      <div style={{ display: 'flex', gap: 12 }}>
        {COMPANION_COLORS.map((col) => (
          <button
            key={col.id}
            onClick={() => set({ color: col.id })}
            aria-label={col.id}
            style={{
              width: 64, height: 64, borderRadius: '50%', cursor: 'pointer', background: col.bg,
              border: c.color === col.id ? '5px solid #7c5cd6' : '3px solid #e4e0f7',
            }}
          />
        ))}
      </div>

      <Subtitle>Accessories — earn one per lesson 🎁</Subtitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {ACCESSORIES.map((a) => {
          const unlocked = c.unlocked.includes(a.id);
          return (
            <button
              key={a.id}
              // Never dead-disabled: tapping a locked accessory explains how
              // to earn it instead of silently swallowing the tap.
              aria-disabled={!unlocked}
              onClick={() => {
                if (unlocked) { set({ accessory: a.id }); setMsg(null); }
                else {
                  setMsg('🎁 Finish a lesson to earn a new accessory!');
                  speak('Finish a lesson to earn a new accessory!');
                }
              }}
              title={a.name}
              style={{
                width: 84, height: 84, fontSize: 40, borderRadius: 22,
                cursor: 'pointer', background: '#fff',
                border: c.accessory === a.id ? '5px solid #7c5cd6' : '3px solid #e4e0f7',
                opacity: unlocked ? 1 : 0.4,
              }}
            >{unlocked ? (a.emoji || '🚫') : '🔒'}</button>
          );
        })}
      </div>

      <div aria-live="polite" style={{
        minHeight: 34, fontSize: 22, fontWeight: 700, color: '#5b567d',
        textAlign: 'center', visibility: msg ? 'visible' : 'hidden',
      }}>{msg || '·'}</div>

      <BigButton small onClick={onBack}>Done ✓</BigButton>
    </Screen>
  );
}

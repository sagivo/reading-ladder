// Companion picker: finite cosmetic customization (the only reward).
// Accessories unlock one per completed session — no grinding, no randomness.

import React from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { COMPANIONS, COMPANION_COLORS, ACCESSORIES } from '../lib/curriculum.js';
import { companionBg } from './Home.jsx';

export default function Companion({ profile, onChange, onBack }) {
  const c = profile.companion;

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
              disabled={!unlocked}
              onClick={() => set({ accessory: a.id })}
              title={a.name}
              style={{
                width: 84, height: 84, fontSize: 40, borderRadius: 22,
                cursor: unlocked ? 'pointer' : 'default', background: '#fff',
                border: c.accessory === a.id ? '5px solid #7c5cd6' : '3px solid #e4e0f7',
                opacity: unlocked ? 1 : 0.4,
              }}
            >{unlocked ? (a.emoji || '🚫') : '🔒'}</button>
          );
        })}
      </div>

      <BigButton small onClick={onBack}>Done ✓</BigButton>
    </Screen>
  );
}

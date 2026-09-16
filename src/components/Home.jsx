// Home: profile picker + lesson entry.
// Kid-facing, but the whole app sits behind the parent's login (App.jsx
// auth gate), so no kid access is possible without a signed-in parent.
// Adding/editing readers moved to the parent-only Kids screen.

import React from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { speak } from '../lib/speech.js';
import { COMPANIONS, COMPANION_COLORS, ACCESSORIES } from '../lib/curriculum.js';

export function companionEmoji(c) {
  const a = COMPANIONS.find((x) => x.id === c.animal) || COMPANIONS[0];
  const acc = ACCESSORIES.find((x) => x.id === c.accessory);
  return acc && acc.emoji ? a.emoji + acc.emoji : a.emoji;
}

export function companionBg(c) {
  return (COMPANION_COLORS.find((x) => x.id === c.color) || COMPANION_COLORS[0]).bg;
}

function ProfileCard({ p, onTap }) {
  return (
    <button
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, width: '100%',
        padding: 16, borderRadius: 24, border: '4px solid #d9d4f5',
        background: '#fff', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{
        width: 84, height: 84, borderRadius: '50%', fontSize: 44,
        background: companionBg(p.companion), display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {companionEmoji(p.companion)}
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{p.avatar} {p.name}</div>
        <div style={{ fontSize: 18, color: '#5b567d' }}>
          {p.track === 'early' ? '📖 Early reader' : p.track === 'pre' ? '👂 Listening reader' : '✨ New reader'}
          {' · '}
          {p.sessions.length} {p.sessions.length === 1 ? 'lesson' : 'lessons'} done
        </div>
      </div>
    </button>
  );
}

export default function Home({ profiles, activeId, onSelect, onParent, onManageKids, soundOn, onToggleSound }) {
  const active = profiles.find((p) => p.id === activeId);

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={onToggleSound}
          aria-label="Sound on/off"
          style={{ width: 56, height: 56, fontSize: 26, borderRadius: 18, border: '3px solid #d9d4f5', background: '#fff', cursor: 'pointer' }}
        >{soundOn ? '🔊' : '🔇'}</button>
      </div>

      <div style={{ fontSize: 64 }}>🪜📖</div>
      <Title>The Reading Ladder</Title>

      {profiles.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <Subtitle>No readers yet — a grown-up can add the first reader to begin.</Subtitle>
          <BigButton onClick={onManageKids}>+ Add a reader</BigButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          {profiles.map((p) => (
            <ProfileCard key={p.id} p={p} onTap={() => { speak(`Hi ${p.name}!`); onSelect(p.id); }} />
          ))}
          <button
            onClick={onManageKids}
            style={{
              padding: 14, borderRadius: 24, border: '4px dashed #b9b3d6', background: 'transparent',
              fontSize: 22, fontWeight: 700, color: '#7c5cd6', cursor: 'pointer',
            }}
          >+ Add a reader</button>
        </div>
      )}

      {active && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <BigButton
            color="#22a06b"
            onClick={() => { speak(`Let's read, ${active.name}!`); onSelect(active.id, true); }}
          >
            {active.track ? "▶ Start today's lesson" : '▶ Play the reading game'}
          </BigButton>
          <Subtitle>{active.track ? 'One lesson a day. About 12 minutes.' : 'A 4-minute game finds your starting spot.'}</Subtitle>
        </div>
      )}

      <button
        onClick={onParent}
        style={{
          marginTop: 24, background: 'none', border: 'none', color: '#9a94c7',
          fontSize: 18, textDecoration: 'underline', cursor: 'pointer',
        }}
      >🔒 Grown-up corner</button>
    </Screen>
  );
}

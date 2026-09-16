// Home: profile picker + lesson entry.
// Kid-facing, but the whole app sits behind the parent's login (App.jsx
// auth gate), so no kid access is possible without a signed-in parent.
// Adding/editing readers moved to the parent-only Kids screen.

import React from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { narrate as speak } from '../lib/narration.js';
import { COMPANIONS, COMPANION_COLORS, ACCESSORIES } from '../lib/curriculum.js';

export function companionEmoji(c) {
  const a = COMPANIONS.find((x) => x.id === c.animal) || COMPANIONS[0];
  const acc = ACCESSORIES.find((x) => x.id === c.accessory);
  return acc && acc.emoji ? a.emoji + acc.emoji : a.emoji;
}

export function companionBg(c) {
  return (COMPANION_COLORS.find((x) => x.id === c.color) || COMPANION_COLORS[0]).bg;
}

function ProfileCard({ p, onTap, selected }) {
  return (
    <button
      onClick={onTap}
      aria-pressed={!!selected}
      aria-label={`${p.name}${selected ? ', selected' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, width: '100%',
        padding: 16, borderRadius: 24,
        border: selected ? '4px solid #7c5cd6' : '4px solid #d9d4f5',
        background: selected ? '#f4f1ff' : '#fff',
        boxShadow: selected ? '0 0 0 4px #e2dcfa' : 'none',
        cursor: 'pointer', textAlign: 'left', position: 'relative',
      }}
    >
      <div style={{
        width: 84, height: 84, borderRadius: '50%', fontSize: 44,
        background: companionBg(p.companion), display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {p.avatar}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{p.name}</div>
        <div style={{ fontSize: 18, color: '#5b567d' }}>
          {p.track === 'early' ? '📖 Early reader' : p.track === 'pre' ? '👂 Listening reader' : '✨ New reader'}
          {' · '}
          {p.sessions.length} {p.sessions.length === 1 ? 'lesson' : 'lessons'} done
        </div>
      </div>
      {selected && (
        <div
          aria-hidden="true"
          style={{
            width: 44, height: 44, borderRadius: '50%', background: '#7c5cd6',
            color: '#fff', fontSize: 26, fontWeight: 900, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >✓</div>
      )}
    </button>
  );
}

export default function Home({ profiles, activeId, onSelect, onParent, onManageKids, soundOn, onToggleSound, resumeFor, onResume }) {
  const active = profiles.find((p) => p.id === activeId);
  const resume = active && resumeFor ? resumeFor(active.id) : null;

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={onToggleSound}
          aria-label={soundOn ? 'Sound on' : 'Sound off'}
          aria-pressed={!!soundOn}
          title={soundOn ? 'Sound on' : 'Sound off'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', fontSize: 22, borderRadius: 18, cursor: 'pointer',
            border: soundOn ? '3px solid #22a06b' : '3px solid #d9d4f5',
            background: soundOn ? '#e7f7ef' : '#fff', fontWeight: 800, color: '#2b2b3a',
          }}
        >
          <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
          <span style={{ fontSize: 17 }}>{soundOn ? 'Sound on' : 'Sound off'}</span>
        </button>
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
            <ProfileCard
              key={p.id}
              p={p}
              selected={p.id === activeId}
              onTap={() => { speak(`Hi ${p.name}!`); onSelect(p.id); }}
            />
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
          {resume && onResume ? (
            <BigButton
              color="#22a06b"
              onClick={() => { speak(`Welcome back, ${active.name}! Let's keep going.`); onResume(active.id); }}
            >
              ⏯ Continue {active.name}'s lesson
            </BigButton>
          ) : (
            <BigButton
              color="#22a06b"
              onClick={() => { speak(`Let's read, ${active.name}!`); onSelect(active.id, true); }}
            >
              {active.track ? `▶ Start ${active.name}'s lesson` : `▶ Play ${active.name}'s reading game`}
            </BigButton>
          )}
          <Subtitle>{active.track ? 'One lesson a day. About 12 minutes.' : 'A 4-minute game finds your starting spot.'}</Subtitle>
          <div style={{ fontSize: 16, color: '#7c5cd6', fontWeight: 700 }} aria-live="polite">
            ✓ {active.name} is selected
          </div>
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

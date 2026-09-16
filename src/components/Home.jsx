// Home: profile picker + kid-friendly profile creation + lesson entry.
// No adult signup/auth — family-device scenario: kid taps their name.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle, ChoiceButton } from './ui.jsx';
import { speak } from '../lib/speech.js';
import { COMPANIONS, COMPANION_COLORS, ACCESSORIES } from '../lib/curriculum.js';

const AVATARS = ['🦊', '🐰', '🦉', '🐢', '🐵', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐝'];

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

function CreateProfile({ onCreate, onCancel, hasProfiles }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
      <Title>{hasProfiles ? 'Add a reader' : "Who's reading today?"}</Title>
      <Subtitle>A grown-up can type the name. Then the reader picks a face.</Subtitle>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        maxLength={20}
        style={{
          fontSize: 28, padding: '14px 20px', borderRadius: 20, border: '4px solid #d9d4f5',
          width: '100%', maxWidth: 340, textAlign: 'center',
        }}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
        {AVATARS.map((a) => (
          <button
            key={a}
            onClick={() => setAvatar(a)}
            style={{
              width: 64, height: 64, fontSize: 34, borderRadius: 18, cursor: 'pointer',
              border: avatar === a ? '5px solid #7c5cd6' : '3px solid #e4e0f7', background: '#fff',
            }}
          >{a}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {hasProfiles && <BigButton small color="#9a94c7" onClick={onCancel}>Back</BigButton>}
        <BigButton
          small
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), avatar)}
        >
          Start reading 📚
        </BigButton>
      </div>
    </div>
  );
}

export default function Home({ profiles, activeId, onSelect, onCreate, onParent, soundOn, onToggleSound }) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const active = profiles.find((p) => p.id === activeId);

  React.useEffect(() => {
    if (profiles.length === 0) setCreating(true);
  }, [profiles.length]);

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

      {creating ? (
        <CreateProfile
          hasProfiles={profiles.length > 0}
          onCancel={() => setCreating(false)}
          onCreate={(name, avatar) => { setCreating(false); onCreate(name, avatar); }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
          {profiles.map((p) => (
            <ProfileCard key={p.id} p={p} onTap={() => { speak(`Hi ${p.name}!`); onSelect(p.id); }} />
          ))}
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: 14, borderRadius: 24, border: '4px dashed #b9b3d6', background: 'transparent',
              fontSize: 22, fontWeight: 700, color: '#7c5cd6', cursor: 'pointer',
            }}
          >+ Add a reader</button>
        </div>
      )}

      {active && !creating && (
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

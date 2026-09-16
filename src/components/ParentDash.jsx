// Parent dashboard: adult-gated, read-only.
// Answers four questions: what can my child do, where are they stuck,
// how much screen time, what comes next. Plus sync status.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle, ChoiceButton } from './ui.jsx';
import { speak } from '../lib/speech.js';
import { SOUNDS, PREVIEW_WORDS } from '../lib/curriculum.js';
import { nextTargetIndex, pendingMisses } from '../lib/mastery.js';
import { getSyncState, syncNow } from '../lib/sync.js';
import { pendingCount } from '../lib/store.js';

function Gate({ onPass, onCancel }) {
  const [a] = useState(4 + Math.floor(Math.random() * 5));
  const [b] = useState(3 + Math.floor(Math.random() * 5));
  const answer = a + b;
  const options = [answer - 1, answer, answer + 1].sort(() => Math.random() - 0.5);
  return (
    <Screen>
      <Title>🔒 Grown-ups only</Title>
      <Subtitle>What is {a} + {b}?</Subtitle>
      <div style={{ display: 'flex', gap: 12 }}>
        {options.map((o) => (
          <ChoiceButton key={o} onClick={() => (o === answer ? onPass() : speak('Try again.'))}>
            <span style={{ fontSize: 36 }}>{o}</span>
          </ChoiceButton>
        ))}
      </div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#9a94c7', fontSize: 18, textDecoration: 'underline', cursor: 'pointer' }}>Back</button>
    </Screen>
  );
}

const STATUS_STYLE = {
  mastered: { bg: '#dcfce7', border: '#22a06b', label: 'mastered' },
  learning: { bg: '#fef9c3', border: '#f5b301', label: 'learning' },
  introduced: { bg: '#f1f0fa', border: '#d9d4f5', label: 'introduced' },
  todo: { bg: '#ffffff', border: '#e4e0f7', label: 'not yet' },
};

function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: 20, width: '100%', border: '3px solid #e4e0f7' }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Dashboard({ profiles, activeId, onSelectProfile, onOverrideTrack, onBack, store, refreshSync }) {
  const [syncing, setSyncing] = useState(false);
  const sync = { ...getSyncState(), pending: pendingCount(store) };
  const p = profiles.find((x) => x.id === activeId) || profiles[0];

  if (!p) {
    return (
      <Screen>
        <Title>Grown-up corner</Title>
        <Subtitle>No reader profiles yet. Create one on the home screen to begin.</Subtitle>
        <BigButton small onClick={onBack}>Back</BigButton>
      </Screen>
    );
  }

  const targetIdx = nextTargetIndex(p, SOUNDS);
  const target = SOUNDS[targetIdx];
  const misses = pendingMisses(p, 10);
  const totalMinutes = p.sessions.reduce((n, s) => n + (s.minutes || 0), 0);
  const masteredCount = Object.values(p.mastery).filter((m) => m.status === 'mastered').length;

  async function doSync() {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
    refreshSync();
  }

  const syncLabel =
    sync.state === 'syncing' || syncing ? '🔄 Syncing…' :
    sync.pending > 0 ? `📴 Offline — ${sync.pending} event${sync.pending === 1 ? '' : 's'} waiting to sync` :
    sync.state === 'offline' ? '📴 Offline — will sync when connected' :
    '✅ Synced';

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center' }}>
        <BigButton small color="#9a94c7" onClick={onBack}>‹ Back</BigButton>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {profiles.map((x) => (
            <button
              key={x.id}
              onClick={() => onSelectProfile(x.id)}
              style={{
                padding: '8px 16px', borderRadius: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                border: x.id === p.id ? '4px solid #7c5cd6' : '3px solid #e4e0f7', background: '#fff',
              }}
            >{x.avatar} {x.name}</button>
          ))}
        </div>
      </div>

      <Title>{p.avatar} {p.name} <span style={{ fontSize: 20, fontWeight: 600, color: '#5b567d' }}>
        ({p.track === 'early' ? 'early reader' : p.track === 'pre' ? 'listening reader' : 'not placed yet'})
      </span></Title>

      <Card title="🔄 Sync status">
        <div style={{ fontSize: 19 }}>{syncLabel}</div>
        {sync.error && <div style={{ fontSize: 16, color: '#a33' }}>{sync.error}</div>}
        {sync.pending > 0 && <div style={{ marginTop: 8 }}><BigButton small onClick={doSync}>Sync now</BigButton></div>}
        <div style={{ fontSize: 15, color: '#5b567d', marginTop: 8 }}>
          Lessons always work offline. Progress is stored on this device first, then synced to the family database when connected.
        </div>
      </Card>

      <Card title="📊 What can they do now?">
        <div style={{ fontSize: 19 }}>
          <b>{masteredCount}</b> sounds mastered · <b>{p.sessions.length}</b> lessons completed · <b>{totalMinutes}</b> min total
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {SOUNDS.map((s) => {
            const m = p.mastery[s.g];
            const st = m ? STATUS_STYLE[m.status] || STATUS_STYLE.todo : STATUS_STYLE.todo;
            return (
              <div
                key={s.g}
                title={`${s.g} (${s.say}): ${st.label}`}
                style={{
                  width: 46, height: 52, borderRadius: 12, background: st.bg, border: `3px solid ${st.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 800,
                }}
              >{s.g}</div>
            );
          })}
        </div>
        <div style={{ fontSize: 15, color: '#5b567d', marginTop: 8 }}>
          🟩 mastered · 🟨 learning · ⬜ introduced / not yet
        </div>
      </Card>

      <Card title="🧭 Where are they stuck?">
        {misses.length === 0 ? (
          <div style={{ fontSize: 19 }}>No open misses — nothing needs review. 🎉</div>
        ) : (
          <div style={{ fontSize: 19 }}>
            {misses.length} item{misses.length === 1 ? '' : 's'} queued for review:{' '}
            {misses.map((m) => m.ref).join(', ')}
            <div style={{ fontSize: 16, color: '#5b567d', marginTop: 6 }}>
              These resurface automatically at the start of the next lesson.
            </div>
          </div>
        )}
      </Card>

      <Card title="⏱️ Screen time">
        <div style={{ fontSize: 19 }}>
          {p.sessions.length} lessons · {totalMinutes} minutes total
          {p.sessions.length > 0 && <> · last: {p.sessions[p.sessions.length - 1].minutes} min</>}
        </div>
        <div style={{ fontSize: 16, color: '#5b567d', marginTop: 6 }}>
          Design target: 8–18 minutes per lesson, then the tablet goes away.
        </div>
      </Card>

      <Card title="➡️ What comes next?">
        <div style={{ fontSize: 19 }}>
          Next sound: <b>{target.g}</b> (/{target.say}/, like {target.emoji} {target.keyword})
        </div>
        {p.lastMission && (
          <div style={{ fontSize: 17, marginTop: 6 }}>Last offline mission: “{p.lastMission}”</div>
        )}
        <div style={{ fontSize: 16, color: '#5b567d', marginTop: 6 }}>
          Story preview words (taught explicitly, may contain untaught sounds): {PREVIEW_WORDS.join(', ')}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => onOverrideTrack(p.id, p.track === 'early' ? 'pre' : 'early')}
            style={{ background: 'none', border: 'none', color: '#7c5cd6', fontSize: 17, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Switch track to {p.track === 'early' ? 'listening reader' : 'early reader'}
          </button>
        </div>
      </Card>
    </Screen>
  );
}

export default function ParentDash(props) {
  const [passed, setPassed] = useState(false);
  const [nonce, setNonce] = useState(0);
  if (!passed) return <Gate onPass={() => setPassed(true)} onCancel={props.onBack} />;
  return <Dashboard {...props} refreshSync={() => setNonce(nonce + 1)} />;
}

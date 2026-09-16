// Parent dashboard: adult-gated, read-only.
// Answers four questions: what can my child do, where are they stuck,
// how much screen time, what comes next. Plus sync status.
// Parent-only: sits behind the app's parent-login gate AND the math gate below.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle, ChoiceButton } from './ui.jsx';
import { narrate as speak, setVoice as previewVoice, getVoice, VOICES } from '../lib/narration.js';
import { SOUNDS, PREVIEW_WORDS } from '../lib/curriculum.js';
import { nextTargetIndex, pendingMisses } from '../lib/mastery.js';
import { getSyncState, syncNow } from '../lib/sync.js';
import { isAuthError, friendlyError } from '../lib/auth.js';
import { pendingCount } from '../lib/store.js';

function Gate({ onPass, onCancel }) {
  const [a] = useState(4 + Math.floor(Math.random() * 5));
  const [b] = useState(3 + Math.floor(Math.random() * 5));
  const [missed, setMissed] = useState(false);
  const answer = a + b;
  const options = [answer - 1, answer, answer + 1].sort(() => Math.random() - 0.5);
  return (
    <Screen>
      <Title>🔒 Grown-ups only</Title>
      <Subtitle>{`What is ${a} + ${b}?`}</Subtitle>
      <div style={{ display: 'flex', gap: 12 }}>
        {options.map((o) => (
          <ChoiceButton
            key={o}
            onClick={() => {
              if (o === answer) { onPass(); return; }
              setMissed(true);
              speak('Try again.');
            }}
          >
            <span style={{ fontSize: 36 }}>{o}</span>
          </ChoiceButton>
        ))}
      </div>
      <div aria-live="polite" style={{ minHeight: 30, fontSize: 19, fontWeight: 700, color: '#5b567d', visibility: missed ? 'visible' : 'hidden' }}>
        Not quite — try again.
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

function Dashboard({ profiles, activeId, onSelectProfile, onOverrideTrack, onSetVoice, onBack, store, refreshSync, parent, onLogout, onManageKids, onSessionExpired }) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [confirmTrack, setConfirmTrack] = useState(false);
  const [trackMsg, setTrackMsg] = useState(null);
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
    setSyncError(null);
    try {
      await syncNow();
    } catch (e) {
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      console.warn('manual sync failed', e);
      setSyncError(friendlyError(e));
    } finally {
      setSyncing(false);
      refreshSync();
    }
  }

  // Honest sync labeling: a non-empty queue is NOT "offline". The old label
  // said "📴 Offline — N events waiting" for ANY pending count, which hid
  // real server errors (and once hid a D1 500) behind a connectivity story.
  const pendingN = sync.pending || 0;
  const pendingBit = pendingN > 0 ? ` (${pendingN} waiting)` : '';
  const syncLabel =
    sync.state === 'auth' ? '🔒 Signed out — please sign in again' :
    sync.state === 'syncing' || syncing ? '🔄 Syncing…' :
    sync.state === 'server_error' ? `⚠️ Couldn't sync just now — progress is safe on this device${pendingBit}` :
    sync.state === 'offline' ? `📴 Offline — will sync when connected${pendingBit}` :
    pendingN > 0 ? `⏳ ${pendingN} change${pendingN === 1 ? '' : 's'} waiting to sync` :
    sync.lastSyncAt ? '✅ Synced' :
    '⏳ Waiting for first sync';

  const shownError = syncError || (sync.state !== 'auth' ? sync.error : null);

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <BigButton small color="#9a94c7" onClick={onBack}>‹ Back</BigButton>
        <BigButton small onClick={onManageKids}>👥 Manage kids</BigButton>
        <div style={{ flex: 1 }} />
        <BigButton small color="#b0655a" onClick={onLogout}>🚪 Log out</BigButton>
      </div>
      {parent && parent.email && (
        <div style={{ fontSize: 16, color: '#5b567d' }}>Signed in as {parent.email}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {profiles.map((x) => (
          <button
            key={x.id}
            onClick={() => onSelectProfile(x.id)}
            style={{
              padding: '8px 16px', borderRadius: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer',
              border: x.id === (p && p.id) ? '4px solid #7c5cd6' : '3px solid #e4e0f7', background: '#fff',
            }}
          >{x.avatar} {x.name}</button>
        ))}
      </div>

      {/* Narration voice picker (per kid, synced). Preview plays instantly. */}
      <div style={{ marginTop: 18, padding: 16, background: '#f4f1ff', borderRadius: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Narration voice for {p.name}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(VOICES).map(([id, v]) => {
            const selected = (p.voice || 'sarah') === id;
            return (
              <button
                key={id}
                onClick={() => { onSetVoice(p.id, id); previewVoice(id); speak(`Hi! I'm ${v.label}. Pick a story and I'll read it to you.`); }}
                aria-pressed={selected}
                style={{
                  padding: '10px 18px', borderRadius: 16, fontSize: 17, fontWeight: 700, cursor: 'pointer',
                  border: selected ? '4px solid #7c5cd6' : '3px solid #d9d3f2',
                  background: selected ? '#e6dcff' : '#fff',
                }}
              >{selected ? '✓ ' : ''}{v.label} — {v.hint}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: '#6b6390', marginTop: 8 }}>
          Voices are pre-recorded — switching is instant.
        </div>
      </div>

      <Title>{p.avatar} {p.name} <span style={{ fontSize: 20, fontWeight: 600, color: '#5b567d' }}>
        ({p.track === 'early' ? 'early reader' : p.track === 'pre' ? 'listening reader' : 'not placed yet'})
      </span></Title>

      <Card title="🔄 Sync status">
        <div style={{ fontSize: 19 }}>{syncLabel}</div>
        {shownError && <div style={{ fontSize: 16, color: '#a33', marginTop: 6 }}>{shownError}</div>}
        {(sync.pending > 0 || shownError) && <div style={{ marginTop: 8 }}><BigButton small onClick={doSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now 🔄'}</BigButton></div>}
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
          {!confirmTrack ? (
            <button
              onClick={() => setConfirmTrack(true)}
              style={{ background: 'none', border: 'none', color: '#7c5cd6', fontSize: 17, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Switch track to {p.track === 'early' ? 'listening reader' : 'early reader'}
            </button>
          ) : (
            <div style={{ background: '#f4f1ff', border: '3px solid #7c5cd6', borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
                Switch {p.name} to the {p.track === 'early' ? 'listening reader' : 'early reader'} track?
                Their lesson plan restarts on the new track.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    const next = p.track === 'early' ? 'pre' : 'early';
                    onOverrideTrack(p.id, next);
                    setConfirmTrack(false);
                    setTrackMsg(`✓ ${p.name} is now on the ${next === 'early' ? 'early reader' : 'listening reader'} track.`);
                  }}
                  style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: '#7c5cd6', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}
                >
                  Yes, switch
                </button>
                <button
                  onClick={() => setConfirmTrack(false)}
                  style={{ padding: '10px 18px', borderRadius: 14, border: '3px solid #d9d4f5', background: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}
                >
                  Keep current track
                </button>
              </div>
            </div>
          )}
          {trackMsg && (
            <div role="status" style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: '#22a06b' }}>
              {trackMsg}
            </div>
          )}
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

// Parent dashboard: adult-gated, read-only.
// Answers four questions: what can my child do, where are they stuck,
// how much screen time, what comes next. Plus sync status.
// Parent-only: sits behind the app's parent-login gate AND the math gate below.

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, ChoiceButton } from './ui.jsx';
import { narrate as speak } from '../lib/narration.js';
import { ORDER, META, levelOfGrapheme, newSound, levelKind, ensureV2Profile } from '../lib/curriculum2.js';
import { getSyncState, syncNow, onSyncState } from '../lib/sync.js';
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
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#6f66a8', fontSize: 20, textDecoration: 'underline', cursor: 'pointer', minHeight: 48, padding: '8px 16px' }}>Back</button>
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

function Dashboard({ profiles, activeId, onSelectProfile, onOverrideTrack, onBack, store, refreshSync, parent, onLogout, onManageKids, onSessionExpired, onClaimUnclaimed }) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [confirmTrack, setConfirmTrack] = useState(false);
  const [trackMsg, setTrackMsg] = useState(null);
  // Re-render on every sync-state transition (spinner, error, drained
  // count). Without this the dashboard read getSyncState() once per render
  // and the "Sync now" button appeared dead: the run settled in
  // localStorage but nothing re-painted.
  const [, setSyncTick] = useState(0);
  useEffect(() => onSyncState(() => setSyncTick((n) => n + 1)), []);
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

  // v2 progress: levels & stars. ensureV2Profile is read-only here in
  // practice (profiles that reached the dashboard already went through
  // beginLesson), but calling it keeps un-migrated profiles renderable.
  ensureV2Profile(p);
  const v2 = p.v2;
  const totalMinutes = p.sessions.reduce((n, s) => n + (s.minutes || 0), 0);
  const nextLevel = v2.track === 'basics' ? v2.basicsAt : v2.level;
  const nextG = levelKind(nextLevel) === 'review' ? null : newSound(nextLevel);
  const nextMeta = nextG ? META[nextG] : null;

  async function doSync() {
    setSyncing(true);
    setSyncError(null);
    // Let the 'Syncing…' state paint before the (possibly instant) sync
    // runs — otherwise the spinner batches away and the button feels dead.
    await new Promise((r) => setTimeout(r, 60));
    try {
      await syncNow(true); // manual tap always forces, bypassing backoff
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
  const unclaimedN = sync.unclaimedPending || 0;
  const blockedN = sync.blockedPending || 0;
  const pendingBit = pendingN > 0 ? ` (${pendingN} waiting)` : '';
  const syncLabel =
    sync.state === 'auth' ? '🔒 Signed out — please sign in again' :
    sync.state === 'syncing' || syncing ? '🔄 Syncing…' :
    sync.state === 'blocked' ? `📦 ${blockedN} change${blockedN === 1 ? '' : 's'} belong${blockedN === 1 ? 's' : ''} to reader${blockedN === 1 ? '' : 's'} attached to a different account — they stay on this device` :
    sync.state === 'unclaimed' ? `📦 ${unclaimedN} change${unclaimedN === 1 ? '' : 's'} waiting — add the reader${unclaimedN === 1 ? '' : 's'} to your account to sync` :
    sync.state === 'server_error' ? `⚠️ Couldn't sync just now — progress is safe on this device${pendingBit}` :
    sync.state === 'offline' ? `📴 Offline — will sync when connected${pendingBit}` :
    pendingN > 0 ? `⏳ ${pendingN} change${pendingN === 1 ? '' : 's'} waiting to sync` :
    sync.lastSyncAt ? '✅ Synced' :
    '⏳ Waiting for first sync';

  const shownError = syncError || (sync.state !== 'auth' && sync.state !== 'unclaimed' && sync.state !== 'blocked' ? sync.error : null);

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <BigButton small color="#6f66a8" onClick={onBack}>‹ Back</BigButton>
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

      {/* Narration uses one pre-recorded voice (Kristy) for every kid. */}
      <div style={{ marginTop: 18, padding: 16, background: '#f4f1ff', borderRadius: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Narration voice</div>
        <div style={{ fontSize: 15, color: '#5b567d' }}>
          Kristy — warm teacher voice. Every line in the app is pre-recorded with her, so it always sounds the same.
        </div>
      </div>

      <Title>{p.avatar} {p.name} <span style={{ fontSize: 20, fontWeight: 600, color: '#5b567d' }}>
        ({v2.track === 'main' ? 'early reader' : v2.track === 'basics' ? 'sound explorer' : 'not placed yet'})
      </span></Title>

      {p.placement && p.placement.done && (
        <Card title="🧭 Readiness check (🐶🐟 dogfish vs 🐟🐶 fishdog)">
          <div style={{ fontSize: 17, lineHeight: 1.7 }}>
            <div>Score: <b>{p.placement.score != null ? `${p.placement.score}/2` : '—'}</b> → {v2.track === 'main' ? 'main track' : 'sounds-only basics track'}</div>
            <div style={{ color: '#5b567d', marginTop: 6 }}>
              The check tests whether order matters to your child (dog+fish vs fish+dog).
              Basics kids learn letter sounds only — no blending — until they're ready.
            </div>
            {p.placement.overridden && (
              <div style={{ color: '#5b567d', marginTop: 6 }}>Track set by a grown-up (not the game).</div>
            )}
          </div>
        </Card>
      )}

      <Card title="🔄 Sync status">
        <div style={{ fontSize: 19 }}>{syncLabel}</div>
        {shownError && <div style={{ fontSize: 16, color: '#a33', marginTop: 6 }}>{shownError}</div>}
        {(sync.state === 'unclaimed' || unclaimedN > 0) && (
          <div style={{ marginTop: 10 }}>
            <BigButton small onClick={onClaimUnclaimed}>📦 Add to my account</BigButton>
            <div style={{ fontSize: 15, color: '#5b567d', marginTop: 6 }}>
              These readers live on this device only. Adding them syncs their progress to your account.
            </div>
          </div>
        )}
        {blockedN > 0 && (
          <div style={{ fontSize: 15, color: '#5b567d', marginTop: 10 }}>
            📦 These readers are attached to a different account and can't be moved.
            Their progress stays on this device.
          </div>
        )}
        {sync.deadLetter && sync.deadLetter.length > 0 && (
          <div style={{ fontSize: 16, color: '#a33', marginTop: 6 }}>
            ⚠️ {sync.deadLetter.length} change{sync.deadLetter.length === 1 ? '' : 's'} couldn't be saved
            ({sync.deadLetter[0].error}). Progress is safe on this device.
          </div>
        )}
        {(sync.pending > 0 || shownError || (sync.deadLetter && sync.deadLetter.length > 0)) && <div style={{ marginTop: 8 }}><BigButton small onClick={doSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now 🔄'}</BigButton></div>}
        {/* Sync diagnostics: last attempt, last error, per-event failures.
            When sync looks stuck, this line says exactly why instead of a
            silent spinner or a frozen count. */}
        {(sync.lastAttemptAt || sync.lastSyncAt || sync.error) && (
          <div style={{ fontSize: 13, color: '#8a84a8', marginTop: 8, lineHeight: 1.5 }}>
            {sync.lastAttemptAt && <div>Last attempt: {new Date(sync.lastAttemptAt).toLocaleString()}</div>}
            {sync.lastSyncAt && <div>Last successful sync: {new Date(sync.lastSyncAt).toLocaleString()}</div>}
            {sync.failCounts && Object.keys(sync.failCounts).length > 0 && (
              <div>
                Failing now ({Object.keys(sync.failCounts).length}):{' '}
                {Object.entries(sync.failCounts).slice(0, 3).map(([id, f]) => `${id}: ${f.error} (try ${f.n})`).join(' · ')}
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: 15, color: '#5b567d', marginTop: 8 }}>
          Lessons always work offline. Progress is stored on this device first, then synced to the family database when connected.
        </div>
      </Card>

      <Card title="⭐ Stars & sounds">
        <div style={{ fontSize: 19 }}>
          <b>{v2.stars.length}</b> {v2.stars.length === 1 ? 'star' : 'stars'} earned ·{' '}
          {v2.track === 'basics' ? 'sounds-only basics' : v2.completedAll ? (
            <>🎉 all 30 sounds learned — practicing!</>
          ) : (
            <>on level <b>{v2.level}</b> of 37</>
          )} ·{' '}
          <b>{p.sessions.length}</b> sessions
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {ORDER.map((g) => {
            const lv = levelOfGrapheme(g);
            const st = v2.stars.includes(lv) ? STATUS_STYLE.mastered
              : lv === nextLevel ? STATUS_STYLE.learning
              : lv < nextLevel ? STATUS_STYLE.introduced
              : STATUS_STYLE.todo;
            const m = META[g];
            return (
              <div
                key={g}
                title={`${g} (${m.say}, like ${m.keyword}): ${st.label}`}
                style={{
                  minWidth: 46, height: 52, padding: '0 8px', borderRadius: 12, background: st.bg, border: `3px solid ${st.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 800,
                }}
              >{g}</div>
            );
          })}
        </div>
        <div style={{ fontSize: 15, color: '#5b567d', marginTop: 8 }}>
          🟩 level complete · 🟨 up next · ⬜ introduced · ⬜ not yet — one new sound per level, every 5th level reviews.
        </div>
      </Card>

      <Card title="⏱️ Screen time">
        <div style={{ fontSize: 19 }}>
          {p.sessions.length} sessions · {totalMinutes} minutes total
          {p.sessions.length > 0 && <> · last: {p.sessions[p.sessions.length - 1].minutes} min</>}
        </div>
        <div style={{ fontSize: 16, color: '#5b567d', marginTop: 6 }}>
          Design target: 15–30 minutes, then the animals get sleepy and the tablet goes away.
          No streaks, no rankings — the routine is the reward.
        </div>
      </Card>

      <Card title="➡️ What comes next?">
        <div style={{ fontSize: 19 }}>
          {nextMeta ? (
            <>Next sound: <b>{nextG}</b> ({nextMeta.say}, like {nextMeta.emoji} {nextMeta.keyword})</>
          ) : (
            <>Next up: <b>review level</b> — replaying recent sounds, no new sound</>
          )}
        </div>
        <div style={{ fontSize: 16, color: '#5b567d', marginTop: 6 }}>
          Each level: discover the sound → find it → blend it → read a tiny story → read it to someone you love.
        </div>
        <div style={{ marginTop: 10 }}>
          {!confirmTrack ? (
            <button
              onClick={() => setConfirmTrack(true)}
              style={{ background: 'none', border: 'none', color: '#7c5cd6', fontSize: 17, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Switch track to {v2.track === 'main' ? 'sound explorer (no blending)' : 'early reader'}
            </button>
          ) : (
            <div style={{ background: '#f4f1ff', border: '3px solid #7c5cd6', borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
                Switch {p.name} to the {v2.track === 'main' ? 'sound explorer' : 'early reader'} track?
                Progress restarts at level 1 on the new track.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    const next = v2.track === 'main' ? 'basics' : 'main';
                    onOverrideTrack(p.id, next);
                    setConfirmTrack(false);
                    setTrackMsg(`✓ ${p.name} is now on the ${next === 'main' ? 'early reader' : 'sound explorer'} track.`);
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
  if (!passed) return <Gate onPass={() => setPassed(true)} onCancel={props.onBack} />;
  // NOTE: Dashboard subscribes to onSyncState itself for live re-renders;
  // refreshSync comes from App and reloads the store from localStorage.
  return <Dashboard {...props} />;
}

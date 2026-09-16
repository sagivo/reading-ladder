// Kids: parent-only kid management — add, edit, archive/restore readers.
// Tapping a kid starts their flow (readiness game when unplaced, otherwise
// the daily lesson).
//
// Kid tap-to-start is intentionally PIN-free: the whole app sits behind the
// parent's login on a family device, so a second gate here would add friction
// without adding safety.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle, trackLabel } from './ui.jsx';
import { createKid, updateKid, isAuthError, friendlyError } from '../lib/auth.js';
import { toServer, fromServer, syncNow } from '../lib/sync.js';
import { loadStore, newProfile, touchProfile, queueEvent } from '../lib/store.js';

const AVATARS = ['🦊', '🐰', '🦉', '🐢', '🐵', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐝'];

function validBirthYear(by) {
  if (!/^\d{4}$/.test(by)) return false;
  const y = parseInt(by, 10);
  const now = new Date().getFullYear();
  return y >= now - 18 && y <= now;
}

/** 'early' | 'pre' | null — a suggestion only; the readiness game still decides. */
function suggestionFor(birthYear) {
  const by = (birthYear || '').trim();
  if (!validBirthYear(by)) return null;
  const age = new Date().getFullYear() - parseInt(by, 10);
  return age >= 4 ? 'early' : 'pre';
}

const inputStyle = {
  fontSize: 24, padding: '12px 18px', borderRadius: 18,
  border: '4px solid #d9d4f5', width: '100%', maxWidth: 340,
};

function KidForm({ initial, submitLabel, busy, onSubmit, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [avatar, setAvatar] = useState(initial.avatar || AVATARS[0]);
  const [birthYear, setBirthYear] = useState(
    initial.birthYear ? String(initial.birthYear) : String(new Date().getFullYear() - 4)
  );
  const [formError, setFormError] = useState(null);
  const suggestion = suggestionFor(birthYear);

  function handleSubmit() {
    const n = name.trim();
    if (!n) {
      setFormError('Give the reader a name.');
      return;
    }
    const by = birthYear.trim();
    if (by && !validBirthYear(by)) {
      setFormError('Birth year is a 4-digit year, e.g. 2021.');
      return;
    }
    setFormError(null);
    onSubmit({ name: n, avatar, birthYear: by ? parseInt(by, 10) : null });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      width: '100%', background: '#fff', borderRadius: 24, padding: 24,
      border: '3px solid #e4e0f7',
    }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        maxLength={20}
        style={{ ...inputStyle, textAlign: 'center' }}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
        {AVATARS.map((a) => (
          <button
            key={a}
            onClick={() => setAvatar(a)}
            style={{
              width: 60, height: 60, fontSize: 32, borderRadius: 16, cursor: 'pointer',
              border: avatar === a ? '5px solid #7c5cd6' : '3px solid #e4e0f7', background: '#fff',
            }}
          >{a}</button>
        ))}
      </div>
      <input
        value={birthYear}
        onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder="Birth year (optional)"
        inputMode="numeric"
        maxLength={4}
        style={{ ...inputStyle, textAlign: 'center' }}
      />
      <div style={{ fontSize: 15, color: '#9a94c7', textAlign: 'center', marginTop: -8 }}>
        Birth year is only used to suggest a starting track.
      </div>
      {suggestion && (
        <div style={{
          background: '#fff7d6', border: '3px solid #f5b301', borderRadius: 16,
          padding: '10px 18px', fontSize: 18, textAlign: 'center', maxWidth: 420,
        }}>
          💡 Suggestion: <b>{suggestion === 'early' ? 'early reader 📖' : 'listening reader 👂'}</b>
          {' '}— kids {suggestion === 'early' ? '4 and up' : 'under 4'} often start here.
          The 4-minute readiness game still decides the track.
        </div>
      )}
      {formError && (
        <div style={{
          background: '#fdecec', border: '3px solid #e88', borderRadius: 16,
          padding: '10px 18px', fontSize: 18, fontWeight: 700,
        }}>
          {formError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        {onCancel && <BigButton small color="#9a94c7" onClick={onCancel}>Cancel</BigButton>}
        <BigButton small onClick={handleSubmit} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </BigButton>
      </div>
    </div>
  );
}

function KidCard({ p, onStart, onEdit, onArchive, confirming, onConfirmArchive, onCancelArchive, busy }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 8, width: '100%',
      padding: 10, borderRadius: 24, border: '4px solid #d9d4f5', background: '#fff',
    }}>
      <button
        onClick={() => onStart(p.id)}
        title={`Start ${p.name}'s lesson`}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 14,
          padding: 10, borderRadius: 18, border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: '50%', fontSize: 38, flexShrink: 0,
          background: '#f1f0fa', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {p.avatar}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{p.name}</div>
          <div style={{ fontSize: 17, color: '#5b567d' }}>
            {trackLabel(p.track)} · Level {p.level + 1} · {p.sessions.length} {p.sessions.length === 1 ? 'lesson' : 'lessons'}
            {p.serverPending ? ' · 📴 on this device only' : ''}
          </div>
        </div>
        <div style={{ fontSize: 30 }}>▶</div>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
        <button
          onClick={onEdit}
          aria-label={`Edit ${p.name}`}
          style={{ width: 52, height: 52, fontSize: 24, borderRadius: 14, border: '3px solid #e4e0f7', background: '#fff', cursor: 'pointer' }}
        >✏️</button>
        <button
          onClick={onArchive}
          aria-label={`Archive ${p.name}`}
          style={{ width: 52, height: 52, fontSize: 24, borderRadius: 14, border: '3px solid #e4e0f7', background: '#fff', cursor: 'pointer' }}
        >📦</button>
      </div>
      {confirming && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(255,255,255,0.97)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16,
        }}>
          <div style={{ fontSize: 19, fontWeight: 700, textAlign: 'center' }}>
            Archive {p.name}? Their progress is kept and can be restored anytime.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <BigButton small color="#9a94c7" onClick={onCancelArchive}>Cancel</BigButton>
            <BigButton small color="#b0655a" onClick={onConfirmArchive} disabled={busy}>
              {busy ? 'Archiving…' : 'Archive'}
            </BigButton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Kids({ store, commit, onBack, onStartKid, onSessionExpired }) {
  const all = Object.values(store.profiles);
  const active = all.filter((p) => !p.archived);
  const archived = all.filter((p) => p.archived);

  const [adding, setAdding] = useState(active.length === 0);
  const [editingId, setEditingId] = useState(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null); // honest local-only/offline notice

  function push() {
    syncNow().catch((e) => {
      if (isAuthError(e)) onSessionExpired();
    });
  }

  async function addKid({ name, avatar, birthYear }) {
    setBusy('add');
    setError(null);
    setNote(null);
    try {
      const res = await createKid({ name, avatar, birth_year: birthYear });
      const p = fromServer(res.profile);
      commit((s) => {
        s.profiles[p.id] = p;
        queueEvent(s, p.id, 'profile_created', { name: p.name, avatar: p.avatar });
      });
      setAdding(false);
      push();
    } catch (e) {
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      if (e.message === 'network_unreachable') {
        // Offline: keep the reader on this device; the claim flow attaches
        // them to the parent account on the next online launch.
        const p = newProfile(name, avatar);
        p.birthYear = birthYear;
        p.serverPending = true;
        commit((s) => {
          s.profiles[p.id] = p;
          queueEvent(s, p.id, 'profile_created', { name, avatar });
        });
        setAdding(false);
        setNote("📴 Saved on this device — will sync when you're back online.");
      } else {
        console.warn('add kid failed', e);
        setError(friendlyError(e));
      }
    } finally {
      setBusy(null);
    }
  }

  async function editKid(id, { name, avatar, birthYear }) {
    setBusy('save');
    setError(null);
    setNote(null);
    commit((s) => {
      const p = s.profiles[id];
      if (p) {
        p.name = name;
        p.avatar = avatar;
        p.birthYear = birthYear;
        touchProfile(p);
        queueEvent(s, id, 'profile_updated', { name, avatar, birth_year: birthYear });
      }
    });
    try {
      const p = loadStore().profiles[id];
      // Unclaimed readers have no server row yet — a PUT would 404 with a
      // misleading "profile not found" while the change is safely stored
      // locally (the queued event + a later claim carry it to the server).
      if (p && p.claimed) {
        await updateKid(id, toServer(p));
      } else if (p) {
        setNote(`💾 Saved on this device — will sync once ${p.name} is added to your account.`);
      }
      setEditingId(null);
      push();
    } catch (e) {
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      if (e.message === 'network_unreachable') {
        setEditingId(null);
        setNote("📴 Saved on this device — will sync when you're back online.");
      } else {
        console.warn('edit kid failed', e);
        setError(friendlyError(e));
      }
    } finally {
      setBusy(null);
    }
  }

  async function archiveKid(id) {
    setBusy('archive');
    setError(null);
    setNote(null);
    commit((s) => {
      const p = s.profiles[id];
      if (p) {
        p.archived = true;
        touchProfile(p);
        queueEvent(s, id, 'profile_archived', {});
      }
    });
    try {
      // Same unclaimed rule as editKid: no server row exists yet, so the PUT
      // would 404. The queued profile_archived event propagates the archive
      // after the reader is claimed (sync applies it explicitly post-adopt).
      const ap = loadStore().profiles[id];
      if (ap && ap.claimed) await updateKid(id, { archived: true });
      else if (ap) setNote(`💾 Saved on this device — will sync once ${ap.name} is added to your account.`);
      push();
    } catch (e) {
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      if (e.message === 'network_unreachable') setNote("📴 Saved on this device — will sync when you're back online.");
      else {
        console.warn('archive kid failed', e);
        setError(friendlyError(e));
      }
    } finally {
      setBusy(null);
      setConfirmArchiveId(null);
    }
  }

  async function restoreKid(id) {
    setBusy(`restore-${id}`);
    setError(null);
    commit((s) => {
      const p = s.profiles[id];
      if (p) {
        p.archived = false;
        touchProfile(p);
        queueEvent(s, id, 'profile_restored', {});
      }
    });
    try {
      // Same unclaimed rule as editKid/archiveKid: no server row exists yet.
      const rp = loadStore().profiles[id];
      if (rp && rp.claimed) await updateKid(id, { archived: false });
      else if (rp) setNote(`💾 Saved on this device — will sync once ${rp.name} is added to your account.`);
      push();
    } catch (e) {
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      if (e.message === 'network_unreachable') setNote("📴 Saved on this device — will sync when you're back online.");
      else {
        console.warn('restore kid failed', e);
        setError(friendlyError(e));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BigButton small color="#9a94c7" onClick={onBack}>‹ Back</BigButton>
      </div>
      <Title>👥 Your readers</Title>
      <Subtitle>For grown-ups — add, edit, or archive readers. Tap a reader to start their lesson.</Subtitle>

      {error && (
        <div style={{
          background: '#fdecec', border: '3px solid #e88', borderRadius: 16,
          padding: '12px 20px', fontSize: 19, fontWeight: 700, textAlign: 'center', width: '100%',
        }}>
          {error}
        </div>
      )}
      {note && (
        <div style={{
          background: '#f1f0fa', border: '3px solid #d9d4f5', borderRadius: 16,
          padding: '12px 20px', fontSize: 18, fontWeight: 700, textAlign: 'center', width: '100%',
        }}>
          {note}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        {active.map((p) => (
          editingId === p.id ? (
            <KidForm
              key={p.id}
              initial={{ name: p.name, avatar: p.avatar, birthYear: p.birthYear }}
              submitLabel="Save ✅"
              busy={busy === 'save'}
              onSubmit={(data) => editKid(p.id, data)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={p.id} style={{ position: 'relative' }}>
              <KidCard
                p={p}
                onStart={onStartKid}
                onEdit={() => setEditingId(p.id)}
                onArchive={() => setConfirmArchiveId(p.id)}
                confirming={confirmArchiveId === p.id}
                onConfirmArchive={() => archiveKid(p.id)}
                onCancelArchive={() => setConfirmArchiveId(null)}
                busy={busy === 'archive'}
              />
            </div>
          )
        ))}
      </div>

      {archived.length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#5b567d' }}>📦 Archived</div>
          {archived.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                borderRadius: 18, border: '3px dashed #d9d4f5', background: '#faf9ff',
              }}
            >
              <div style={{ fontSize: 34 }}>{p.avatar}</div>
              <div style={{ flex: 1, fontSize: 21, fontWeight: 700 }}>{p.name}</div>
              <BigButton small onClick={() => restoreKid(p.id)} disabled={busy === `restore-${p.id}`}>
                {busy === `restore-${p.id}` ? 'Restoring…' : 'Restore'}
              </BigButton>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }}>Add a reader</div>
          <KidForm
            initial={{}}
            submitLabel="Add reader ✨"
            busy={busy === 'add'}
            onSubmit={addKid}
            onCancel={active.length > 0 ? () => setAdding(false) : null}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: 14, borderRadius: 24, border: '4px dashed #b9b3d6', background: 'transparent',
            fontSize: 22, fontWeight: 700, color: '#7c5cd6', cursor: 'pointer', width: '100%',
          }}
        >+ Add a reader</button>
      )}
    </Screen>
  );
}

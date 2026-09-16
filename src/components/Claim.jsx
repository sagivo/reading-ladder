// Claim: after sign-in, offer to attach this device's anonymous
// (pre-account) kid profiles to the parent account via POST /api/auth/adopt.
// "Skip" remembers the choice per profile id in localStorage so we never
// nag on every launch.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { adopt, isAuthError, friendlyError } from '../lib/auth.js';
import { toServer } from '../lib/sync.js';
import { touchProfile, loadDismissedClaimIds, saveDismissedClaimIds } from '../lib/store.js';

export default function Claim({ ids, store, commit, onDone, onSessionExpired }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const kids = ids.map((id) => store.profiles[id]).filter(Boolean);

  async function doAdopt() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adopt(kids.map(toServer));
      const ok = new Set(res.adopted || []);
      commit((s) => {
        for (const id of ok) {
          const p = s.profiles[id];
          if (p) {
            p.claimed = true;
            p.serverPending = false;
            touchProfile(p);
          }
        }
      });
      onDone();
    } catch (e) {
      console.warn('adopt failed', e);
      if (isAuthError(e)) {
        onSessionExpired();
        return;
      }
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function doSkip() {
    saveDismissedClaimIds([...new Set([...loadDismissedClaimIds(), ...ids])]);
    onDone();
  }

  return (
    <Screen>
      <div style={{ fontSize: 64 }}>📦</div>
      <Title>Welcome back, grown-up!</Title>
      <Subtitle>
        We found {kids.length} {kids.length === 1 ? 'reader' : 'readers'} on this device
        from before parent accounts existed. Add {kids.length === 1 ? 'them' : 'them'} to
        your account so {kids.length === 1 ? 'their' : 'their'} progress syncs everywhere?
      </Subtitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
        {kids.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: 14,
              borderRadius: 20, border: '3px solid #e4e0f7', background: '#fff',
            }}
          >
            <div style={{ fontSize: 44 }}>{p.avatar}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{p.name}</div>
            <div style={{ fontSize: 17, color: '#5b567d' }}>
              {p.sessions.length} {p.sessions.length === 1 ? 'lesson' : 'lessons'} done
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          background: '#fdecec', border: '3px solid #e88', borderRadius: 16,
          padding: '12px 20px', fontSize: 19, fontWeight: 700, textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <BigButton small color="#9a94c7" onClick={doSkip} disabled={busy}>
          Skip for now
        </BigButton>
        <BigButton small onClick={doAdopt} disabled={busy}>
          {busy ? 'Adding…' : `Add to my account ✅`}
        </BigButton>
      </div>

      <div style={{ fontSize: 16, color: '#9a94c7', textAlign: 'center', maxWidth: 420 }}>
        Skipping keeps them on this device only — you can add them later from
        the grown-up corner.
      </div>
    </Screen>
  );
}

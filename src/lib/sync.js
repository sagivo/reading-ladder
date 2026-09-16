// Background sync: pushes the local pending-event queue to the Pages
// Functions API and merges server state on launch.
//
// Merge rule (pragmatic, per profile): last-write-wins on updatedAt.
// Events are append-only and deduped by id on the server.
//
// Parent-awareness: only profiles claimed by the signed-in parent sync.
// Local unclaimed profiles (pre-account, or created offline) stay on the
// device until the claim flow attaches them via POST /api/auth/adopt.
// A 401 from any call flips sync state to 'auth' so the app can send the
// parent back to sign-in instead of retrying silently.

import { loadStore, saveStore, ackEvents } from './store.js';
import { api, AuthError, isAuthError } from './auth.js';

const SYNC_KEY = 'reading-ladder-sync';

export function getSyncState() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
  } catch {
    return {};
  }
}

function setSyncState(patch) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ ...getSyncState(), ...patch }));
  } catch {
    /* ignore */
  }
}

/** True when we can reach the API as a signed-in parent (used to label offline state). */
export async function checkOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await api('/api/auth/me');
    return true;
  } catch (e) {
    if (isAuthError(e)) {
      setSyncState({ state: 'auth', error: 'Signed out — please sign in again.' });
    }
    return false;
  }
}

function noteAuth() {
  setSyncState({ state: 'auth', error: 'Signed out — please sign in again.' });
}

/**
 * On launch: pull this parent's server profile list and merge per profile —
 * keep whichever side (local or server) was updated most recently.
 * Server-only profiles are adopted locally (marked claimed).
 * Local unclaimed profiles are left untouched until adopted via the claim flow.
 */
export async function mergeOnLaunch(parentId) {
  const store = loadStore();
  // A different parent signed in on this device: drop the previous parent's
  // claimed profiles from local state (the server still has them). Unclaimed
  // local profiles belong to no account yet, so they stay.
  if (store.parentId && store.parentId !== parentId) {
    for (const [id, p] of Object.entries(store.profiles)) {
      if (p.claimed) delete store.profiles[id];
    }
    store.queue = store.queue.filter((e) => {
      const p = store.profiles[e.profile_id];
      return !p || !p.claimed;
    });
  }
  store.parentId = parentId;

  let remote;
  try {
    remote = await api('/api/profiles');
  } catch (e) {
    if (isAuthError(e)) {
      noteAuth();
      return { store, merged: 0, online: false, auth: true, serverIds: [] };
    }
    setSyncState({ state: 'offline', error: String((e && e.message) || e) });
    return { store, merged: 0, online: false, auth: false, serverIds: [] };
  }

  const serverIds = (remote.profiles || []).map((r) => r.id);
  const inServer = new Set(serverIds);
  // Anything the server lists belongs to this parent, even if the local
  // claimed flag was lost (e.g. adopt succeeded but the tab closed first).
  for (const p of Object.values(store.profiles)) {
    if (inServer.has(p.id)) {
      p.claimed = true;
      p.serverPending = false;
    }
  }

  let merged = 0;
  for (const r of remote.profiles || []) {
    const local = store.profiles[r.id];
    const fetchFull = async () => {
      const full = await api(`/api/profiles/${r.id}`);
      if (full.profile) {
        store.profiles[r.id] = fromServer(full.profile);
        merged++;
      }
    };
    try {
      if (!local) {
        await fetchFull();
      } else if (new Date(r.updated_at) > new Date(local.updatedAt || 0)) {
        await fetchFull();
      }
    } catch (e) {
      if (isAuthError(e)) {
        saveStore(store);
        noteAuth();
        return { store, merged, online: true, auth: true, serverIds };
      }
      console.warn('merge skipped profile', r.id, e);
    }
  }
  saveStore(store);
  setSyncState({ state: 'idle', lastMergeAt: new Date().toISOString() });
  return { store, merged, online: true, auth: false, serverIds };
}

/**
 * Push queued events (plus a full state snapshot) for every dirty profile
 * owned by the current parent. Events for unclaimed profiles stay queued
 * locally until the profile is adopted. AuthError is rethrown so the app
 * can route to sign-in; it is never retried silently.
 */
export async function syncNow() {
  const store = loadStore();
  const byProfile = {};
  for (const ev of store.queue) {
    const p = store.profiles[ev.profile_id];
    if (p && !p.claimed) continue; // not this parent's (yet) — stays local until adopted
    (byProfile[ev.profile_id] = byProfile[ev.profile_id] || []).push(ev);
  }
  if (!Object.keys(byProfile).length) {
    setSyncState({ state: 'idle', pending: store.queue.length });
    return { ok: true, synced: 0 };
  }
  setSyncState({ state: 'syncing' });
  let synced = 0;
  try {
    for (const [pid, events] of Object.entries(byProfile)) {
      const profile = store.profiles[pid];
      const res = await api(`/api/profiles/${pid}/events`, {
        method: 'POST',
        body: { events, state: profile ? toServer(profile) : undefined },
      });
      // Archive transitions made while offline: propagate via the contract's
      // explicit archived flag (the state snapshot doesn't carry it). Do this
      // BEFORE acking so a failed PUT keeps the events queued for retry
      // (server dedupes events by id, so re-posting is safe).
      const archiveEv = [...events]
        .reverse()
        .find((e) => e.type === 'profile_archived' || e.type === 'profile_restored');
      if (archiveEv) {
        await api(`/api/profiles/${pid}`, {
          method: 'PUT',
          body: { archived: archiveEv.type === 'profile_archived' },
        });
      }
      ackEvents(store, res.acked || events.map((e) => e.id));
      synced += (res.acked || []).length;
    }
    saveStore(store);
    const pending = store.queue.length;
    setSyncState({
      state: 'idle',
      pending,
      lastSyncAt: new Date().toISOString(),
      error: null,
    });
    return { ok: true, synced };
  } catch (e) {
    saveStore(store);
    if (isAuthError(e)) {
      noteAuth();
      throw e;
    }
    setSyncState({ state: 'offline', pending: store.queue.length, error: String((e && e.message) || e) });
    return { ok: false, synced, error: String((e && e.message) || e) };
  }
}

// ---- shape translation (client camelCase <-> server snake_case) ----

export function toServer(p) {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    track: p.track,
    placement_json: JSON.stringify(p.placement || null),
    level: p.level,
    mastery_json: JSON.stringify(p.mastery || {}),
    misses_json: JSON.stringify(p.misses || []),
    companion_json: JSON.stringify(p.companion || {}),
    sessions_json: JSON.stringify(p.sessions || []),
    exposure: p.exposure || 0,
    last_mission: p.lastMission || null,
    birth_year: p.birthYear || null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function fromServer(row) {
  const j = (v, fb) => {
    try {
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    track: row.track,
    placement: j(row.placement_json, null),
    level: row.level || 0,
    mastery: j(row.mastery_json, {}),
    misses: j(row.misses_json, []),
    companion: j(row.companion_json, { animal: 'fox', color: 'purple', accessory: 'none', unlocked: ['none'] }),
    sessions: j(row.sessions_json, []),
    exposure: row.exposure || 0,
    lastMission: row.last_mission || null,
    birthYear: row.birth_year || null,
    claimed: true, // rows from this parent's list belong to this parent
    serverPending: false,
    archived: false, // the list endpoint only returns non-archived kids
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Re-export for convenience (components import the error type from here or auth.js).
export { AuthError };

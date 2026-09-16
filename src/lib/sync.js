// Background sync: pushes the local pending-event queue to the Pages
// Functions API and merges server state on launch.
//
// Merge rule (pragmatic, per profile): last-write-wins on updatedAt.
// Events are append-only and deduped by id on the server.

import { loadStore, saveStore, ackEvents } from './store.js';

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

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** True when we can reach the API (used to label offline state). */
export async function checkOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await api('/api/profiles');
    return true;
  } catch {
    return false;
  }
}

/**
 * On launch: pull the server profile list and merge per profile —
 * keep whichever side (local or server) was updated most recently.
 * Server-only profiles are adopted locally.
 */
export async function mergeOnLaunch() {
  const store = loadStore();
  let remote;
  try {
    remote = await api('/api/profiles');
  } catch (e) {
    setSyncState({ state: 'offline', error: String(e && e.message || e) });
    return { store, merged: 0, online: false };
  }
  let merged = 0;
  for (const r of remote.profiles || []) {
    const local = store.profiles[r.id];
    if (!local) {
      const full = await api(`/api/profiles/${r.id}`);
      if (full.profile) {
        store.profiles[r.id] = fromServer(full.profile);
        merged++;
      }
    } else if (new Date(r.updated_at) > new Date(local.updatedAt || 0)) {
      const full = await api(`/api/profiles/${r.id}`);
      if (full.profile) {
        store.profiles[r.id] = fromServer(full.profile);
        merged++;
      }
    }
  }
  saveStore(store);
  setSyncState({ state: 'idle', lastMergeAt: new Date().toISOString() });
  return { store, merged, online: true };
}

/** Push queued events (plus a full state snapshot) for every dirty profile. */
export async function syncNow() {
  const store = loadStore();
  if (!store.queue.length) {
    setSyncState({ state: 'idle', pending: 0 });
    return { ok: true, synced: 0 };
  }
  setSyncState({ state: 'syncing' });
  const byProfile = {};
  for (const ev of store.queue) {
    (byProfile[ev.profile_id] = byProfile[ev.profile_id] || []).push(ev);
  }
  let synced = 0;
  try {
    for (const [pid, events] of Object.entries(byProfile)) {
      const profile = store.profiles[pid];
      const res = await api(`/api/profiles/${pid}/events`, {
        method: 'POST',
        body: { events, state: profile ? toServer(profile) : undefined },
      });
      ackEvents(store, res.acked || events.map((e) => e.id));
      synced += (res.acked || []).length;
    }
    saveStore(store);
    const pending = store.queue.length;
    setSyncState({
      state: pending ? 'idle' : 'idle',
      pending,
      lastSyncAt: new Date().toISOString(),
      error: null,
    });
    return { ok: true, synced };
  } catch (e) {
    saveStore(store);
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

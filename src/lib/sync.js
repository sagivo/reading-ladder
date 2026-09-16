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
 *
 * Reliability contract (the queue used to stall forever on one poison
 * event — a single failing profile POST 500'd the whole batch, nothing
 * was acked, and the identical batch was retried forever):
 *  - in-flight guard: concurrent triggers share one run, never overlap;
 *  - per-profile isolation: one profile's failure never aborts the others;
 *  - per-event isolation: the server acks what landed and reports the
 *    rest in `failed`; only acked ids leave the queue;
 *  - dead-letter: an event that fails 3 times is parked (parent-visible)
 *    instead of retried forever;
 *  - backoff: after a failed run, automatic triggers wait before retrying
 *    (manual "Sync now" always forces);
 *  - the `syncing` state can never stick: try/finally always lands on a
 *    terminal state, and requests have a timeout.
 */
let inflight = null;

const MAX_EVENT_FAILURES = 3; // then the event is dead-lettered (parent-visible)
const RETRY_BASE_MS = 30000;
const RETRY_MAX_MS = 300000;

function noteEventFailure(st, ev, error) {
  st.failCounts = st.failCounts || {};
  const rec = st.failCounts[ev.id] || { n: 0 };
  rec.n += 1;
  rec.error = String(error || 'sync failed').slice(0, 200);
  rec.at = new Date().toISOString();
  st.failCounts[ev.id] = rec;
  if (rec.n >= MAX_EVENT_FAILURES) {
    st.deadLetter = st.deadLetter || [];
    if (st.deadLetter.length < 50 && !st.deadLetter.some((d) => d.id === ev.id)) {
      st.deadLetter.push({
        id: ev.id,
        profile_id: ev.profile_id,
        type: ev.type,
        error: rec.error,
        at: rec.at,
      });
    }
    delete st.failCounts[ev.id];
    return true; // dead-lettered
  }
  return false;
}

function dropDeadLettered(store, st) {
  const dead = new Set((st.deadLetter || []).map((d) => d.id));
  if (dead.size) store.queue = store.queue.filter((e) => !dead.has(e.id));
}

export function syncNow(force = false) {
  if (inflight) return inflight; // a sync is already running — share it
  inflight = doSyncNow(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Honest label for events that can't sync because their reader is unclaimed. */
function unclaimedMessage(n) {
  return (
    `${n} change${n === 1 ? '' : 's'} belong${n === 1 ? 's' : ''} to reader${n === 1 ? '' : 's'}` +
    ` not yet added to your account — they stay on this device until claimed.`
  );
}

async function doSyncNow(force) {
  const store = loadStore();
  dropDeadLettered(store, getSyncState());
  const byProfile = {};
  let unclaimedPending = 0;
  for (const ev of store.queue) {
    const p = store.profiles[ev.profile_id];
    if (p && !p.claimed) {
      // Not this parent's (yet) — stays local until adopted. This used to be
      // skipped SILENTLY: the dashboard sat on "N changes waiting to sync"
      // forever with a dead "Sync now" button and no explanation. Now the
      // count is surfaced and the terminal state is an honest 'unclaimed'.
      unclaimedPending++;
      continue;
    }
    (byProfile[ev.profile_id] = byProfile[ev.profile_id] || []).push(ev);
  }
  const st = getSyncState();
  if (!Object.keys(byProfile).length) {
    const pending = store.queue.length;
    if (unclaimedPending > 0) {
      setSyncState({
        ...st,
        state: 'unclaimed',
        pending,
        unclaimedPending,
        error: unclaimedMessage(unclaimedPending),
        attempts: 0,
        nextRetryAt: 0,
      });
    } else {
      setSyncState({
        ...st,
        state: 'idle',
        pending,
        unclaimedPending: 0,
        error: null,
        attempts: 0,
        nextRetryAt: 0,
      });
    }
    saveStore(store);
    return { ok: true, synced: 0, pending, unclaimedPending };
  }
  if (!force && st.nextRetryAt && Date.now() < st.nextRetryAt) {
    return { ok: false, deferred: true, retryInMs: st.nextRetryAt - Date.now() };
  }

  setSyncState({ state: 'syncing', error: null });
  let synced = 0;
  let deadLettered = 0;
  const profileErrors = [];
  const networkErrors = [];
  try {
    for (const [pid, events] of Object.entries(byProfile)) {
      const byId = new Map(events.map((e) => [e.id, e]));
      try {
        const profile = store.profiles[pid];
        const res = await api(`/api/profiles/${pid}/events`, {
          method: 'POST',
          body: { events, state: profile ? toServer(profile) : undefined },
          timeout: 25000,
        });
        // Ack what the server durably stored — immediately, per event.
        const acked = res.acked || [];
        ackEvents(store, acked);
        synced += acked.length;
        for (const id of acked) {
          if (st.failCounts) delete st.failCounts[id];
        }
        // Server-rejected events: count, dead-letter at the threshold.
        for (const f of res.failed || []) {
          const ev = byId.get(f.id);
          if (ev && noteEventFailure(st, ev, f.error)) deadLettered++;
        }
        if (res.stateError) {
          profileErrors.push(`profile snapshot rejected: ${res.stateError}`);
        }
        // Archive transitions made while offline: propagate via the
        // contract's explicit archived flag. The events are already acked
        // above; if the PUT fails we re-queue just the archive event so
        // the transition is retried next sync (server dedupes by id).
        const archiveEv = [...events]
          .reverse()
          .find((e) => e.type === 'profile_archived' || e.type === 'profile_restored');
        if (archiveEv) {
          try {
            await api(`/api/profiles/${pid}`, {
              method: 'PUT',
              body: { archived: archiveEv.type === 'profile_archived' },
              timeout: 25000,
            });
          } catch (e) {
            if (isAuthError(e)) throw e;
            if (!store.queue.some((q) => q.id === archiveEv.id)) store.queue.push(archiveEv);
            profileErrors.push(`archive flag retry pending: ${String((e && e.message) || e)}`);
          }
        }
      } catch (e) {
        if (isAuthError(e)) throw e;
        const msg = String((e && e.message) || e);
        if (msg === 'network_unreachable' || msg === 'request_timeout') networkErrors.push(msg);
        else profileErrors.push(msg);
        // Whole-profile POST failed: count it against each unacked event.
        for (const ev of events) {
          if (store.queue.some((q) => q.id === ev.id) && noteEventFailure(st, ev, msg)) deadLettered++;
        }
      }
    }
  } catch (e) {
    // AuthError (rethrown per profile) or an unexpected top-level failure.
    saveStore(store);
    if (isAuthError(e)) {
      noteAuth();
      throw e;
    }
    const attempts = (st.attempts || 0) + 1;
    setSyncState({
      ...st,
      state: 'server_error',
      pending: store.queue.length,
      error: String((e && e.message) || e),
      attempts,
      nextRetryAt: Date.now() + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS),
    });
    return { ok: false, synced, deadLettered, error: String((e && e.message) || e) };
  }

  dropDeadLettered(store, st);
  saveStore(store);
  const pending = store.queue.length;
  const stillUnclaimed = store.queue.filter((e) => {
    const p = store.profiles[e.profile_id];
    return p && !p.claimed;
  }).length;
  const attempts = pending > 0 ? (st.attempts || 0) + 1 : 0;
  const failed = profileErrors.length > 0 || networkErrors.length > 0;
  // Honest terminal state — never a permanent hang, never a mislabeled one.
  // A queue that is ENTIRELY unclaimed events is not "idle" and not "waiting":
  // those events will never sync until the reader is claimed.
  const state =
    pending === 0 ? 'idle'
    : stillUnclaimed === pending ? 'unclaimed'
    : networkErrors.length > 0 && profileErrors.length === 0 ? 'offline'
    : 'server_error';
  const error =
    pending === 0 ? null
    : stillUnclaimed === pending ? unclaimedMessage(stillUnclaimed)
    : [...new Set([...profileErrors, ...networkErrors])].slice(0, 3).join('; ');
  setSyncState({
    ...st,
    state,
    pending,
    unclaimedPending: stillUnclaimed,
    error,
    attempts,
    nextRetryAt:
      pending > 0 ? Date.now() + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS) : 0,
    lastSyncAt: synced > 0 || pending === 0 ? new Date().toISOString() : st.lastSyncAt,
  });
  return { ok: !failed && pending === 0, synced, deadLettered, pending, unclaimedPending: stillUnclaimed, error };
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

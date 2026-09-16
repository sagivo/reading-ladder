// Local-first store.
// localStorage is the source of truth during a lesson (lessons work fully
// offline). Progress events are appended to a pending queue and pushed to
// the API by the sync engine when online.

const KEY = 'reading-ladder-v1';
const CLAIM_DISMISSED_KEY = 'reading-ladder-claim-dismissed';

export function loadStore() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.profiles = s.profiles || {};
      s.queue = s.queue || [];
      s.parentId = s.parentId || null;
      s.parentEmail = s.parentEmail || null;
      // Normalize profiles written before parent accounts existed.
      for (const p of Object.values(s.profiles)) {
        if (p.claimed === undefined) p.claimed = false; // owned by the signed-in parent's account?
        if (p.birthYear === undefined) p.birthYear = null;
        if (p.archived === undefined) p.archived = false;
        if (p.serverPending === undefined) p.serverPending = false;
      }
      return s;
    }
  } catch {
    /* corrupted storage -> start fresh */
  }
  return { profiles: {}, queue: [], lastSyncAt: null, parentId: null, parentEmail: null };
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full/blocked — lesson continues in memory */
  }
}

export function newProfile(name, avatar) {
  const now = new Date().toISOString();
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    id,
    name,
    avatar,
    track: null, // 'pre' | 'early' — set by the readiness check
    placement: null,
    level: 0, // index into SOUNDS: current target sound
    mastery: {}, // grapheme -> { status, attempts: [] }
    misses: [],
    companion: { animal: 'fox', color: 'purple', accessory: 'none', unlocked: ['none'] },
    sessions: [],
    exposure: 0, // pre-reader: how many sounds have been introduced
    lastMission: null,
    birthYear: null, // optional; used only to suggest a starting track
    claimed: false, // true once the profile belongs to the signed-in parent's account
    serverPending: false, // created offline while logged in; claim flow attaches it later
    archived: false, // soft-archived by the parent (hidden from kids, restorable)
    createdAt: now,
    updatedAt: now,
  };
}

export function touchProfile(p) {
  p.updatedAt = new Date().toISOString();
  return p;
}

function uuid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Append a progress event to the pending sync queue. */
export function queueEvent(store, profileId, type, payload = {}) {
  const ev = {
    id: uuid(),
    profile_id: profileId,
    type,
    payload,
    created_at: new Date().toISOString(),
  };
  store.queue.push(ev);
  // Bound the queue; oldest-first drop is acceptable for an MVP event log.
  if (store.queue.length > 500) store.queue = store.queue.slice(-500);
  return ev;
}

export function pendingCount(store) {
  return store.queue.length;
}

/** Remove acked event ids from the queue. */
export function ackEvents(store, ids) {
  const set = new Set(ids);
  store.queue = store.queue.filter((e) => !set.has(e.id));
}

/** Profile ids the parent chose NOT to claim ("Skip" in the claim flow). */
export function loadDismissedClaimIds() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(CLAIM_DISMISSED_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function saveDismissedClaimIds(ids) {
  try {
    localStorage.setItem(CLAIM_DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

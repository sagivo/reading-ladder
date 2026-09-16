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

/**
 * Synchronous store mutation: applies `mutator` to a fresh copy, writes it
 * to localStorage IMMEDIATELY, and returns it. App.jsx's `commit` uses this
 * instead of a React setState updater — the old updater deferred saveStore
 * until React flushed, so any synchronous loadStore() in the same tick
 * (editKid's PUT payload, the claim flow's syncNow, mergeOnLaunch's parent
 * check) silently read STALE data.
 */
export function mutateStore(mutator) {
  const s = loadStore();
  mutator(s);
  saveStore(s);
  return s;
}

/**
 * Apply a POST /api/auth/adopt result to local profiles (pure, testable).
 * Returns { claimed: [ids], blocked: [{ id, name, reason }] }.
 * Profiles the server skipped (e.g. owned by another parent) are flagged
 * with `claimBlocked` so the UI shows an honest message instead of nagging
 * the import prompt on every launch.
 */
export function applyAdoptResult(store, res) {
  const adopted = new Set((res && res.adopted) || []);
  const skipped = (res && res.skipped) || [];
  const claimed = [];
  for (const id of adopted) {
    const p = store.profiles[id];
    if (p) {
      p.claimed = true;
      p.serverPending = false;
      claimed.push(id);
    }
  }
  const blocked = [];
  for (const sk of skipped) {
    if (!sk || !sk.id) continue;
    const p = store.profiles[sk.id];
    if (p) {
      p.claimBlocked = sk.reason || 'unavailable';
      blocked.push({ id: sk.id, name: p.name, reason: sk.reason || 'unavailable' });
    }
  }
  return { claimed, blocked };
}

/** Clear claimBlocked flags (e.g. the parent retries claiming from the dashboard). */
export function clearClaimBlocked(store, ids) {
  for (const id of ids || []) {
    const p = store.profiles[id];
    if (p) delete p.claimBlocked;
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
    voice: 'sarah', // narration voice: 'sarah' | 'brian' (parent picks)
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

/** Profile ids the parent chose NOT to claim ("Skip" in the claim flow). */export function loadDismissedClaimIds() {
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

// ---- In-lesson progress (resume after reload) ------------------------------
// A reload mid-lesson used to drop the child back at the profile picker with
// the lesson gone. We persist { plan, step } per profile; Home offers
// "Continue lesson" while it is fresh (< 24h). Cleared on finishLesson.

const LESSON_KEY = 'reading-ladder-lesson-v1';
const LESSON_TTL_MS = 24 * 60 * 60 * 1000;

export function saveLessonProgress(profileId, plan, step) {
  try {
    const all = JSON.parse(localStorage.getItem(LESSON_KEY) || '{}');
    all[profileId] = { plan, step, savedAt: Date.now() };
    localStorage.setItem(LESSON_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function loadLessonProgress(profileId) {
  try {
    const all = JSON.parse(localStorage.getItem(LESSON_KEY) || '{}');
    const r = all[profileId];
    if (!r || !r.plan || typeof r.step !== 'number') return null;
    if (Date.now() - (r.savedAt || 0) > LESSON_TTL_MS) {
      clearLessonProgress(profileId);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

export function clearLessonProgress(profileId) {
  try {
    const all = JSON.parse(localStorage.getItem(LESSON_KEY) || '{}');
    delete all[profileId];
    localStorage.setItem(LESSON_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// ---- Readiness-check progress (resume after reload) ------------------------
// Same pattern as lesson progress: a reload mid-readiness-check used to drop
// the child back at the first question. We persist { game, results } per
// profile; Home offers "Continue check" while it is fresh (< 24h). Cleared
// when the check completes (placement is set).

const READINESS_KEY = 'reading-ladder-readiness-v1';
const READINESS_TTL_MS = 24 * 60 * 60 * 1000;

export function saveReadinessProgress(profileId, game, results) {
  try {
    const all = JSON.parse(localStorage.getItem(READINESS_KEY) || '{}');
    all[profileId] = { game, results, savedAt: Date.now() };
    localStorage.setItem(READINESS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function loadReadinessProgress(profileId) {
  try {
    const all = JSON.parse(localStorage.getItem(READINESS_KEY) || '{}');
    const r = all[profileId];
    if (!r || typeof r.game !== 'number' || !r.results || typeof r.results !== 'object') return null;
    if (Date.now() - (r.savedAt || 0) > READINESS_TTL_MS) {
      clearReadinessProgress(profileId);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}

export function clearReadinessProgress(profileId) {
  try {
    const all = JSON.parse(localStorage.getItem(READINESS_KEY) || '{}');
    delete all[profileId];
    localStorage.setItem(READINESS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * Session boundary: one completed lesson per calendar day per reader.
 * p.sessions entries carry { at: ISO string } (App.finishLesson). Only
 * COMPLETED lessons count — an in-progress lesson still offers "Continue".
 * Local device date: the boundary a family actually lives by.
 */
export function didLessonToday(profile) {
  if (!profile || !Array.isArray(profile.sessions)) return false;
  const today = new Date().toDateString();
  return profile.sessions.some((s) => {
    if (!s || !s.at) return false;
    const d = new Date(s.at);
    return !isNaN(d) && d.toDateString() === today;
  });
}

// The Reading Ladder — app orchestrator.
// State-based screens (no router): auth -> claim -> home -> readiness ->
// placement -> lesson -> end, plus parent dashboard, kid management,
// and companion picker.
//
// Parent-gated: on launch the app verifies the parent session via
// GET /api/auth/me. No kid access at all until a parent is signed in.
// Local-first: the store in localStorage is the source of truth during a
// lesson; progress events queue up and sync to D1 via Pages Functions
// when online (see lib/sync.js). Only profiles claimed by the signed-in
// parent sync; unclaimed device profiles wait for the claim flow.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Home from './components/Home.jsx';
import Auth from './components/Auth.jsx';
import Claim from './components/Claim.jsx';
import Kids from './components/Kids.jsx';
import Readiness from './components/Readiness.jsx';
import LevelLesson from './components/LevelLesson.jsx';
import { companionEmoji } from './components/Home.jsx';
import SessionEnd from './components/SessionEnd.jsx';
import ParentDash from './components/ParentDash.jsx';
import Companion from './components/Companion.jsx';
import { Screen, Title, Subtitle, ParentGate } from './components/ui.jsx';
import { loadStore, saveStore, touchProfile, queueEvent, loadDismissedClaimIds, saveDismissedClaimIds, mutateStore, clearClaimBlocked } from './lib/store.js';
import { saveLessonProgress, loadLessonProgress, clearLessonProgress, clearReadinessProgress, loadSitting, saveSitting, clearSitting, SITTING_GAP_MS } from './lib/store.js';
import { mergeOnLaunch, syncNow, onSyncState } from './lib/sync.js';
import { getMe, logout, listProfiles, isAuthError } from './lib/auth.js';
import { ensureV2Profile, currentV2Level, advanceV2 } from './lib/curriculum2.js';
import { ACCESSORIES } from './lib/curriculum.js';
import { setVoice, DEFAULT_VOICE } from './lib/narration.js';
import { onPraise, PRAISE_MS } from './lib/praise.js';

/** Floating celebration banner: correct answers advance the lesson
    immediately, and the praise travels with the transition instead of
    holding the screen hostage. */
function PraiseOverlay() {
  const [text, setText] = useState(null);
  useEffect(() => {
    let timer = null;
    const off = onPraise((t) => {
      setText(t);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setText(null), PRAISE_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!text) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#fff7d6', border: '4px solid #f5b301',
      borderRadius: 24, padding: '12px 28px', fontSize: 30, fontWeight: 800,
      color: '#2d2a45', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      pointerEvents: 'none', textAlign: 'center', maxWidth: '90vw',
    }}>
      {text}
    </div>
  );
}

function OfflineBanner() {
  return (
    <div style={{
      background: '#fff7d6', borderBottom: '3px solid #f5b301',
      padding: '10px 16px', fontSize: 18, fontWeight: 700, textAlign: 'center',
      fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#2d2a45',
    }}>
      📴 You're offline — play continues, progress will sync later.
    </div>
  );
}

export default function App() {
  const [store, setStore] = useState(() => loadStore());
  const [screen, setScreen] = useState('checking'); // checking|auth|claim|home|kids|readiness|lesson|end|companion|parent
  const [parent, setParent] = useState(null);
  const parentRef = useRef(null);
  const [authNotice, setAuthNotice] = useState(null); // 'expired' | 'offline' | null
  const [claimIds, setClaimIds] = useState(null);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [activeId, setActiveId] = useState(null);
  const [level, setLevel] = useState(1); // v2 level currently being played
  const [resumeStep, setResumeStep] = useState(0);
  const [summary, setSummary] = useState(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [sessionLevels, setSessionLevels] = useState([]); // v2 levels completed this sitting
  const [newAccessory, setNewAccessory] = useState(null);
  const [kidsGate, setKidsGate] = useState(false); // grown-up check before reader management

  function setParentBoth(p) {
    parentRef.current = p;
    setParent(p);
  }

  // syncNow() mutates localStorage directly (ackEvents + saveStore), so the
  // React `store` state would otherwise keep showing a stale queue count
  // forever — the dashboard sat on "N changes waiting to sync" after a
  // successful drain. Reload the store whenever a sync run settles into a
  // terminal state (not on 'syncing' — that would re-render mid-run).
  useEffect(
    () =>
      onSyncState((s) => {
        if (s && s.state && s.state !== 'syncing') setStore({ ...loadStore() });
      }),
    []
  );

  /** Session is gone: drop to the parent sign-in screen. */
  function handleSessionExpired() {
    setParentBoth(null);
    setActiveId(null);
    setClaimIds(null);
    setAuthNotice('expired');
    setScreen('auth');
  }

  // ---- launch: verify parent session, then merge + claim check ----
  async function maybeClaim() {
    if (!parentRef.current) return;
    let serverIds = [];
    try {
      const r = await listProfiles();
      serverIds = (r.profiles || []).map((p) => p.id);
    } catch (e) {
      if (isAuthError(e)) {
        handleSessionExpired();
        return;
      }
      console.warn('claim check failed', e);
      return;
    }
    const inServer = new Set(serverIds);
    const dismissed = new Set(loadDismissedClaimIds());
    const s = loadStore();
    const cands = Object.values(s.profiles).filter(
      (p) => !p.claimed && !p.claimBlocked && !inServer.has(p.id) && !dismissed.has(p.id)
    );
    if (cands.length > 0) {
      setClaimIds(cands.map((p) => p.id));
      setScreen('claim');
    }
  }

  async function handleAuthed(p) {
    setParentBoth(p);
    setAuthNotice(null);
    commit((s) => {
      s.parentId = p.id;
      s.parentEmail = p.email;
    });
    setScreen('checking');
    try {
      const r = await mergeOnLaunch(p.id);
      setStore({ ...r.store });
      if (r.auth) {
        handleSessionExpired();
        return;
      }
      try {
        await syncNow();
      } catch (e) {
        if (isAuthError(e)) {
          handleSessionExpired();
          return;
        }
        // Offline or server hiccup: carry on with on-device data.
        console.warn('launch sync failed', e);
      }
      setStore({ ...loadStore() });
      await maybeClaim();
      setScreen((prev) => (prev === 'checking' ? 'home' : prev)); // maybeClaim may have set 'claim'
    } catch (e) {
      console.warn('launch failed', e);
      if (isAuthError(e)) handleSessionExpired();
      else setScreen('home');
    }
  }

  async function doLogout() {
    try {
      await logout();
    } catch (e) {
      console.warn('logout failed', e);
    }
    commit((s) => {
      s.parentId = null;
      s.parentEmail = null;
    });
    setParentBoth(null);
    setActiveId(null);
    setClaimIds(null);
    setAuthNotice(null);
    setScreen('auth');
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        await handleAuthed(me.parent);
      } catch (e) {
        if (cancelled) return;
        if (isAuthError(e)) {
          setParentBoth(null);
          setAuthNotice(null);
          setScreen('auth');
        } else {
          console.warn('auth check failed', e);
          const s = loadStore();
          if (s.parentId) {
            // Offline (or server hiccup) with a previous session on this
            // device: carry on with on-device data. No kid access is granted
            // without a prior parent login.
            setParentBoth({ id: s.parentId, email: s.parentEmail });
            setScreen('home');
          } else {
            setAuthNotice('offline');
            setScreen('auth');
          }
        }
      }
    })();
    const onOnline = () => {
      setOnline(true);
      syncNow()
        .then(() => setStore({ ...loadStore() }))
        .catch((e) => {
          if (isAuthError(e)) handleSessionExpired();
        });
      maybeClaim();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous commit: mutateStore writes localStorage IMMEDIATELY and the
  // same object becomes React state. (The old setState-updater version
  // deferred saveStore until React flushed, so synchronous loadStore() calls
  // in the same tick — editKid's PUT payload, the claim flow, mergeOnLaunch —
  // silently read stale data.)
  function commit(mutator) {
    setStore(mutateStore(mutator));
  }

  function updateProfile(id, fn) {
    commit((s) => {
      const p = s.profiles[id];
      if (p) {
        fn(p);
        touchProfile(p);
      }
    });
  }

  function log(id, type, payload = {}) {
    commit((s) => {
      queueEvent(s, id, type, payload);
    });
  }

  const profiles = Object.values(store.profiles);
  const activeProfiles = profiles.filter((p) => !p.archived);
  const profile = activeId ? store.profiles[activeId] : null;

  // Narration uses the single pre-generated voice (Kristy).
  useEffect(() => {
    setVoice(DEFAULT_VOICE);
  }, [activeId]);

  // ---- flows ----
  /** From the dashboard's sync card: re-offer claiming for unclaimed readers. */
  function reclaimUnclaimed() {
    const s = loadStore();
    const unclaimed = Object.values(s.profiles).filter((p) => !p.claimed);
    if (unclaimed.length === 0) return;
    // Un-dismiss them (and clear any "belongs to another account" flag) so the
    // claim screen offers them again — the other account may have been deleted.
    const ids = new Set(unclaimed.map((p) => p.id));
    commit((st) => clearClaimBlocked(st, [...ids]));
    saveDismissedClaimIds(loadDismissedClaimIds().filter((id) => !ids.has(id)));
    setClaimIds(unclaimed.map((p) => p.id));
    setScreen('claim');
  }

  function selectProfile(id, startLesson = false) {
    setActiveId(id);
    if (startLesson) {
      const p = store.profiles[id];
      if (p && !p.archived && !p.placement) beginReadiness(p);
      else if (p && !p.archived) beginLesson(p);
    }
  }

  // v2 lesson flow: one level = discover -> recognize -> blend -> read -> perform.
  // Levels chain inside a sitting until the fatigue threshold ends the session.
  const FATIGUE_MS = 15 * 60 * 1000;

  function beginLesson(p, saved = null) {
    updateProfile(p.id, (prof) => { ensureV2Profile(prof); });
    const fresh = loadStore().profiles[p.id];
    const lvl = (saved && (saved.v2level || (saved.plan && saved.plan.v2level)))
      || currentV2Level(fresh);
    setLevel(lvl);
    setResumeStep(saved && typeof saved.step === 'number' ? saved.step : 0);
    // The sitting's fatigue clock persists across Home exits: resuming the
    // same day after a short break continues the clock, so leaving via Home
    // can't grant a fresh 15 minutes. A new day or a long break starts a
    // new sitting. (Also fixes the old relaunch bug where sessionStart was 0
    // and fatigue triggered instantly.)
    const now = Date.now();
    let start = now;
    const prev = loadSitting();
    if (prev && prev.profileId === p.id && prev.start) {
      const sameDay = new Date(prev.start).toDateString() === new Date(now).toDateString();
      const gapOk = now - (prev.lastActive || prev.start) < SITTING_GAP_MS;
      if (sameDay && gapOk) start = prev.start;
    }
    setSessionStart(start);
    saveSitting({ profileId: p.id, start, lastActive: now });
    if (!saved) {
      setSessionLevels([]);
      log(p.id, 'lesson_started', { level: lvl, track: fresh.v2.track });
    } else {
      log(p.id, 'lesson_resumed', { level: lvl, step: saved.step });
    }
    setScreen('lesson');
  }

  function finishLevel({ level: doneLevel }) {
    const id = activeId;
    clearLessonProgress(id);
    const minutes = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));
    let nextLvl = doneLevel;
    let totalStars = 0;
    let justCompletedAll = false;
    commit((s) => {
      const p = s.profiles[id];
      if (!p) return;
      ensureV2Profile(p);
      const was = !!p.v2.completedAll;
      nextLvl = advanceV2(p, doneLevel);
      justCompletedAll = !was && !!p.v2.completedAll;
      totalStars = p.v2.stars.length;
      touchProfile(p);
      queueEvent(s, p.id, 'level_completed', { minutes, level: doneLevel });
    });
    const doneLevels = [...sessionLevels, doneLevel];
    setSessionLevels(doneLevels);
    if (justCompletedAll) {
      // The whole curriculum is done: celebrate and end the sitting instead
      // of silently looping an identical level-37 lesson.
      endSitting({ id, doneLevels, minutes, totalStars, completedAll: true });
    } else if (Date.now() - sessionStart > FATIGUE_MS) {
      // Sitting's over: one session record per sitting (the daily cap keys
      // off sessions), one accessory per sitting, then the sleepy ending.
      endSitting({ id, doneLevels, minutes, totalStars });
    } else {
      // Keep the sitting flowing: straight into the next level.
      setLevel(nextLvl);
      setResumeStep(0);
      log(id, 'lesson_started', { level: nextLvl });
    }
  }

  // Write one session record per sitting, award at most one accessory per
  // sitting, clear the sitting clock, and show the end screen.
  function endSitting({ id, doneLevels, minutes, totalStars, completedAll = false }) {
    let unlocked = null;
    commit((s) => {
      const p = s.profiles[id];
      if (!p) return;
      p.sessions.push({ at: new Date().toISOString(), minutes, v2: true, levels: doneLevels, completedAll });
      const idx = Math.min(p.sessions.length, ACCESSORIES.length - 1);
      const acc = ACCESSORIES[idx];
      if (acc && !p.companion.unlocked.includes(acc.id)) {
        p.companion.unlocked.push(acc.id);
        unlocked = acc.id;
      }
      touchProfile(p);
      queueEvent(s, p.id, 'session_ended', { minutes, levels: doneLevels, completedAll });
    });
    clearSitting();
    setNewAccessory(unlocked);
    setSummary({ levels: doneLevels, stars: totalStars, minutes, completedAll });
    setScreen('end');
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function readinessDone(placement) {
    if (!activeId) return;
    clearReadinessProgress(activeId);
    updateProfile(activeId, (p) => {
      p.placement = placement;
      p.track = placement.track; // 'main' | 'basics'
      ensureV2Profile(p);
      p.v2.track = placement.track;
      p.v2.level = 1;
      p.v2.stars = [];
      p.v2.basicsAt = 1;
    });
    log(activeId, 'track_set', { track: placement.track, placement });
    // v2 goes straight into the first level — no placement screen.
    beginLesson(loadStore().profiles[activeId]);
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  /** Start the readiness check for a not-yet-placed reader (always fresh —
      two quick trials, nothing worth resuming). */
  function beginReadiness(p) {
    setActiveId(p.id);
    log(p.id, 'readiness_started', {});
    setScreen('readiness');
  }

  function overrideTrack(id, track) {
    updateProfile(id, (p) => {
      p.track = track;
      ensureV2Profile(p);
      p.v2.track = track;
      p.v2.level = 1;
      p.v2.stars = [];
      p.v2.basicsAt = 1;
    });
    log(id, 'track_set', { track, overridden: true });
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function goHome() {
    // Leaving mid-lesson keeps the sitting clock: stamp lastActive so a
    // same-day resume continues the sitting instead of starting a fresh one.
    if (screen === 'lesson' && activeId) {
      const prev = loadSitting();
      if (prev && prev.profileId === activeId) saveSitting({ ...prev, lastActive: Date.now() });
    }
    setScreen('home');
    setLevel(1);
  }

  // In-lesson position for the resume offer on Home (v2 shape: { v, v2level }).
  function handleLessonStep(i) {
    if (activeId) saveLessonProgress(activeId, { v: 2, v2level: level }, i);
  }

  // Resume offers for Home: a half-finished readiness check ("Continue check")
  // or a half-finished lesson ("Continue lesson"). Readiness resume only
  // applies before placement is set.
  function resumeInfoFor(id) {
    if (!id) return null;
    const s = loadStore();
    const p = s.profiles[id];
    const l = loadLessonProgress(id);
    if (l) return { kind: 'lesson', saved: l };
    return null;
  }

  const parentScreens = ['home', 'kids', 'parent', 'claim'];
  const showOffline = !online && parentScreens.includes(screen);

  return (
    <>
      <PraiseOverlay />
      {showOffline && <OfflineBanner />}
      {screen === 'checking' && (
        <Screen>
          <div style={{ fontSize: 64 }}>🪜📖</div>
          <Title>The Reading Ladder</Title>
          <Subtitle>Loading…</Subtitle>
        </Screen>
      )}
      {screen === 'auth' && (
        <Auth notice={authNotice} onAuthed={handleAuthed} />
      )}
      {screen === 'claim' && claimIds && (
        <Claim
          ids={claimIds}
          store={store}
          commit={commit}
          onDone={() => {
            setClaimIds(null);
            setStore({ ...loadStore() });
            setScreen('home');
            // Newly-claimed readers may have a backlog of on-device events —
            // flush them now that they belong to the account.
            syncNow().then(() => setStore({ ...loadStore() })).catch(() => {});
          }}
          onSessionExpired={handleSessionExpired}
        />
      )}
      {screen === 'home' && (
        <Home
          profiles={activeProfiles}
          activeId={activeId}
          onSelect={selectProfile}
          onParent={() => setScreen('parent')}
          onManageKids={() => { setKidsGate(false); setScreen('kids'); }}
          resumeFor={resumeInfoFor}
          onResume={(id) => {
            const p = store.profiles[id];
            const info = resumeInfoFor(id);
            if (!p || !info) return;
            setActiveId(id);
            beginLesson(p, info.saved);
          }}
        />
      )}
      {screen === 'kids' && !kidsGate && (
        <Screen>
          <ParentGate
            onPass={() => setKidsGate(true)}
            onCancel={() => setScreen('home')}
          />
        </Screen>
      )}
      {screen === 'kids' && kidsGate && (
        <Kids
          store={store}
          commit={commit}
          onBack={goHome}
          onStartKid={(id) => selectProfile(id, true)}
          onSessionExpired={handleSessionExpired}
        />
      )}
      {screen === 'readiness' && profile && (
        <Readiness
          onDone={readinessDone}
          onHome={goHome}
        />
      )}
      {screen === 'lesson' && profile && (
        <LevelLesson
          key={level}
          level={level}
          track={profile.track === 'basics' ? 'basics' : 'main'}
          onHome={goHome}
          onLevelComplete={finishLevel}
          initialStep={resumeStep}
          onStep={handleLessonStep}
          starCount={profile.v2 ? profile.v2.stars.length : 0}
          companion={profile.companion ? companionEmoji(profile.companion) : null}
        />
      )}
      {screen === 'end' && profile && summary && (
        <SessionEnd
          profile={profile}
          summary={summary}
          unlockedAccessory={newAccessory}
          onDone={goHome}
          onCompanion={() => setScreen('companion')}
        />
      )}
      {screen === 'companion' && profile && (
        <Companion
          profile={profile}
          onChange={(c) => {
            updateProfile(profile.id, (p) => { p.companion = c; });
            log(profile.id, 'companion_changed', { companion: c });
          }}
          onBack={() => setScreen(summary ? 'end' : 'home')}
        />
      )}
      {screen === 'parent' && (
        <ParentDash
          store={store}
          profiles={activeProfiles}
          activeId={activeId || (activeProfiles[0] && activeProfiles[0].id)}
          onSelectProfile={setActiveId}
          onOverrideTrack={overrideTrack}
          onBack={goHome}
          parent={parent}
          onLogout={doLogout}
          onManageKids={() => { setKidsGate(true); setScreen('kids'); }} // already past the parent math gate
          onClaimUnclaimed={reclaimUnclaimed}
          onSessionExpired={handleSessionExpired}
          // Re-read the store from localStorage after a sync run settles:
          // syncNow() mutates localStorage directly, so the React `store`
          // state would otherwise keep showing a stale queue count forever.
          refreshSync={() => setStore({ ...loadStore() })}
        />
      )}
    </>
  );
}

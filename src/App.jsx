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
import Placement from './components/Placement.jsx';
import LessonEarly from './components/LessonEarly.jsx';
import LessonPre from './components/LessonPre.jsx';
import SessionEnd from './components/SessionEnd.jsx';
import ParentDash from './components/ParentDash.jsx';
import Companion from './components/Companion.jsx';
import { Screen, Title, Subtitle } from './components/ui.jsx';
import { loadStore, saveStore, touchProfile, queueEvent, loadDismissedClaimIds } from './lib/store.js';
import { saveLessonProgress, loadLessonProgress, clearLessonProgress } from './lib/store.js';
import { mergeOnLaunch, syncNow } from './lib/sync.js';
import { getMe, logout, listProfiles, isAuthError } from './lib/auth.js';
import { buildEarlyLesson, buildPreLesson } from './lib/lesson.js';
import { recordAttempt, newSoundMastery, addMiss, clearMiss, nextTargetIndex, isMastered } from './lib/mastery.js';
import { SOUNDS, ACCESSORIES } from './lib/curriculum.js';
import { setSoundEnabled } from './lib/speech.js';
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
      position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
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
  const [screen, setScreen] = useState('checking'); // checking|auth|claim|home|kids|readiness|placement|lesson|end|companion|parent
  const [parent, setParent] = useState(null);
  const parentRef = useRef(null);
  const [authNotice, setAuthNotice] = useState(null); // 'expired' | 'offline' | null
  const [claimIds, setClaimIds] = useState(null);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [activeId, setActiveId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [resumeStep, setResumeStep] = useState(0);
  const [summary, setSummary] = useState(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [newAccessory, setNewAccessory] = useState(null);

  function setParentBoth(p) {
    parentRef.current = p;
    setParent(p);
  }

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
      (p) => !p.claimed && !inServer.has(p.id) && !dismissed.has(p.id)
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

  function commit(mutator) {
    setStore((prev) => {
      const s = structuredClone(prev);
      mutator(s);
      saveStore(s);
      return s;
    });
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

  // Narration follows the kid's chosen voice (Sarah default).
  useEffect(() => {
    setVoice(profile && profile.voice ? profile.voice : DEFAULT_VOICE);
  }, [activeId, profile && profile.voice]);

  // ---- trial recording (mastery state machine + miss queue) ----
  const recordTrial = useCallback(({ grapheme, word, format, transfer, result, pre }) => {
    if (!activeId) return;
    commit((s) => {
      const p = s.profiles[activeId];
      if (!p) return;
      let masteredNow = null;
      if (grapheme && !pre) {
        if (!p.mastery[grapheme]) p.mastery[grapheme] = newSoundMastery();
        const before = p.mastery[grapheme].status;
        recordAttempt(p.mastery[grapheme], {
          format,
          correct: result.correct && !result.modeled,
          hints: result.hints || 0,
          transfer: !!transfer,
        });
        if (before !== 'mastered' && p.mastery[grapheme].status === 'mastered') {
          masteredNow = grapheme;
        }
      }
      // A miss (or a heavily-hinted success) resurfaces in next review.
      if (!result.correct || (result.hints || 0) > 0) {
        if (word) addMiss(p, { kind: 'word', ref: word, format });
        else if (grapheme && !pre) addMiss(p, { kind: 'sound', ref: grapheme, format });
        queueEvent(s, p.id, 'miss_recorded', { grapheme, word, format });
      }
      if (masteredNow) {
        queueEvent(s, p.id, 'sound_mastered', { grapheme: masteredNow });
      }
      queueEvent(s, p.id, 'trial', {
        grapheme, word, format, transfer: !!transfer,
        correct: result.correct, modeled: !!result.modeled, hints: result.hints || 0,
      });
      touchProfile(p);
    });
  }, [activeId]);

  const L = {
    trial: recordTrial,
    clearMiss: (missId) => {
      if (!activeId) return;
      updateProfile(activeId, (p) => clearMiss(p, missId));
    },
  };

  // ---- flows ----
  function selectProfile(id, startLesson = false) {
    setActiveId(id);
    if (startLesson) {
      const p = store.profiles[id];
      if (p && !p.archived && !p.placement) setScreen('readiness');
      else if (p && !p.archived) beginLesson(p);
    }
  }

  function beginLesson(p, saved = null) {
    const lp = saved && saved.plan ? saved.plan : (p.track === 'early' ? buildEarlyLesson(p) : buildPreLesson(p));
    setPlan(lp);
    setResumeStep(saved && typeof saved.step === 'number' ? saved.step : 0);
    setSessionStart(Date.now());
    if (!saved) {
      log(p.id, 'lesson_started', { kind: lp.kind, sound: lp.sound ? lp.sound.g : lp.focus.g });
    } else {
      log(p.id, 'lesson_resumed', { kind: lp.kind, step: saved.step });
    }
    setScreen('lesson');
  }

  function finishLesson(sum) {
    const minutes = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));
    const id = activeId;
    clearLessonProgress(id);
    let unlocked = null;
    commit((s) => {
      const p = s.profiles[id];
      if (!p) return;
      p.sessions.push({ at: new Date().toISOString(), minutes, newSound: sum.newSound || sum.focusSound, wordsRead: sum.wordsRead || 0 });
      if (p.track === 'early') {
        p.level = nextTargetIndex(p, SOUNDS);
      } else {
        p.exposure = Math.min((p.exposure || 0) + 1, SOUNDS.length - 1);
      }
      p.lastMission = sum.mission;
      // Finite reward: one accessory per completed session.
      const idx = Math.min(p.sessions.length, ACCESSORIES.length - 1);
      const acc = ACCESSORIES[idx];
      if (acc && !p.companion.unlocked.includes(acc.id)) {
        p.companion.unlocked.push(acc.id);
        unlocked = acc.id;
      }
      touchProfile(p);
      queueEvent(s, p.id, 'lesson_completed', { minutes, newSound: sum.newSound || sum.focusSound, wordsRead: sum.wordsRead || 0 });
      queueEvent(s, p.id, 'session_ended', { minutes, mission: sum.mission });
    });
    setNewAccessory(unlocked);
    setSummary({ ...sum, minutes });
    setScreen('end');
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function readinessDone(placement) {
    if (!activeId) return;
    updateProfile(activeId, (p) => {
      p.placement = placement;
      p.track = placement.track;
    });
    log(activeId, 'track_set', { track: placement.track, placement });
    setScreen('placement');
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function setProfileVoice(id, voice) {
    updateProfile(id, (p) => { p.voice = voice === 'brian' ? 'brian' : 'sarah'; });
    log(id, 'voice_set', { voice });
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function overrideTrack(id, track) {
    updateProfile(id, (p) => { p.track = track; });
    log(id, 'track_set', { track, overridden: true });
    syncNow().catch((e) => {
      if (isAuthError(e)) handleSessionExpired();
    });
  }

  function goHome() {
    setScreen('home');
    setPlan(null);
  }

  // In-lesson position for the resume offer on Home.
  function handleLessonStep(i) {
    if (activeId && plan) saveLessonProgress(activeId, plan, i);
  }

  function resumeInfoFor(id) {
    if (!id) return null;
    return loadLessonProgress(id);
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
          onManageKids={() => setScreen('kids')}
          soundOn={soundOn}
          onToggleSound={() => {
            const v = !soundOn;
            setSoundOn(v);
            setSoundEnabled(v);
          }}
          resumeFor={resumeInfoFor}
          onResume={(id) => {
            const p = store.profiles[id];
            const saved = loadLessonProgress(id);
            if (p && saved) {
              setActiveId(id);
              beginLesson(p, saved);
            }
          }}
        />
      )}
      {screen === 'kids' && (
        <Kids
          store={store}
          commit={commit}
          onBack={goHome}
          onStartKid={(id) => selectProfile(id, true)}
          onSessionExpired={handleSessionExpired}
        />
      )}
      {screen === 'readiness' && profile && (
        <Readiness profile={profile} onDone={readinessDone} onHome={goHome} />
      )}
      {screen === 'placement' && profile && (
        <Placement
          profile={profile}
          onHome={goHome}
          onStart={() => beginLesson(profile)}
          onOverride={(track) => overrideTrack(profile.id, track)}
        />
      )}
      {screen === 'lesson' && profile && plan && plan.kind === 'early' && (
        <LessonEarly profile={profile} plan={plan} L={L} onHome={goHome} onFinish={finishLesson} initialStep={resumeStep} onStep={handleLessonStep} />
      )}
      {screen === 'lesson' && profile && plan && plan.kind === 'pre' && (
        <LessonPre profile={profile} plan={plan} L={L} onHome={goHome} onFinish={finishLesson} initialStep={resumeStep} onStep={handleLessonStep} />
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
          onSetVoice={setProfileVoice}
          onBack={goHome}
          parent={parent}
          onLogout={doLogout}
          onManageKids={() => setScreen('kids')}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </>
  );
}

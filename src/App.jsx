// The Reading Ladder — app orchestrator.
// State-based screens (no router): home -> readiness -> placement ->
// lesson -> end, plus parent dashboard and companion picker.
// Local-first: the store in localStorage is the source of truth during a
// lesson; progress events queue up and sync to D1 via Pages Functions
// when online (see lib/sync.js).

import React, { useState, useEffect, useCallback } from 'react';
import Home from './components/Home.jsx';
import Readiness from './components/Readiness.jsx';
import Placement from './components/Placement.jsx';
import LessonEarly from './components/LessonEarly.jsx';
import LessonPre from './components/LessonPre.jsx';
import SessionEnd from './components/SessionEnd.jsx';
import ParentDash from './components/ParentDash.jsx';
import Companion from './components/Companion.jsx';
import { loadStore, saveStore, newProfile, touchProfile, queueEvent } from './lib/store.js';
import { mergeOnLaunch, syncNow, getSyncState } from './lib/sync.js';
import { buildEarlyLesson, buildPreLesson } from './lib/lesson.js';
import { recordAttempt, newSoundMastery, addMiss, clearMiss, nextTargetIndex, isMastered } from './lib/mastery.js';
import { SOUNDS, ACCESSORIES } from './lib/curriculum.js';
import { setSoundEnabled } from './lib/speech.js';

export default function App() {
  const [store, setStore] = useState(() => loadStore());
  const [screen, setScreen] = useState('home');
  const [activeId, setActiveId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [newAccessory, setNewAccessory] = useState(null);

  // Launch: merge server state (last-write-wins per profile), then push queue.
  useEffect(() => {
    let cancelled = false;
    mergeOnLaunch().then((r) => {
      if (cancelled) return;
      setStore({ ...r.store });
      return syncNow();
    }).catch(() => {});
    const onOnline = () => syncNow().catch(() => {});
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
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
  const profile = activeId ? store.profiles[activeId] : null;

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
  function createProfile(name, avatar) {
    const p = newProfile(name, avatar);
    commit((s) => {
      s.profiles[p.id] = p;
      queueEvent(s, p.id, 'profile_created', { name, avatar });
      saveStore(s);
    });
    setActiveId(p.id);
    syncNow().catch(() => {});
  }

  function selectProfile(id, startLesson = false) {
    setActiveId(id);
    if (startLesson) {
      const p = store.profiles[id];
      if (p && !p.placement) setScreen('readiness');
      else if (p) beginLesson(p);
    }
  }

  function beginLesson(p) {
    const lp = p.track === 'early' ? buildEarlyLesson(p) : buildPreLesson(p);
    setPlan(lp);
    setSessionStart(Date.now());
    log(p.id, 'lesson_started', { kind: lp.kind, sound: lp.sound ? lp.sound.g : lp.focus.g });
    setScreen('lesson');
  }

  function finishLesson(sum) {
    const minutes = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));
    const id = activeId;
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
    syncNow().catch(() => {});
  }

  function readinessDone(placement) {
    if (!activeId) return;
    updateProfile(activeId, (p) => {
      p.placement = placement;
      p.track = placement.track;
    });
    log(activeId, 'track_set', { track: placement.track, placement });
    setScreen('placement');
    syncNow().catch(() => {});
  }

  function overrideTrack(id, track) {
    updateProfile(id, (p) => { p.track = track; });
    log(id, 'track_set', { track, overridden: true });
    syncNow().catch(() => {});
  }

  function goHome() {
    setScreen('home');
    setPlan(null);
  }

  const syncBadge = getSyncState();

  return (
    <>
      {screen === 'home' && (
        <Home
          profiles={profiles}
          activeId={activeId}
          onSelect={selectProfile}
          onCreate={createProfile}
          onParent={() => setScreen('parent')}
          soundOn={soundOn}
          onToggleSound={() => {
            const v = !soundOn;
            setSoundOn(v);
            setSoundEnabled(v);
          }}
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
        <LessonEarly profile={profile} plan={plan} L={L} onHome={goHome} onFinish={finishLesson} />
      )}
      {screen === 'lesson' && profile && plan && plan.kind === 'pre' && (
        <LessonPre profile={profile} plan={plan} L={L} onHome={goHome} onFinish={finishLesson} />
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
          profiles={profiles}
          activeId={activeId || (profiles[0] && profiles[0].id)}
          onSelectProfile={setActiveId}
          onOverrideTrack={overrideTrack}
          onBack={goHome}
        />
      )}
    </>
  );
}

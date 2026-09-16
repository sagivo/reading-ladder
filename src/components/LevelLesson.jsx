// LevelLesson — v2 lesson orchestrator.
// One level = one new sound (or review). Arc: discover -> recognize ->
// blend -> read -> perform (pre-blend levels: discover -> recognize ->
// recognize2 -> perform; review: recognize -> blend -> read -> perform).

import React, { useState, useMemo } from 'react';
import { Screen, TopBar, ProgressDots } from './ui.jsx';
import DiscoverBarn from './DiscoverBarn.jsx';
import RecognizeSheep from './RecognizeSheep.jsx';
import BlendVoice from './BlendVoice.jsx';
import ReadStory from './ReadStory.jsx';
import GoFindSomeone from './GoFindSomeone.jsx';
import LevelMap, { MAP_DIRECTION } from './LevelMap.jsx';
import {
  META, levelKind, newSound, taughtSet,
  blendWordsForLevel, stepsForLevel, microStory, mulberry32,
} from '../lib/curriculum2.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function soundOf(g) {
  return { g, ...META[g] };
}

export default function LevelLesson({ level, track = 'main', onHome, onLevelComplete, initialStep = 0, onStep, starCount = null, companion = null }) {
  // Basics is sounds-only: discover + recognize, never blend/read/perform.
  const steps = useMemo(
    () => (track === 'basics' ? ['discover', 'recognize', 'recognize2'] : stepsForLevel(level)),
    [level, track]
  );
  const [idx, setIdx] = useState(() => Math.min(initialStep, steps.length - 1));
  const [results, setResults] = useState([]);
  // The beanstalk map opens the level and returns between activities; the
  // child taps the glowing node to launch the next activity in order.
  const [mapOpen, setMapOpen] = useState(true);
  const step = steps[idx];

  const ctx = useMemo(() => {
    const kind = levelKind(level);
    const g = newSound(level);
    const taught = [...taughtSet(level)];
    // Review levels: cycle through a few taught sounds as recognize targets.
    const reviewTargets = kind === 'review' ? shuffle(taught).slice(0, 3) : [];
    const target = g || reviewTargets[0] || 'a';
    return {
      kind, g, taught, reviewTargets,
      sound: soundOf(target),
      target, say: META[target].say,
      // Seeded by level: the same words every visit, so every spoken word
      // has a pre-generated audio clip (no runtime TTS).
      blendWords: blendWordsForLevel(level, 3, mulberry32(level)),
      sentences: microStory(level, level),
    };
  }, [level]);

  const advance = (result) => {
    const next = [...results, { step, ...result }];
    setResults(next);
    if (idx + 1 >= steps.length) onLevelComplete({ level, results: next });
    else {
      // Back to the map: the star lands on the finished node and the next
      // node starts glowing. Persist the next index so resume lands on the
      // map with the right current node.
      if (onStep) onStep(idx + 1);
      setIdx(idx + 1);
      setMapOpen(true);
    }
  };

  // The child taps the glowing node: launch that activity (always the
  // current one — completed nodes and buds are not tap targets).
  const pick = (i) => {
    if (i !== idx) return;
    if (onStep) onStep(i);
    setMapOpen(false);
  };

  const replayFor = (s) => {
    if (s === 'discover') return 'Tap the barn!';
    if (s === 'recognize' || s === 'recognize2') {
      const alt = ctx.kind === 'review' ? ctx.reviewTargets[1] : null;
      const t = s === 'recognize2' && alt ? alt : ctx.target;
      return `Tap the sheep with ${META[t].say}!`;
    }
    if (s === 'blend') return 'Keep your voice ON!';
    if (s === 'read') return "Let's read!";
    return 'Go find someone and read it to them!';
  };
  const bgFor = (s) => {
    if (s === 'map') return 'linear-gradient(180deg, #a8e0ff 0%, #dcf3ff 55%, #fef7e6 100%)';
    if (s === 'discover') return 'linear-gradient(160deg, #e8f7ff 0%, #fdf3e3 100%)';
    if (s === 'recognize' || s === 'recognize2') return 'linear-gradient(160deg, #e8f7ff 0%, #e9f9e4 60%, #dff3d4 100%)';
    return undefined; // default warm shell for blend/read/perform
  };

  const shell = (node, replayOverride) => (
    <Screen bg={bgFor(mapOpen ? 'map' : step)}>
      <TopBar onHome={onHome} replayText={replayOverride || replayFor(step)} starCount={starCount} />
      <ProgressDots total={steps.length} done={idx} />
      {node}
    </Screen>
  );

  if (mapOpen) {
    return shell(
      <LevelMap
        steps={steps}
        currentIdx={idx}
        sound={ctx.sound}
        companion={companion}
        onPick={pick}
      />,
      MAP_DIRECTION
    );
  }

  if (step === 'discover') {
    return shell(<DiscoverBarn sound={ctx.sound} onDone={() => advance({})} onHome={onHome} />);
  }
  if (step === 'recognize' || step === 'recognize2') {
    // Second recognition round uses a different target when possible.
    const alt = ctx.kind === 'review' ? ctx.reviewTargets[1] : null;
    const t = step === 'recognize2' && alt ? alt : ctx.target;
    return shell(
      <RecognizeSheep
        target={t}
        say={META[t].say}
        taught={ctx.taught}
        roundKey={idx}
        onDone={(r) => advance(r)}
        onHome={onHome}
      />
    );
  }
  if (step === 'blend') {
    return shell(<BlendVoice words={ctx.blendWords} onDone={(r) => advance(r)} onHome={onHome} />);
  }
  if (step === 'read') {
    return shell(<ReadStory sentences={ctx.sentences} newGrapheme={ctx.g} onDone={(r) => advance(r)} onHome={onHome} />);
  }
  // perform
  return shell(<GoFindSomeone sentences={ctx.sentences} onDone={(r) => advance(r)} onHome={onHome} />);
}

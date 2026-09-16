// Early-reader daily lesson (closed loop):
// 1. review misses -> 2. ONE new sound -> 3. sound-slider blending ->
// 4. build the word -> 5. decodable story -> 6. session end.
// Every displayed word is pre-validated by the lesson planner.

import React, { useState, useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle, TopBar, ProgressDots, QuizStep, ChoiceButton, randomPraise } from './ui.jsx';
import { narrate as speak, speakSound, stop } from '../lib/narration.js';
import { SOUNDS, WORD_BANK, PREVIEW_WORDS } from '../lib/curriculum.js';
import { parseGraphemes } from '../lib/decodability.js';
import { taughtThrough, isDecodable } from '../lib/decodability.js';
import { FIRST_SOUND_ITEMS, stepsForPlan } from '../lib/lesson.js';

function soundOf(g) {
  return SOUNDS.find((s) => s.g === g) || { g, say: g, keyword: g, emoji: '🔤' };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function StepShell({ step, total, replayText, onHome, children, title }) {
  return (
    <Screen>
      <TopBar onHome={onHome} replayText={replayText} />
      <ProgressDots total={total} done={step} />
      {title ? <Title>{title}</Title> : null}
      {children}
    </Screen>
  );
}

// ---------- 1. Review misses ----------
function ReviewStep({ misses, stage, onDone, L }) {
  const [i, setI] = useState(0);
  const miss = misses[i];
  const taught = taughtThrough(stage);
  const distract = shuffle(
    WORD_BANK.filter((e) => e.w !== miss.ref && e.w.length === miss.ref.length && isDecodable(e.w, taught, PREVIEW_WORDS))
  ).slice(0, 2);
  // The target word is spoken (that's the task) but never printed in the
  // instruction — printing it would turn listening into visual matching.
  const instruction = 'Tap the word you hear.';

  useEffect(() => {
    stop();
    speak(`Let's warm up. Tap the word you hear.`);
    setTimeout(() => speak(miss.ref, { rate: 0.8 }), 1500);
  }, [i]);

  return (
    <QuizStep
      key={i}
      instruction={instruction}
      speakInstruction={false}
      choices={shuffle([
        { id: miss.ref, label: miss.ref, speak: miss.ref },
        ...distract.map((d) => ({ id: d.w, label: d.w, speak: d.w })),
      ])}
      correctId={miss.ref}
      onResult={(r) => {
        L.trial({ word: miss.ref, format: 'recall', transfer: false, result: r, grapheme: null });
        if (r.correct && r.hints === 0) L.clearMiss(miss.id);
        // Immediate: the celebration now travels with the transition (praise.js),
        // so there is no post-correct dead pause.
        (i + 1 < misses.length ? setI(i + 1) : onDone());
      }}
    />
  );
}

// ---------- 2. New sound card ----------
function NewSoundStep({ sound, stage, onDone, L }) {
  const [phase, setPhase] = useState('model'); // model -> practice
  const [trials, setTrials] = useState(0);
  const taught = SOUNDS.slice(0, stage).filter((s) => s.g !== sound.g && s.g.length === 1);

  useEffect(() => {
    stop();
    speak(`Today's new sound. This letter says ${sound.say}, like ${sound.keyword}. Say it with me: ${sound.say}. When you can say it, tap the green button.`);
  }, []);

  if (phase === 'model') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ fontSize: 150, fontWeight: 900, color: '#7c5cd6' }}>{sound.g}</div>
        <div style={{ fontSize: 72 }}>{sound.emoji}</div>
        <Subtitle>/{sound.say}/ … like “{sound.keyword}”</Subtitle>
        <div style={{ display: 'flex', gap: 14 }}>
          <BigButton small color="#6f66a8" onClick={() => speakSound(sound)}>🔁 Hear it</BigButton>
          <BigButton small color="#22a06b" onClick={() => setPhase('practice')}>I can say it ✓</BigButton>
        </div>
      </div>
    );
  }

  const distract = shuffle(taught).slice(0, 2);
  const instruction = `Which letter says /${sound.say}/?`;
  return (
    <QuizStep
      key={trials}
      instruction={instruction}
      choices={shuffle([
        { id: sound.g, label: sound.g, speak: `the letter ${sound.g}` },
        ...distract.map((d) => ({ id: d.g, label: d.g, speak: `the letter ${d.g}` })),
      ])}
      correctId={sound.g}
      onResult={(r) => {
        L.trial({ grapheme: sound.g, format: 'recall', transfer: false, result: r, word: null });
        const t = trials + 1;
        setTrials(t);
        (t < 2 ? setPhase('practice') : onDone());
      }}
    />
  );
}

// ---------- 3a. Sound slider blending ----------
function BlendStep({ items, stage, onDone, L }) {
  const [i, setI] = useState(0);
  const [active, setActive] = useState(-1);
  const [quizzing, setQuizzing] = useState(false);
  const item = items[i];
  const letters = parseGraphemes(item.word).graphemes;
  const taught = taughtThrough(stage);
  const distractWord = shuffle(
    WORD_BANK.filter((e) => e.w !== item.word && isDecodable(e.w, taught, PREVIEW_WORDS))
  )[0];

  useEffect(() => {
    stop();
    setQuizzing(false);
    setActive(-1);
    speak(`Slide the sounds together. Then say the word fast. When you're done, tap: I read it.`);
  }, [i]);

  async function slide() {
    for (let k = 0; k < letters.length; k++) {
      setActive(k);
      await speakSound(soundOf(letters[k]));
    }
    setActive(-1);
    await speak('Now say it fast!');
    await speak(item.word);
  }

  if (!quizzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: '100%' }}>
        <Subtitle>Slide the sounds together 👉</Subtitle>
        <div style={{ display: 'flex', gap: 12 }}>
          {letters.map((ch, k) => (
            <div
              key={k}
              style={{
                width: 92, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 64, fontWeight: 900, borderRadius: 22,
                background: active === k ? '#fff7d6' : '#fff',
                border: active === k ? '6px solid #f5b301' : '4px solid #d9d4f5',
                transition: 'all 0.15s',
              }}
            >{ch}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <BigButton small onClick={slide}>🐌 Slide it</BigButton>
          <BigButton small color="#22a06b" onClick={() => speak(item.word, { rate: 0.9 })}>⚡ Say it fast</BigButton>
        </div>
        <BigButton small color="#6f66a8" onClick={() => setQuizzing(true)}>I read it ✓</BigButton>
      </div>
    );
  }

  return (
    <QuizStep
      key={i}
      instruction="Tap the word you just read."
      choices={shuffle([
        { id: item.word, label: item.word, speak: item.word },
        { id: distractWord.w, label: distractWord.w, speak: distractWord.w },
      ])}
      correctId={item.word}
      onResult={(r) => {
        L.trial({ grapheme: null, word: item.word, format: 'blend', transfer: item.transfer, result: r });
        (i + 1 < items.length ? setI(i + 1) : onDone());
      }}
    />
  );
}

// ---------- 3b. First-sound fallback (when the set can't blend yet) ----------
function FirstSoundStep({ sound, onDone, L }) {
  const [trial, setTrial] = useState(0);
  const items = FIRST_SOUND_ITEMS[sound.g] || FIRST_SOUND_ITEMS.m;
  const others = shuffle(Object.keys(FIRST_SOUND_ITEMS).filter((k) => k !== sound.g)).slice(0, 3);
  const target = items[trial % items.length];
  const otherItems = FIRST_SOUND_ITEMS[others[trial % others.length]];
  const wrong = otherItems[trial % otherItems.length];
  const instruction = `Which one starts with /${sound.say}/?`;

  useEffect(() => {
    speak(`Which one starts with ${sound.say}? Tap it.`);
  }, [trial]);

  return (
    <QuizStep
      key={trial}
      instruction={instruction}
      choices={shuffle([
        { id: 'yes', label: target[1], sub: target[0], speak: target[0] },
        { id: 'no', label: wrong[1], sub: wrong[0], speak: wrong[0] },
      ])}
      correctId="yes"
      onResult={(r) => {
        L.trial({ grapheme: sound.g, word: null, format: 'recall', transfer: false, result: r });
        const t = trial + 1;
        (t < 3 ? setTrial(t) : onDone());
      }}
    />
  );
}

// ---------- 4. Build the word ----------
function BuildStep({ word, onDone, L }) {
  const letters = parseGraphemes(word).graphemes;
  const [tiles, setTiles] = useState(() =>
    shuffle([...letters, shuffle(SOUNDS.filter((s) => !letters.includes(s.g) && s.g.length === 1))[0].g])
  );
  const [built, setBuilt] = useState([]);
  const [wrong, setWrong] = useState(0);
  const [modeled, setModeled] = useState(false);

  useEffect(() => {
    stop();
    speak(`Build the word ${word}. Tap the letters in order.`);
  }, []);

  async function tapTile(t, idx) {
    if (built.length >= letters.length) return;
    const next = letters[built.length];
    if (t === next) {
      await speakSound(soundOf(t));
      const nb = [...built, t];
      setBuilt(nb);
      setTiles(tiles.filter((_, k) => k !== idx));
      if (nb.length === letters.length) {
        await speak(randomPraise());
        await speak(word);
        onDone({ correct: wrong === 0 && !modeled, modeled, hints: wrong > 0 || modeled ? 1 : 0 });
      }
    } else {
      const w = wrong + 1;
      setWrong(w);
      if (w === 1) {
        speak(`Not yet. Find /${soundOf(next).say}/.`);
      } else {
        setModeled(true);
        speak(`Watch: tap ${next}. Now you do it.`);
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: '100%' }}>
      <Subtitle>Build the word: <b>{word}</b> — tap the letters in order 👇</Subtitle>
      <div style={{ display: 'flex', gap: 12, minHeight: 110 }}>
        {built.map((ch, k) => (
          <div key={k} style={{
            width: 84, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 56, fontWeight: 900, borderRadius: 22, background: '#dcfce7', border: '4px solid #22a06b',
          }}>{ch}</div>
        ))}
        {built.length < letters.length && (
          <div style={{
            width: 84, height: 104, borderRadius: 22, border: '4px dashed #b9b3d6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#b9b3d6',
            ...(modeled ? { border: '6px solid #f5b301', background: '#fff7d6' } : {}),
          }}>{modeled ? letters[built.length] : '?'}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {tiles.map((t, k) => (
          <ChoiceButton key={k} onClick={() => tapTile(t, k)}>
            <span style={{ fontSize: 48 }}>{t}</span>
          </ChoiceButton>
        ))}
      </div>
    </div>
  );
}

// ---------- 5. Decodable story ----------
function StoryStep({ story, onDone, L }) {
  const [heard, setHeard] = useState([]);
  const [quizzing, setQuizzing] = useState(false);
  // Visible hint for the early tap: the spoken guidance alone is silent in
  // a muted room, so the child also SEES what to do.
  const [hint, setHint] = useState(null);

  useEffect(() => {
    stop();
    speak('Now read a real story. Tap each line to hear it, then read it yourself. Then tap: I read it.');
  }, []);

  async function hear(i, text) {
    await speak(text, { rate: 0.9 });
    if (!heard.includes(i)) {
      const next = [...heard, i];
      setHeard(next);
      if (next.length >= story.sentences.length) setHint(null);
    }
  }

  if (!quizzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
        <div style={{
          background: '#fff', borderRadius: 24, padding: 24, width: '100%',
          border: '4px solid #d9d4f5', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {story.sentences.map((s, i) => (
            <button
              key={i}
              onClick={() => hear(i, s.text)}
              style={{
                background: heard.includes(i) ? '#f5f0ff' : '#fff', border: '3px solid #e4e0f7',
                borderRadius: 18, padding: 14, fontSize: 30, fontWeight: 700, cursor: 'pointer',
                textAlign: 'left', lineHeight: 1.5,
              }}
            >
              <span style={{ marginRight: 8 }}>{heard.includes(i) ? '✅' : '🔈'}</span>
              {s.words.map((x, k) => (
                <span key={k}>{x.emoji ? `${x.emoji} ` : ''}{x.w} </span>
              ))}
            </button>
          ))}
        </div>
        {/* Never disabled: a greyed-out dead button feels "stuck" to a small
            child. Tapping early explains what to do instead. */}
        <BigButton small color="#22a06b" onClick={() => {
          if (heard.length < story.sentences.length) {
            setHint('👆 Tap each line to hear the story first!');
            speak('Tap each line to hear the story first. Then tap: I read it.');
            return;
          }
          setQuizzing(true);
        }}>
          I read it ✓
        </BigButton>
        <div aria-live="polite" style={{
          minHeight: 34, fontSize: 22, fontWeight: 700, color: '#5b567d',
          textAlign: 'center', visibility: hint ? 'visible' : 'hidden',
        }}>{hint || '·'}</div>
      </div>
    );
  }

  const q = story.question;
  if (!q) {
    // No question possible — still counts as connected-text practice.
    setTimeout(onDone, 500);
    return null;
  }
  return (
    <QuizStep
      key="story-quiz"
      instruction={q.prompt + ' Tap the answer.'}
      choices={q.choices.map((c) => ({ id: c, label: c, speak: c }))}
      correctId={q.correct}
      onResult={(r) => {
        L.trial({ grapheme: null, word: q.correct, format: 'transfer', transfer: true, result: r });
        onDone();
      }}
    />
  );
}

// ---------- Orchestrator ----------
const STEP_TITLES = ['Warm-up 🔥', 'New sound ✨', 'Stretch & read 🐌', 'Build it 🧱', 'Story time 📖'];

export default function LessonEarly({ profile, plan, L, onFinish, onHome, initialStep = 0, onStep }) {
  // Step list is the shared pure function (src/lib/lesson.js) so the
  // lesson can never disagree with the resume/test harness about order.
  const steps = stepsForPlan(plan);

  const [i, setI] = useState(() => Math.min(initialStep || 0, steps.length - 1));
  const [wordsRead, setWordsRead] = useState(0);
  const step = steps[i];

  // Persist lesson position so a reload mid-lesson can resume (App.jsx).
  useEffect(() => {
    if (onStep) onStep(i);
  }, [i]);
  const replay = {
    review: 'Tap the word you hear.',
    sound: `The letter ${plan.sound.g} says ${plan.sound.say}. When you can say it, tap the green button.`,
    blend: 'Slide the sounds together, then say the word fast. When you are done, tap: I read it.',
    firstsound: `Which one starts with ${plan.sound.say}?`,
    build: `Build the word ${plan.buildWord}. Tap the letters in order.`,
    story: 'Tap each line to hear the story. Then tap: I read it.',
  }[step];

  // Immediate step transitions: the old 600ms wrapper stacked on top of the
  // per-question pause and made every correct answer feel stuck.
  function advance(countWords = 0) {
    setWordsRead((w) => w + countWords);
    if (i + 1 < steps.length) setI(i + 1);
    else {
      const mastered = profile.mastery[plan.sound.g] && profile.mastery[plan.sound.g].status === 'mastered';
      onFinish({ newSound: plan.sound.g, wordsRead: wordsRead + countWords, mission: plan.mission, soundMastered: !!mastered });
    }
  }

  const total = steps.length;
  const titleMap = { review: 'Warm-up 🔥', sound: 'New sound ✨', blend: 'Stretch & read 🐌', firstsound: 'First sounds 👂', build: 'Build it 🧱', story: 'Story time 📖' };

  return (
    <StepShell step={i} total={total} replayText={replay} onHome={onHome} title={titleMap[step]}>
      {step === 'review' && (
        <ReviewStep misses={plan.review} stage={plan.soundIndex} L={L} onDone={() => advance()} />
      )}
      {step === 'sound' && (
        <NewSoundStep sound={plan.sound} stage={plan.soundIndex} L={L} onDone={() => advance()} />
      )}
      {step === 'blend' && (
        <BlendStep items={plan.blendWords} stage={plan.soundIndex} L={L} onDone={() => advance(plan.blendWords.length)} />
      )}
      {step === 'firstsound' && (
        <FirstSoundStep sound={plan.sound} L={L} onDone={() => advance()} />
      )}
      {step === 'build' && (
        <BuildStep
          word={plan.buildWord}
          L={L}
          onDone={(r) => {
            L.trial({ grapheme: plan.sound.g, word: plan.buildWord, format: 'blend', transfer: false, result: r });
            advance(1);
          }}
        />
      )}
      {step === 'story' && (
        <StoryStep story={plan.story} L={L} onDone={() => advance()} />
      )}
    </StepShell>
  );
}

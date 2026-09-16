// Trial state machine for a forgiving multiple-choice question.
// Implements the error language documented on <QuizStep> (ui.jsx):
//   1st miss -> 'retry'  (repeat the goal, same choices)
//   2nd miss -> 'reduce' (fewer choices)
//   3rd miss -> 'model'  (highlight the answer; child taps to copy)
// Correct tap        -> 'correct' (hints = number of misses before it)
// Tap on the highlighted answer in model mode -> 'copied' (correct=false, hints=3)
// Wrong tap in model mode -> 'copy-hint'
// Any tap after the trial is done -> 'ignored'
// Every event carries `done`; callers remount per question (key={trial}) so a
// finished trial never swallows input.

export function createTrial(choices, correctId) {
  const correctChoice = choices.find((c) => c.id === correctId);
  let misses = 0;
  let mode = 'ask'; // 'ask' | 'modeled'
  let done = false;
  let visible = [...choices];

  function tap(id) {
    if (done) return { kind: 'ignored', done: true, hints: misses };
    if (id === correctId) {
      done = true;
      if (mode === 'modeled') return { kind: 'copied', done: true, hints: 3 };
      return { kind: 'correct', done: true, hints: misses };
    }
    // Wrong tap.
    if (mode === 'modeled') return { kind: 'copy-hint', done: false, hints: 3 };
    misses += 1;
    if (misses === 1) return { kind: 'retry', done: false, hints: 1 };
    if (misses === 2) {
      // Reduce: keep the correct choice plus a single distractor.
      const others = visible.filter((c) => c.id !== correctId);
      visible = [correctChoice, ...others.slice(0, 1)].filter(Boolean);
      return { kind: 'reduce', done: false, hints: 2 };
    }
    mode = 'modeled';
    return { kind: 'model', done: false, hints: 3, correctChoice };
  }

  function getState() {
    return { mode, modeled: mode === 'modeled', done, misses };
  }

  function visibleChoices() {
    return visible;
  }

  return { tap, getState, visibleChoices, correctChoice };
}

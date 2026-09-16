# The Reading Ladder 🪜📖

A finite, audio-first phonics tutor for ages 3–5. A screen that teaches children to leave the screen.

**Design promise:** every session ends. Every skill transfers. Every week puts a real book closer within reach.

- **Two learner tracks** — *Listening reader* (pre-reader: phonemic awareness, sound discrimination, letter–sound pairings, no blending pressure) and *Early reader* (explicit blending/decoding from day one). Placement is by demonstrated skill (a 4-minute readiness game), never by age.
- **Daily closed-loop lesson** — review misses → one new sound → sound-slider blending → build-the-word → a fully decodable story → a friendly hard stop with an offline mission ("Done — put the tablet away 📴").
- **Decodability contract** — the engine can never show a word containing an untaught sound. Every word list and story is validated in code before display (see below); violations throw instead of reaching the child.
- **Mastery-gated progression** — a sound is mastered only after correct responses across formats plus transfer to an unseen word. Misses resurface in the next session's review. Error language: no buzzers, no red X — repeat the goal, reduce choices, then model and let the child copy.
- **Ethical by construction** — no ads, no in-app purchases, no streaks, no infinite sessions. Rewards are finite and cosmetic (dress up a reading buddy, one accessory per lesson).
- **Audio-first** — all narration via the browser Web Speech API; big forgiving touch targets; replay button always visible.
- **Offline-first** — lessons run fully offline from on-device state; progress syncs to the family database when connected.

## Local development

```bash
npm install
npm test        # decodability contract tests (node:test, no deps)
npm run dev     # vite dev server
npm run build   # production build -> dist/
```

## The decodability contract

`src/lib/decodability.js` is the enforcement point:

- `parseGraphemes(word)` — greedy longest-match parse into curriculum graphemes (digraphs `sh ch th ng ck` included).
- `isDecodable(word, taughtSet, previewWords)` — true only if every grapheme was taught (or the word is an explicitly previewed word, surfaced to parents).
- `assertDecodable(tokens, taughtSet, previewWords, context)` — **throws** on any violation. The lesson planner and the story generator both call this before anything reaches the screen.

`test/decodability.test.mjs` verifies: the full word bank is decodable at each word's introduction stage, and 175 generated stories (7 stages × 25 seeds) contain zero untaught words.

Sound teaching order: `m s a t p i n d o c g e u f r l h b k j v w x y z`, then `sh ch th ng ck`.

## Architecture: local-first with sync

- **On-device truth:** `src/lib/store.js` (localStorage) holds profiles, per-sound mastery, miss queue, companion, session history, and a pending event queue. Lessons never wait on the network.
- **Sync engine:** `src/lib/sync.js` — on launch it merges server state (per-profile last-write-wins on `updatedAt`); `syncNow()` pushes queued progress events plus a full state snapshot. A sync status indicator lives in the Grown-up corner.
- **API:** Cloudflare Pages Functions in `functions/api/` (same origin, no CORS needed):
  - `GET /api/profiles` — list profiles
  - `POST /api/profiles` — create profile
  - `GET /api/profiles/:id` — full profile state
  - `PUT /api/profiles/:id` — upsert full profile state
  - `GET /api/profiles/:id/events?since=` — progress event log
  - `POST /api/profiles/:id/events` — batch-append events `{events:[...], state?}` (events dedupe on client-generated ids)
- **Database:** Cloudflare D1 (`reading-ladder-db`), schema in `migrations/0001_init.sql`: `profiles` + `progress_events` tables.

## Project structure

```
src/
  lib/
    curriculum.js    # sound order, word bank, story templates, missions
    decodability.js  # the contract (pure, unit-tested)
    story.js         # decodable story generator (pure, unit-tested)
    mastery.js       # mastery state machine + miss queue (pure)
    lesson.js        # daily lesson planner
    speech.js        # Web Speech API wrapper
    store.js         # local-first store + event queue
    sync.js          # merge-on-launch + background sync
  components/        # screens: Home, Readiness, Placement, LessonEarly,
                     # LessonPre, SessionEnd, ParentDash, Companion, ui
functions/api/       # Pages Functions (D1 backend)
migrations/          # D1 schema
test/                # contract tests
```

## Deployment

See [DEPLOY.md](DEPLOY.md) — static Pages app + Pages Functions + D1, handled by a separate deploy step.

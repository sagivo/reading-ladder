# Narration audio

Single voice: **Kristy** (Speechify voice id `kristy`, model `simba-3.2`,
locale `en-US`) for every fixed narration string in the app. No voice
picker, no per-profile voice — the child's name is never inserted into
spoken text.

## How it works

- Every fixed string the app can speak is enumerated by
  `scripts/build_audio_catalog.mjs` (1,841 fixed strings: instructions,
  feedback, word bank, first-sound words, story lines, story quizzes,
  seeded stories, end-of-lesson stats).
- Each string is pre-generated once via Speechify and committed as a
  static MP3 at `public/audio/kristy/{sha256("kristy|"+text)[:32]}.mp3`
  — exactly the address `lib/narration.js` computes at runtime.
- `scripts/build_audio_manifest.mjs` writes `src/lib/audioManifest.js`
  (regenerated on every build via `prebuild`); the runtime only fetches
  an MP3 when its hash is in the manifest, so missing clips never cause
  dead air — they skip straight to the fallback.
- Fallback chain per clip: stored MP3 → safety net `POST /api/audio`
  (404 in production; the verdict is cached) → Web Speech.

## Generating

```bash
node scripts/build_audio_catalog.mjs   # coverage report + catalog JSON
python3 scripts/generate_audio_speechify.py --catalog audio_catalog.json
# idempotent — skips clips that already exist; retries transient failures
```

Uses the Speechify skill CLI (`custom.speechify` Secure Vault connector);
never handles a raw API key.

## Deliberately NOT pre-generated

- **Session-end offline mission** (`Time for a real-world mission. …`):
  filled per lesson from template × sound × word — unbounded
  combinations. Falls back to Web Speech at runtime.
- **words_read > 30**: unrealistic; safety net + Web Speech.

## Adding a narration string

1. Add the string to the component (via `narrate()`).
2. Add it to `scripts/build_audio_catalog.mjs` (or the relevant expansion).
3. Run the catalog builder, then `generate_audio_speechify.py` (only new
   clips generate), rebuild, and redeploy.

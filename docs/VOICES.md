# Narration voices & pre-generated audio

The app's narration is **ElevenLabs MP3-first**. Every string a child can hear
is synthesized ONCE per voice, shipped with the app as static assets, and
addressed by content hash. The runtime never calls ElevenLabs TTS during
normal use.

## Voices

| Kid-facing name | ElevenLabs voice ID | Type |
|---|---|---|
| Sarah (default) | `EXAVITQu4vr4xnSDxMaL` | premade, feminine |
| Brian | `nPczCjzI2devNBz1zQrb` | premade, masculine |

Parents pick per kid in the parent dashboard ("Narration voice"). Stored on
the profile (`profiles.voice`, migration `0004`), synced via D1, applied by
`App.jsx` → `setVoice()` in `src/lib/narration.js`.

## Addressing (no manifest lookup at runtime)

```
/audio/{voice}/{sha256(voice + '|' + text).slice(0,32)}.mp3
```

- Same-origin static assets: `scripts/stage_audio.mjs` copies the local clip
  library into `dist/audio/` at build time (`npm run build`), so no R2
  bucket, no CORS, no extra DNS. (An earlier revision pointed at a
  not-yet-created R2 bucket — that placeholder is gone.)
- `voice`: `sarah` | `brian`
- `text`: the EXACT string passed to `narrate()` (UTF-8, same bytes as Python's
  `hashlib.sha256(f"{voice}|{text}".encode())`)

## What's pre-generated

`scripts/build_manifest.mjs` → `scripts/manifest.json`:

- **2,613 unique strings** → **5,226 clips** (×2 voices)
- **~123,880 characters total** (one-time ElevenLabs usage)
- Model `eleven_turbo_v2_5`, format `mp3_44100_128`

Breakdown: 62 fixed UI strings, 30 letter cards, 30 letter-name clips,
390 per-sound templates, ~900 per-word templates, 15 sequence pairs,
6 blend counts, 6 composed parts, 40 "You read N words." sentences,
2 voice previews, **1,143 story sentences** (the seeded pool — see below).

### Story pool cutoff

The story generator is combinatorial: stages 3–29 admit **10,930,217**
theoretical unique sentences — impossible to pre-generate. The app is pinned
to a seeded pool: `generateStory(stage, mulberry32(seed))` with seeds 1–25
per stage (see `src/lib/lesson.js`), matching the test space. The pool
contains **1,143 unique sentences** (~21.8k chars/voice). Rotating the seed
by completed-session count gives variety without live TTS.

### Deliberately NOT pre-generated

- **Child names** (`Hi {name}!`, celebrations): unbounded. First use goes
  through the safety net; generated once per name and cached server-side
  when possible.
- **words_read > 40**: unrealistic; safety net + backfill.
- **Offline missions, error banners, math-gate numbers**: never spoken
  (display-only).

## Generating

Local clip library: `~/workspace/reading-ladder-audio/{sarah,brian}/*.mp3`.

```bash
# Generate (idempotent — skips clips that already exist locally):
python3 scripts/generate_audio.py
#    --dry-run        list what would be generated
#    --limit N        pilot mode
#    --voice sarah    one voice only
#    --out-dir DIR    override the local library dir
```

Uses the ElevenLabs skill CLI (`custom.elevenlabs` Secure Vault connector);
never handles a raw API key. Aborts on the first TTS failure (e.g. quota).

`npm run build` stages whatever exists locally into `dist/audio/` — the app
works with a partial library (missing clips fall to the safety net, then
Web Speech), and each new build picks up newly generated clips.

## Safety net: POST /api/audio

For genuinely unforeseen strings only (child names, backfill). Requires a
parent session; validates `{text, voice}` (300-char cap, voice allowlist);
calls ElevenLabs with the **server-only** `ELEVENLABS_API_KEY` Pages secret
and caches in R2 when the `AUDIO` binding exists (optional). **Every miss is
logged** (`safety_net_audio: true` with the text) — backfill it into
`build_manifest.mjs` and regenerate.

## Fallback chain (per clip)

1. Same-origin MP3 (`/audio/...`) → 2. safety net `/api/audio` →
3. Web Speech (`speech.js`).

## Adding a narration string

1. Add the string to the component (via `narrate()`).
2. Add it to `scripts/build_manifest.mjs` (or the relevant expansion).
3. Re-run `build_manifest.mjs`, then `generate_audio.py` (only new clips
   generate), then rebuild + redeploy.

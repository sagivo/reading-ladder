# Deploying The Reading Ladder to Cloudflare

Target: **Cloudflare Pages** (static app + API) with a **D1** database.
Deployment is performed by a separate deploy step — this file is its runbook.

## 0. Direct Upload + Advanced Mode (read this first)

This project is a **Direct Upload** Pages project (not Git-integrated), so
Pages does **not** compile the `functions/` directory. Instead the API is
shipped as an **Advanced Mode** worker bundle:

- `npm run build` runs Vite (static assets → `dist/`) **and** esbuild
  (`npm run build:worker`), which bundles `worker-src/entry.js` →
  `dist/_worker.js`.
- `worker-src/entry.js` is a small router: `/api/*` requests are served by
  the bundled API code (same handlers as `functions/`); everything else is
  served from static assets via `env.ASSETS.fetch(request)`.
- `dist/` is gitignored — the bundle is a build artifact. Keep
  `worker-src/entry.js` in sync with `functions/` when API code changes
  (both are plain modules; entry.js re-exports the route handlers).
- The deploy step uploads via the Pages Direct Upload API:
  1. Hash each file in `dist/` (except `_worker.js`) with wrangler's
     `hashFile` scheme: `BLAKE3(base64(file bytes) + extension)` as hex,
     truncated to 32 chars. (Plain SHA-256 hashes upload fine but the
     asset server cannot serve them — you get empty 500s from
     `env.ASSETS.fetch`.)
  2. `POST /pages/assets/check-missing` → `POST /pages/assets/upload`
     (body = the **raw JSON array** of file records, not `{"files": [...]}`)
     → `POST /pages/assets/upsert-hashes`, all with the JWT from
     `GET /accounts/{id}/pages/projects/{project}/upload-token`.
  3. `POST /pages/projects/{project}/deployments` (multipart): `manifest`
     = JSON object mapping `/`-prefixed paths → hashes (leading slash
     required, matching wrangler), plus the `_worker.bundle` part
     (multipart field `"_worker.bundle"`, filename `_worker.js`, containing
     a zip whose entries are `_worker.js` and `_worker.bundle` metadata
     JSON with `main_module: "_worker.js"`).
  4. The D1 `DB` binding must already be attached to the project (see §3);
     the bundle reads it via `env.DB`, and `env.ASSETS` is provided
     automatically in Advanced Mode.
- A reference implementation of this flow lives in
  `scripts/deploy_pages.py` (needs `blake3` and the Cloudflare API
  credentials used by the deploy step).

## 1. Build settings (Pages project)

- **Project name:** `reading-ladder`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** repo root (where `package.json` lives)

The `functions/` directory at the repo root is deployed automatically as
Pages Functions — no extra configuration needed.

## 2. D1 database

Create the database (once):

```bash
npx wrangler d1 create reading-ladder-db
```

Apply the schema (in order):

```bash
npx wrangler d1 execute reading-ladder-db --file=migrations/0001_init.sql
npx wrangler d1 execute reading-ladder-db --file=migrations/0002_auth.sql
```

Schema lives in `migrations/`: `0001_init.sql` creates:
- `profiles` — one row per kid profile (track, placement, level, mastery/misses/companion/sessions JSON, `updated_at` merge key; plus `parent_id`, `birth_year`, `archived_at` from 0002)
- `progress_events` — append-only event log (`lesson_started`, `lesson_completed`, `sound_mastered`, `miss_recorded`, `session_ended`, `trial`, `track_set`, `profile_created`, `companion_changed`), deduped on client-generated ids

`0002_auth.sql` adds:
- `parents` — parent accounts (`email` UNIQUE, PBKDF2 password hash)
- `sessions` — opaque session tokens (SHA-256 hash stored, 30-day expiry)
- `rate_limits` — fixed-window counters for signup/login throttling
- `profiles.parent_id` (NULL for pre-auth rows = unclaimed), `profiles.birth_year`, `profiles.archived_at`

## 3. Bind the database to the Pages project

In the Pages project settings (or via wrangler config), add a D1 binding:

- **Binding name:** `DB`
- **Database:** `reading-ladder-db`

The Functions code reads the database exclusively via `env.DB` (see
`functions/api/_lib.js`). If the binding is missing, API routes return a
clear 500 error; the app keeps working fully offline regardless.

## 4. Auth & secrets

- **DB binding unchanged** — auth uses the same `DB` D1 binding; no new
  bindings are needed.
- **No secrets required.** Sessions are opaque random tokens (32 bytes from
  `crypto.getRandomValues`, base64url); only the SHA-256 hex of the token is
  stored in the `sessions` table. Nothing is signed, so there is no signing
  key to provision, store, or rotate.
- Apply the auth migration (after `0001`):
  ```bash
  npx wrangler d1 execute reading-ladder-db --file=migrations/0002_auth.sql
  ```
  Existing profile rows keep `parent_id` NULL (unclaimed) until the parent
  signs in and the app claims them via `POST /api/auth/adopt`.
- Session cookie `rl_session`: `Path=/; HttpOnly; SameSite=Lax;
  Max-Age=2592000` (30 days), `Secure` on https. Sliding expiry: `GET
  /api/auth/me` extends the session when fewer than 15 days remain.

### Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| *(none)* | — | No env vars or secrets are currently required. |

## 5. Verify

- Open the site, create a profile, complete the readiness game.
- In the Grown-up corner (🔒), the sync indicator should read "✅ Synced".
- `npx wrangler d1 execute reading-ladder-db --command="SELECT id, name, track FROM profiles;"` should show the profile.
- Go offline (devtools), finish a lesson, go back online — the pending events should sync and the indicator should clear.

## Notes

- No environment variables or secrets are required — sessions are random
  opaque tokens verified against D1 (no signing key). See "Auth & secrets"
  above and `SECURITY.md` for the threat model and known gaps (password
  reset and email verification are cut until an email sender exists).
- `dist/` is a build artifact and is not committed; Pages builds from source.

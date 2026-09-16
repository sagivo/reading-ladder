# Deploying The Reading Ladder to Cloudflare

Target: **Cloudflare Pages** (static app + Pages Functions) with a **D1** database.
Deployment is performed by a separate deploy step — this file is its runbook.

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

Apply the schema:

```bash
npx wrangler d1 execute reading-ladder-db --file=migrations/0001_init.sql
```

Schema lives in `migrations/0001_init.sql` and creates:
- `profiles` — one row per kid profile (track, placement, level, mastery/misses/companion/sessions JSON, `updated_at` merge key)
- `progress_events` — append-only event log (`lesson_started`, `lesson_completed`, `sound_mastered`, `miss_recorded`, `session_ended`, `trial`, `track_set`, `profile_created`, `companion_changed`), deduped on client-generated ids

## 3. Bind the database to the Pages project

In the Pages project settings (or via wrangler config), add a D1 binding:

- **Binding name:** `DB`
- **Database:** `reading-ladder-db`

The Functions code reads the database exclusively via `env.DB` (see
`functions/api/_lib.js`). If the binding is missing, API routes return a
clear 500 error; the app keeps working fully offline regardless.

## 4. Verify

- Open the site, create a profile, complete the readiness game.
- In the Grown-up corner (🔒), the sync indicator should read "✅ Synced".
- `npx wrangler d1 execute reading-ladder-db --command="SELECT id, name, track FROM profiles;"` should show the profile.
- Go offline (devtools), finish a lesson, go back online — the pending events should sync and the indicator should clear.

## Notes

- No environment variables or secrets are required — there is no auth by
  design (family-device scenario; kid profiles only).
- `dist/` is a build artifact and is not committed; Pages builds from source.

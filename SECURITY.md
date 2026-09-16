# Security — The Reading Ladder

Threat model, auth design, and known gaps for the Cloudflare Pages + D1 backend.

## Threat model

The Reading Ladder is a family app: a parent signs in once on the family device,
and kids (ages 3–5) use it offline-first. The API stores kid learning data
(profiles, progress events) in D1. The realistic threats we defend against:

1. **Credential stuffing / brute-force login** — rate limits on `/api/auth/signup`
   and `/api/auth/login` (per-IP 10 req / 10 min; per-email 5 req / 10 min on
   login), 429 with `Retry-After` when exceeded.
2. **Cross-account data access** — every `/api/profiles*` handler requires a
   session and scopes all reads/writes with `WHERE parent_id = ?`. A row that
   is missing *or* belongs to another parent returns the same 404, so profile
   ids cannot be probed for existence across accounts.
3. **Session theft** — sessions are opaque 256-bit random tokens (base64url) in
   an `HttpOnly; SameSite=Lax` cookie (`rl_session`); `Secure` is set on https.
   Only the SHA-256 hex of the token is stored in D1, so a database read alone
   does not yield usable session cookies.
4. **Password database exposure** — passwords are stored as
   `pbkdf2$100000$<base64 salt>$<base64 hash>` (PBKDF2-SHA256, 100k iterations,
   16-byte random salt). Verification uses a constant-time comparison.
5. **Information leakage via error messages** — signup always fails with the
   generic `"could not create account"` (400 for bad input, 409 for a taken
   email — the two are deliberately indistinguishable); login always fails with
   `"invalid credentials"`. 500s return `"internal error"` and log details
   server-side only.
6. **Abuse / oversized payloads** — auth request bodies are capped at 256 KB;
   adopt is capped at 20 profiles per call; event batching is capped at 200
   events per call (pre-existing).

## What's hashed, what's not

- **Hashed:** parent passwords (PBKDF2-SHA256, see above); session tokens
  (SHA-256 hex stored, raw token only ever in the cookie).
- **Not hashed / plaintext in D1:** parent email (needed for login lookup and
  UNIQUE enforcement), kid profile name/avatar/optional birth year, learning
  progress JSON. D1 encrypts data at rest on Cloudflare's side; the table above
  is the plaintext the application itself can see.

## Session design

- Token: 32 bytes from `crypto.getRandomValues()`, base64url-encoded (43 chars).
- Stored: `sessions(token_hash PK, parent_id, created_at, expires_at)`.
- Lifetime: 30 days (`Max-Age=2592000`), with sliding refresh — `GET
  /api/auth/me` extends `expires_at` when fewer than 15 days remain.
- Login rotates the session: the presented cookie's session row is deleted and
  a fresh token issued (limits damage from a stolen cookie).
- Expired sessions are lazily deleted on every session lookup and on every new
  issue — no cron needed.
- Cookie: `rl_session`; `Path=/; HttpOnly; SameSite=Lax`; `Secure` only when
  the request URL is https (so local `wrangler pages dev` over http still works).

## Rate limits

Implemented as a fixed window in the `rate_limits` D1 table
(`key → count, window_start`):

| Endpoint | Key | Limit |
|---|---|---|
| `POST /api/auth/signup` | per-IP | 10 req / 10 min |
| `POST /api/auth/login` | per-IP | 10 req / 10 min |
| `POST /api/auth/login` | per-email | 5 req / 10 min |

Exceeded limits return `429 { error }` with a `Retry-After` header in seconds.

## Security headers

`functions/_middleware.js` sets on every response:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `X-Frame-Options: SAMEORIGIN`
- `X-Request-Id: <uuid>` (also emitted in server error logs for correlation)

**CSP is deliberately not set.** The Vite build emits inline scripts, so a
strict Content-Security-Policy would break the app. If the build is ever
configured to avoid inline scripts (e.g. hashes/nonces), add a CSP then.

## Error logging

`logError(request, err)` in `functions/api/_lib.js` writes one JSON line to
stderr per failure: `{ ts, reqId, path, error }`. Cloudflare captures
`console.error` output in Functions logs. No request bodies, cookies, or
PII are logged.

## What's NOT implemented (known gaps)

- **Password reset** — CUT. There is no email sender yet, so a parent who
  forgets their password cannot recover the account. Recommended approach when
  a sender exists: single-use, short-lived reset tokens (hashed in D1 like
  sessions, 15-minute expiry), delivered by email, invalidated on use.
- **Magic link / email verification** — CUT (needs an email sender). Signup
  does not verify email ownership today. Future work.
- **CSRF token** — not implemented. Mitigation: `SameSite=Lax` on the session
  cookie means top-level GET navigations aside, cross-site POSTs don't carry
  the cookie; the API is also same-origin only in practice. A `SameSite=Strict`
  or double-submit token could be added later if the app ever needs
  cross-site embedding.
- **2FA** — not implemented; out of scope for a single-device family app.
- **Account deletion / data export** — no endpoint yet. (Parents table has
  `ON DELETE CASCADE` to sessions; profiles would need an explicit delete.)

## D1 backup story

- Manual export any time:
  `npx wrangler d1 export reading-ladder-db --output=backup.sql`
  (or `--remote` variants per wrangler version).
- Recommended: a daily scheduled export (cron on the deploy machine or a
  scheduled worker) with ≥ 30 days retention of the export files.
- Restore: create a fresh database and re-import the export, then re-point the
  `DB` binding.
- Cloudflare also keeps automatic backups of D1 databases on its side (per D1
  docs) — treat those as disaster recovery, not as your retention policy.

## Privacy

Minimal PII by design: parent email, kid display name, avatar emoji, optional
birth year, and learning-progress data. No tracking, no analytics, no ads, no
third-party scripts. The app works fully offline; sync only happens when the
device is online and the parent is signed in.

## COPPA note

This is a family app used by real 3–5-year-olds. Kid data (name, avatar,
learning progress) is stored only as part of a parent-created account, never
sold or shared, and there is no behavioral advertising or cross-site tracking.
Parents can archive a profile (`PUT /api/profiles/:id { archived: true }`),
which removes it from listings. A full account-deletion endpoint and a
data-export endpoint are still to be built (see gaps above) — prioritize those
before any public launch involving children under 13.

## Remaining risks

- No email verification: anyone can register with someone else's address
  (they just can't read that person's mail). Acceptable pre-launch; pair with
  password reset when a sender exists.
- D1 `rate_limits` is advisory: a distributed attacker with many IPs is not
  stopped by per-IP limits (per-email limit still applies on login).
- `X-Frame-Options: SAMEORIGIN` does not stop a malicious same-origin page;
  keep the origin's own content trusted.
- Session tokens live 30 days in a cookie on a shared family device — anyone
  with device access is effectively the parent. This matches the product's
  family-device model.

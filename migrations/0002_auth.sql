-- The Reading Ladder — parent accounts, sessions, rate limits (database: reading-ladder-db)
-- Applied after 0001: wrangler d1 execute reading-ladder-db --file=migrations/0002_auth.sql

CREATE TABLE IF NOT EXISTS parents (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- pbkdf2$100000$<b64 salt>$<b64 hash>
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,              -- SHA-256 hex of the opaque session token
  parent_id  TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL                  -- 30 days from issue, sliding refresh
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,            -- e.g. "login:ip:1.2.3.4"
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL                -- ISO start of the fixed window
);

ALTER TABLE profiles ADD COLUMN parent_id TEXT;
ALTER TABLE profiles ADD COLUMN birth_year INTEGER;
ALTER TABLE profiles ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles(parent_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id, expires_at);

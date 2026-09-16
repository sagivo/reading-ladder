-- The Reading Ladder — D1 schema (database: reading-ladder-db)
-- Applied by the deploy step: wrangler d1 execute reading-ladder-db --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '🦊',
  track         TEXT,                       -- 'pre' | 'early' | NULL (not placed yet)
  placement_json TEXT,                      -- readiness check result
  level         INTEGER NOT NULL DEFAULT 0, -- index into the sound order: current target
  mastery_json  TEXT NOT NULL DEFAULT '{}', -- per-grapheme { status, attempts[] }
  misses_json   TEXT NOT NULL DEFAULT '[]', -- misses queued for review
  companion_json TEXT NOT NULL DEFAULT '{}',
  sessions_json TEXT NOT NULL DEFAULT '[]',
  exposure      INTEGER NOT NULL DEFAULT 0, -- pre-reader: sounds introduced so far
  last_mission  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL               -- last-write-wins merge key
);

CREATE TABLE IF NOT EXISTS progress_events (
  id           TEXT PRIMARY KEY,            -- client-generated uuid: dedupe key
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,               -- lesson_started, lesson_completed, sound_mastered,
                                            -- miss_recorded, session_ended, trial, track_set,
                                            -- profile_created, companion_changed
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_profile ON progress_events (profile_id, created_at);

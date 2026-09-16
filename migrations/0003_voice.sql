-- Add per-kid narration voice preference (persisted across logins/devices).
ALTER TABLE profiles ADD COLUMN voice TEXT NOT NULL DEFAULT 'sarah';

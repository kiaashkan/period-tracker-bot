-- Legacy single-user table (kept for automatic migration of old data, safe to leave as-is)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per person who has set up their own tracking (an "owner")
CREATE TABLE IF NOT EXISTS profiles (
  chat_id TEXT PRIMARY KEY,
  last_start TEXT,
  cycle_length INTEGER NOT NULL DEFAULT 28,
  period_length INTEGER NOT NULL DEFAULT 5,
  invite_code TEXT UNIQUE,
  owner_name TEXT
);

-- Maps a viewer (e.g. a partner) to the owner's profile they follow
CREATE TABLE IF NOT EXISTS links (
  viewer_chat_id TEXT PRIMARY KEY,
  owner_chat_id TEXT NOT NULL
);

-- Every start date ever recorded, used to show real cycle lengths over time
CREATE TABLE IF NOT EXISTS cycle_history (
  chat_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  PRIMARY KEY (chat_id, start_date)
);

-- Per-chat language preference, independent of owner/viewer role
CREATE TABLE IF NOT EXISTS chat_settings (
  chat_id TEXT PRIMARY KEY,
  lang TEXT
);

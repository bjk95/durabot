-- Bot registry (D32). The bot object keeps its own copy of the settings; this table feeds lists and loaders.
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🤖',
  kind TEXT NOT NULL DEFAULT 'bot',
  persona TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  toolkits TEXT NOT NULL DEFAULT '[]',
  schedules TEXT NOT NULL DEFAULT '[]',
  triggers TEXT NOT NULL DEFAULT '[]',
  unread INTEGER NOT NULL DEFAULT 0,
  last_text TEXT NOT NULL DEFAULT '',
  last_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Run list (D14).
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  source TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL,
  tools TEXT NOT NULL DEFAULT '[]',
  cost REAL NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS runs_bot ON runs (bot_id, started_at DESC);

-- Owner settings and the shared "about me" memory (D10).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Web push subscriptions (D23).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Composio trigger instances mapped to bots (D4).
CREATE TABLE IF NOT EXISTS triggers (
  trigger_id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

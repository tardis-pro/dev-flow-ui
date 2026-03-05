CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE NOT NULL,
  github_login TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_repos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  bootstrapped INTEGER DEFAULT 0,
  default_ai_provider TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, owner, repo)
);

CREATE TABLE IF NOT EXISTS onboarding_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  step TEXT NOT NULL DEFAULT 'github_connected',
  completed INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

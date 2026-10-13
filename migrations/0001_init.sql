CREATE TABLE IF NOT EXISTS users (
  chat_id    INTEGER PRIMARY KEY,
  tz         TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  next_at    INTEGER NOT NULL,          -- UTC, миллисекунды
  repeat     TEXT,                      -- JSON правила повтора или NULL
  tz         TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_due  ON reminders (active, next_at);
CREATE INDEX IF NOT EXISTS idx_reminders_chat ON reminders (chat_id, active);

-- PapaGaio — D1 schema. Shared database for the bot and the site.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,          -- telegram user id
  chat_id       INTEGER NOT NULL,
  name          TEXT,
  courses       TEXT    NOT NULL DEFAULT 'pt',-- 'pt' | 'en' | 'pt,en'
  tz            TEXT    NOT NULL DEFAULT 'Europe/Lisbon',
  hour_start    INTEGER NOT NULL DEFAULT 9,   -- working window start
  hour_end      INTEGER NOT NULL DEFAULT 18,  -- working window end
  interval_min  INTEGER NOT NULL DEFAULT 15,
  new_per_day   INTEGER NOT NULL DEFAULT 12,  -- new cards per day per course
  active        INTEGER NOT NULL DEFAULT 1,
  paused_until  TEXT,                         -- ISO; snooze and auto-quiet
  miss_streak   INTEGER NOT NULL DEFAULT 0,   -- 3 ignores in a row → quiet until tomorrow
  last_push_at  TEXT,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id       TEXT PRIMARY KEY,   -- pt0001 / en0001, or u<id> for user-added
  course   TEXT NOT NULL,      -- pt | en
  term     TEXT NOT NULL,      -- word in the target language
  trans    TEXT NOT NULL,      -- translation / definition
  pos      TEXT,
  gender   TEXT,
  note     TEXT,
  ex_t     TEXT,               -- example in the target language
  ex_trans TEXT,
  tags     TEXT,               -- JSON array
  freq     INTEGER,            -- frequency rank = order of introduction
  audio    TEXT,               -- file name under /papagaio/audio/, no base URL
  audio_ex TEXT,               -- the example sentence spoken, same folder
  owner    INTEGER,            -- NULL = shared deck; user id = added from a translation
  entry    TEXT                -- rich dictionary entry (JSON): meanings, synonyms,
                               -- collocations, grammar, conj, lit (public-domain quotes)
);

CREATE INDEX IF NOT EXISTS idx_cards_course_freq ON cards(course, freq);

-- Device tokens for the mobile app and the website.
CREATE TABLE IF NOT EXISTS devices (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL
);

-- Abuse guard for the public translate endpoint.
CREATE TABLE IF NOT EXISTS api_usage (
  day TEXT NOT NULL,
  ip  TEXT NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip)
);

-- Last translation per user, so the "add to deck" button has something to add.
CREATE TABLE IF NOT EXISTS tr_last (
  user_id    INTEGER PRIMARY KEY,
  course     TEXT NOT NULL,
  term       TEXT NOT NULL,
  trans      TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

-- FSRS state per card per user.
CREATE TABLE IF NOT EXISTS user_cards (
  user_id     INTEGER NOT NULL,
  card_id     TEXT    NOT NULL,
  stability   REAL    NOT NULL DEFAULT 0,
  difficulty  REAL    NOT NULL DEFAULT 0,
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  state       INTEGER NOT NULL DEFAULT 0,   -- 0 new, 1 learning, 2 review, 3 relearning
  due         TEXT,
  last_review TEXT,
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_uc_due ON user_cards(user_id, due);

-- Raw event log. Statistics and the CIPLE forecast grow from here.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  card_id    TEXT,
  kind       TEXT NOT NULL,   -- push | intro | answer | miss | snooze | voice
  exercise   TEXT,            -- t_ru | ru_t | audio | type | voice
  rating     INTEGER,         -- FSRS grade 1..4
  correct    INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at);

-- Active AI dialog. One session per user.
CREATE TABLE IF NOT EXISTS dialog (
  user_id    INTEGER PRIMARY KEY,
  course     TEXT NOT NULL,
  scenario   TEXT NOT NULL,
  level      TEXT DEFAULT 'normal',  -- slow | normal | street
  messages   TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL
);

-- The card awaiting an answer. One per user: a new push replaces it.
CREATE TABLE IF NOT EXISTS pending (
  user_id     INTEGER PRIMARY KEY,
  card_id     TEXT,
  exercise    TEXT,
  correct_idx INTEGER,
  message_id  INTEGER,
  sent_at     TEXT
);

-- Course progress: one row per lesson a learner has opened.
CREATE TABLE IF NOT EXISTS course_progress (
  user_id      INTEGER NOT NULL,
  lesson_id    TEXT    NOT NULL,
  completed_at TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, lesson_id)
);

-- Every correction the coach or the translator hands out, remembered.
-- The recurring ones ARE the syllabus: at three sightings a mistake becomes
-- a card of its own (tagged 'mistake'), scheduled like any other.
CREATE TABLE IF NOT EXISTS mistakes (
  user_id  INTEGER NOT NULL,
  course   TEXT    NOT NULL DEFAULT 'pt',
  wrong    TEXT    NOT NULL,
  right    TEXT    NOT NULL,
  why      TEXT,
  source   TEXT,               -- coach | translate
  n        INTEGER NOT NULL DEFAULT 1,
  promoted INTEGER NOT NULL DEFAULT 0,
  last_at  TEXT,
  PRIMARY KEY (user_id, wrong, right)
);

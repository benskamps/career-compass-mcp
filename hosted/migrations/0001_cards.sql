-- One row per signed-in user. user_id is an HMAC of the Google account id,
-- so the table never holds the raw id. card and previous are AES-GCM
-- ciphertext (base64), never plain text.
CREATE TABLE IF NOT EXISTS cards (
  user_id      TEXT PRIMARY KEY,
  card         TEXT,
  previous     TEXT,
  updated_at   INTEGER,
  last_seen_at INTEGER NOT NULL,
  saves_day    TEXT,
  saves_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cards_last_seen ON cards (last_seen_at);

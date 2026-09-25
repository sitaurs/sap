-- 0003_scans_and_activity
-- DATABASE.md section 3. Scans, append-only point ledger, per-day activity caps,
-- achievement definitions/unlocks, and the scan point-dedup keys.

CREATE TABLE scans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id),
  media_id         uuid NOT NULL REFERENCES media (id),
  status           text NOT NULL CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
  outcome          text CHECK (outcome IN ('classified', 'unknown', 'no_waste')),
  category_id      text REFERENCES categories (id),
  predictions      jsonb,
  error_code       text CHECK (error_code IN ('ML_UNAVAILABLE', 'ML_TIMEOUT', 'ML_INVALID_RESPONSE', 'MEDIA_INVALID')),
  provider_revision text,
  points_awarded   integer NOT NULL DEFAULT 0,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_created_idx ON scans (user_id, created_at, id);
CREATE INDEX scans_status_created_idx ON scans (status, created_at);

-- Append-only. Reversals are compensating rows, never in-place edits.
CREATE TABLE point_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id),
  event_key    text NOT NULL,
  source_type  text NOT NULL,
  source_id    uuid,
  delta        integer NOT NULL,
  reason       text,
  activity_day date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX point_ledger_event_key_key ON point_ledger (event_key);
CREATE INDEX point_ledger_user_day_idx ON point_ledger (user_id, activity_day);

-- activity_day is the Asia/Jakarta calendar day; row lock enforces award caps.
CREATE TABLE user_daily_activity (
  user_id            uuid NOT NULL REFERENCES users (id),
  activity_day       date NOT NULL,
  scan_award_count   integer NOT NULL DEFAULT 0,
  report_award_count integer NOT NULL DEFAULT 0,
  net_points         integer NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_day)
);

CREATE TABLE achievement_definitions (
  id               text PRIMARY KEY CHECK (id IN ('first_scan', 'scanner_10', 'first_verified_report', 'streak_3')),
  name             text NOT NULL,
  description      text NOT NULL,
  criteria_version integer NOT NULL DEFAULT 1
);

CREATE TABLE user_achievements (
  user_id        uuid NOT NULL REFERENCES users (id),
  achievement_id text NOT NULL REFERENCES achievement_definitions (id),
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  PRIMARY KEY (user_id, achievement_id)
);

-- One point-eligible scan per (user, image sha256, activity_day).
CREATE TABLE scan_dedup_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id),
  sha256          text NOT NULL,
  activity_day    date NOT NULL,
  awarded_scan_id uuid NOT NULL REFERENCES scans (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha256, activity_day)
);

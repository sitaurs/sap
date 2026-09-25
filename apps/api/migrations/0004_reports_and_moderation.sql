-- 0004_reports_and_moderation
-- DATABASE.md sections 4 & 6. Reports carry the geography point + server-computed
-- h3_cell and an optimistic-concurrency `revision`. Status/severity CHECKs mirror
-- the OpenAPI contract. Transition rules and "occurred_at not in the future" are
-- enforced in the moderation service/transaction (a CHECK cannot call now()).

CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid REFERENCES users (id),
  scan_id           uuid REFERENCES scans (id),
  category_id       text REFERENCES categories (id),
  description       text,
  reported_severity text CHECK (reported_severity IN ('small', 'medium', 'large')),
  occurred_at       timestamptz,
  location          geography(Point, 4326) NOT NULL,
  h3_cell           text NOT NULL,
  status            text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted', 'verified', 'in_progress', 'resolved', 'rejected', 'duplicate')),
  duplicate_of_id   uuid REFERENCES reports (id),
  public_summary    text,
  verified_at       timestamptz,
  resolved_at       timestamptz,
  revision          integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_no_self_duplicate CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id)
);
CREATE INDEX reports_location_gist ON reports USING GIST (location);
CREATE INDEX reports_h3_occurred_idx ON reports (h3_cell, occurred_at);
CREATE INDEX reports_status_occurred_idx ON reports (status, occurred_at);
CREATE INDEX reports_reporter_created_idx ON reports (reporter_id, created_at);
CREATE INDEX reports_duplicate_of_idx ON reports (duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE TABLE report_media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media (id),
  sort_order integer NOT NULL DEFAULT 0,
  kind       text NOT NULL CHECK (kind IN ('evidence', 'resolution')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, media_id)
);
CREATE INDEX report_media_report_idx ON report_media (report_id);

-- Append-only timeline; projected to public/owner/admin views per permission.
CREATE TABLE report_status_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  actor_id           uuid REFERENCES users (id),
  from_status        text,
  to_status          text NOT NULL,
  reason             text,
  evidence_media_ids uuid[] NOT NULL DEFAULT '{}',
  occurred_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_status_events_report_idx ON report_status_events (report_id, occurred_at);

CREATE TABLE moderation_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES users (id),
  request_key     text NOT NULL,
  revision_before integer NOT NULL,
  decision_payload jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Idempotent moderation: request_key is unique per acting admin.
  UNIQUE (actor_id, request_key)
);

-- Append-only. Never stores secrets, photos, or base64 payloads.
CREATE TABLE audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         uuid REFERENCES users (id),
  action           text NOT NULL,
  target_type      text NOT NULL,
  target_id        text,
  changes_redacted jsonb,
  request_id       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_id, created_at);

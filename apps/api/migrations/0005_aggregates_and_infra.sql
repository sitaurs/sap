-- 0005_aggregates_and_infra
-- DATABASE.md section 5. Rebuildable area snapshots, transactional outbox,
-- idempotency store, and account-deletion bookkeeping.

-- Cacheable hotspot aggregates; can always be rebuilt from reports.
CREATE TABLE area_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key      text NOT NULL,
  method_version text NOT NULL,
  from_at        timestamptz NOT NULL,
  to_at          timestamptz NOT NULL,
  category_id    text REFERENCES categories (id),
  as_of          timestamptz NOT NULL,
  payload        jsonb NOT NULL,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cache_key)
);
CREATE INDEX area_snapshots_expires_idx ON area_snapshots (expires_at);

-- Written in the same transaction as the mutation that should trigger a worker.
CREATE TABLE outbox_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           text NOT NULL,
  aggregate_id    uuid,
  payload_minimal jsonb NOT NULL,
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'processing', 'delivered', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dedup_key       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedup_key)
);
CREATE INDEX outbox_events_state_idx ON outbox_events (state, next_attempt_at);

-- Replay store for createScan/createReport/decideReport/deleteMe. TTL 24h (app-set).
CREATE TABLE idempotency_keys (
  actor_scope   text NOT NULL,
  route         text NOT NULL,
  key           text NOT NULL,
  request_hash  text NOT NULL,
  status_code   integer,
  response_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (actor_scope, route, key)
);
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE deletion_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES users (id),
  subject_hash       text NOT NULL,
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  receipt_hash       text,
  receipt_expires_at timestamptz,
  last_error_code    text,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);
-- At most one in-flight deletion per user.
CREATE UNIQUE INDEX deletion_requests_active_user_idx
  ON deletion_requests (user_id) WHERE status IN ('queued', 'running');

-- Replayed before a restored backup is reopened to users.
CREATE TABLE deletion_tombstones (
  subject_hash text PRIMARY KEY,
  completed_at timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL
);

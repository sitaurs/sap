-- Recover scan delivery/processing independently of Redis. The scan row,
-- idempotency response and outbox event are committed by one API transaction.
ALTER TABLE scans
  ADD COLUMN processing_generation integer NOT NULL DEFAULT 0
    CHECK (processing_generation >= 0),
  ADD COLUMN processing_lease_expires_at timestamptz;

CREATE TABLE scan_outbox (
  scan_id uuid PRIMARY KEY REFERENCES scans (id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'dispatching', 'enqueued', 'processed')),
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX scan_outbox_pending_idx
  ON scan_outbox (available_at, created_at, scan_id)
  WHERE state IN ('pending', 'dispatching', 'enqueued');

-- Preserve accepted scans from before this migration. Give legacy processing
-- workers one documented provider-flow grace window to finish before reclaim.
UPDATE scans
SET processing_lease_expires_at = clock_timestamp() + interval '4 minutes'
WHERE status = 'processing' AND processing_lease_expires_at IS NULL;

INSERT INTO scan_outbox (scan_id, available_at)
SELECT id, COALESCE(processing_lease_expires_at, clock_timestamp())
FROM scans WHERE status IN ('queued', 'processing')
ON CONFLICT (scan_id) DO NOTHING;

import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMigrations } from '../../src/infrastructure/migrator.js';

/**
 * DB-free guard rails for the migration set. These run offline in `npm run check`
 * — they never open a connection. Applying the SQL against a real Postgres is a
 * separate, opt-in integration step.
 */

// Every table declared across the migration files. If a table is added or
// removed, this list must change in lockstep — that is intentional.
const EXPECTED_TABLES = [
  // 0002 accounts + media
  'users',
  'sessions',
  'auth_challenges',
  'media',
  'categories',
  // 0003 scans + activity
  'scans',
  // 0018 durable scan delivery
  'scan_outbox',
  'point_ledger',
  'user_daily_activity',
  'achievement_definitions',
  'user_achievements',
  'scan_dedup_keys',
  // 0004 reports + moderation
  'reports',
  'report_media',
  'report_status_events',
  'moderation_decisions',
  'audit_events',
  // 0005 aggregates + infra
  'area_snapshots',
  'outbox_events',
  'idempotency_keys',
  'deletion_requests',
  'deletion_tombstones',
  // 0007 hybrid scan detection settings
  'scan_settings',
  // 0009 SAPA hybrid-retrieval corpus
  'sapa_corpus',
  // 0010 optional TOTP MFA
  'mfa_factors',
  'mfa_recovery_codes',
  'mfa_preauth_challenges',
  'mfa_login_limits',
  // 0011 public projection + evidence
  'media_consents',
  'evidence_links',
  'evidence_renditions',
  'media_publication_approvals',
  'approved_resolution_evidence',
  'public_incident_events',
  // 0012 community + assisted review
  'incident_supports',
  'incident_follows',
  'community_updates',
  'review_runs',
  'review_daily_budgets',
  // 0013 activities + impact
  'activities',
  'activity_memberships',
  'physical_batches',
  'impact_measurements',
  'measurement_media',
  'activity_results',
  'notifications',
  // 0014 Instagram lifecycle
  'instagram_accounts',
  'instagram_settings',
  'instagram_publication_series',
  'instagram_posts',
  'instagram_operations',
  'instagram_publication_attempts',
  'instagram_oauth_states',
  'instagram_manual_confirmations',
  'instagram_rendition_objects',
  // 0015 map snapshots + cleanup
  'publication_map_snapshots',
  'publication_map_budgets',
  'media_cleanup_tasks',
  // 0021 report operations and opt-in status email delivery
  'report_assignments',
  'area_localities',
  'report_notification_emails',
].sort();

test('there are at least five migration files', async () => {
  const files = await loadMigrations();
  assert.ok(files.length >= 5, `expected >= 5 migrations, found ${files.length}`);
});

test('migrations are ordered lexicographically with unique versions', async () => {
  const files = await loadMigrations();
  const versions = files.map((f) => f.version);

  const sorted = [...versions].sort();
  assert.deepEqual(versions, sorted, 'migrations must be returned in lexicographic order');

  assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');
});

test('the first migration enables PostGIS', async () => {
  const files = await loadMigrations();
  const first = files[0];
  assert.ok(first, 'expected at least one migration');
  assert.match(first.sql, /CREATE EXTENSION IF NOT EXISTS postgis/i);
});

test('checksums are the sha256 of the file contents', async () => {
  const files = await loadMigrations();
  for (const file of files) {
    const expected = createHash('sha256').update(file.sql).digest('hex');
    assert.equal(file.checksum, expected, `checksum mismatch for ${file.filename}`);
  }
});

test('every expected table is created exactly once', async () => {
  const files = await loadMigrations();
  const combined = files.map((f) => f.sql).join('\n');

  const counts = new Map<string, number>();
  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_]+)/gi;
  for (const match of combined.matchAll(re)) {
    const name = match[1]!.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const created = [...counts.keys()].sort();
  assert.deepEqual(created, EXPECTED_TABLES, 'set of created tables must match the expected list');

  for (const [name, count] of counts) {
    assert.equal(count, 1, `table ${name} must be created exactly once (found ${count})`);
  }
});

test('activity public cancellation reason migration is nullable and never copies private hold reasons', async () => {
  const files = await loadMigrations();
  const migration = files.find(file => file.filename === '0017_activity_public_cancel_reason.sql');
  assert.ok(migration, 'expected the cancellation-reason migration');
  assert.match(migration.sql, /ADD COLUMN public_cancel_reason text\b/i);
  assert.match(migration.sql, /public_cancel_reason IS NULL OR \(\s*status\s*=\s*'cancelled'/i);
  assert.match(migration.sql, /char_length\(btrim\(public_cancel_reason\)\) BETWEEN 5 AND 1000/i);
  assert.doesNotMatch(migration.sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i,
    'the additive migration must not rewrite historical activity data or remove schema');
  assert.doesNotMatch(migration.sql, /hold_reason/i,
    'private historic hold/review reasons must never be backfilled into public cancellation reasons');
});

test('scan outbox migration is additive, backfills unfinished scans, and adds lease fencing', async () => {
  const files = await loadMigrations();
  const migration = files.find(file => file.filename === '0018_scan_durable_outbox.sql');
  assert.ok(migration, 'expected the durable scan outbox migration');
  assert.match(migration.sql, /ALTER TABLE scans[\s\S]*ADD COLUMN processing_generation integer NOT NULL DEFAULT 0/i);
  assert.match(migration.sql, /ADD COLUMN processing_lease_expires_at timestamptz/i);
  assert.match(migration.sql, /CREATE TABLE scan_outbox[\s\S]*PRIMARY KEY[\s\S]*REFERENCES scans\s*\(id\) ON DELETE CASCADE/i);
  assert.match(migration.sql, /CHECK \(state IN \('pending', 'dispatching', 'enqueued', 'processed'\)\)/i);
  assert.match(migration.sql, /UPDATE scans[\s\S]*SET processing_lease_expires_at = clock_timestamp\(\) \+ interval '4 minutes'[\s\S]*WHERE status = 'processing'/i);
  assert.match(migration.sql, /INSERT INTO scan_outbox \(scan_id, available_at\)[\s\S]*SELECT id, COALESCE\(processing_lease_expires_at, clock_timestamp\(\)\)[\s\S]*FROM scans WHERE status IN \('queued', 'processing'\)/i);
  assert.doesNotMatch(migration.sql, /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\s+scans\b|\bUPDATE\s+scans\s+SET\s+(?:status|outcome|points_awarded)\b/i,
    'the migration must not rewrite scan outcomes or remove existing domain data');
});

test('community update decisions have a dedicated notification type', async () => {
  const files = await loadMigrations();
  const migration = files.find(file => file.filename === '0019_community_update_notifications.sql');
  assert.ok(migration, 'expected the community decision notification migration');
  assert.match(migration.sql, /DROP CONSTRAINT notifications_type_check/i);
  assert.match(migration.sql, /ADD CONSTRAINT notifications_type_check CHECK[\s\S]*'community_update_decided'/i);
  assert.doesNotMatch(migration.sql, /\b(?:DELETE|TRUNCATE)\b/i,
    'the notification enum migration must preserve existing notifications');
});

test('membership requests have a dedicated notification type without removing existing types', async () => {
  const files = await loadMigrations();
  const migration = files.find(file => file.filename === '0020_membership_request_notifications.sql');
  assert.ok(migration, 'expected the membership request notification migration');
  assert.match(migration.sql, /ADD CONSTRAINT notifications_type_check CHECK[\s\S]*'membership_requested'/i);
  assert.match(migration.sql, /'community_update_decided'/i);
  assert.doesNotMatch(migration.sql, /\b(?:DELETE|TRUNCATE)\b/i,
    'the additive notification migration must preserve existing notifications');
});

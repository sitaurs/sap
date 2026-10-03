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

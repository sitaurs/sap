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
  assert.deepEqual(created, EXPECTED_TABLES, 'set of created tables must match the expected 21');

  for (const [name, count] of counts) {
    assert.equal(count, 1, `table ${name} must be created exactly once (found ${count})`);
  }
});

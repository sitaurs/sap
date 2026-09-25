#!/usr/bin/env node
// R-03 restore-drill verifier (TEST_PLAN T-21, DEPLOYMENT.md §6).
// After a backup restore + deletion-tombstone replay, asserts that data which was
// marked for deletion did NOT reappear: every completed deletion must leave its
// user pseudonymised, its reports de-linked, and its media purged. Also surfaces
// tombstones whose deletion_requests are not 'completed' (replay still pending).
//
// Exit 0 = clean; exit 1 = violations found (fail the drill); exit 2 = usage error.
//
// Usage: DATABASE_URL=postgres://... node bench/verify-restore.mjs

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required (staging/restored DB).');
  process.exit(2);
}

const sql = postgres(DATABASE_URL, { max: 2 });

async function main() {
  const violations = [];

  // 1. Completed deletions whose user row is NOT pseudonymised (data came back).
  const revived = await sql`
    SELECT dr.id AS deletion_id, u.id AS user_id
    FROM deletion_requests dr
    JOIN users u ON u.id = dr.user_id
    WHERE dr.status = 'completed'
      AND (
        u.deleted_at IS NULL
        OR u.password_hash IS NOT NULL
        OR u.email_normalized NOT LIKE 'deleted+%@deleted.invalid'
      )`;
  if (revived.length > 0) {
    violations.push({ check: 'user_pseudonymised', count: revived.length, sample: revived.slice(0, 5) });
  }

  // 2. Reports still linked to a deleted account (reporter_id should be NULL).
  const linkedReports = await sql`
    SELECT count(*)::int AS count
    FROM reports r
    JOIN deletion_requests dr ON dr.user_id = r.reporter_id
    WHERE dr.status = 'completed'`;
  if ((linkedReports[0]?.count ?? 0) > 0) {
    violations.push({ check: 'reports_delinked', count: linkedReports[0].count });
  }

  // 3. Media for deleted accounts still marked live (should be state='deleted').
  const liveMedia = await sql`
    SELECT count(*)::int AS count
    FROM media m
    JOIN deletion_requests dr ON dr.user_id = m.owner_id
    WHERE dr.status = 'completed' AND m.state <> 'deleted'`;
  if ((liveMedia[0]?.count ?? 0) > 0) {
    violations.push({ check: 'media_purged', count: liveMedia[0].count });
  }

  // 4. Tombstones without a completed deletion (replay pending after restore).
  const pendingReplay = await sql`
    SELECT count(*)::int AS count
    FROM deletion_tombstones t
    WHERE NOT EXISTS (
      SELECT 1 FROM deletion_requests dr WHERE dr.subject_hash = t.subject_hash AND dr.status = 'completed'
    )`;
  if ((pendingReplay[0]?.count ?? 0) > 0) {
    violations.push({ check: 'tombstone_replay_pending', count: pendingReplay[0].count });
  }

  const tombstones = await sql`SELECT count(*)::int AS count FROM deletion_tombstones`;
  console.log(JSON.stringify({
    tombstones: tombstones[0]?.count ?? 0,
    violations,
    verdict: violations.length === 0 ? 'CLEAN' : 'VIOLATIONS_FOUND',
  }, null, 1));
  process.exit(violations.length === 0 ? 0 : 1);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}

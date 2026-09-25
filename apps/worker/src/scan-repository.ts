import type { Sql } from 'postgres';
import type { AdapterResult } from './ml-adapter.js';

export interface ScanContext {
  scanId: string;
  userId: string;
  status: string;
  objectKey: string;
  sha256: string;
  mediaState: string;
}

/** Asia/Jakarta (UTC+7, no DST) calendar day as YYYY-MM-DD. */
export function jakartaDay(now: number = Date.now()): string {
  return new Date(now + 7 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

const SCAN_AWARD_DELTA = 10;
const MAX_SCAN_AWARDS_PER_DAY = 5;

export class ScanRepository {
  constructor(private readonly sql: Sql) {}

  async loadContext(scanId: string): Promise<ScanContext | null> {
    const rows = await this.sql<
      Array<{ scan_id: string; user_id: string; status: string; object_key: string; sha256: string; media_state: string }>
    >`
      SELECT s.id AS scan_id, s.user_id, s.status, m.object_key, m.sha256, m.state AS media_state
      FROM scans s JOIN media m ON m.id = s.media_id
      WHERE s.id = ${scanId}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      scanId: row.scan_id,
      userId: row.user_id,
      status: row.status,
      objectKey: row.object_key,
      sha256: row.sha256,
      mediaState: row.media_state,
    };
  }

  /** Transition queued -> processing. Returns false when the scan is no longer queued. */
  async markProcessing(scanId: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE scans SET status = 'processing', started_at = now(), updated_at = now()
      WHERE id = ${scanId} AND status = 'queued'
      RETURNING id`;
    return rows.length > 0;
  }

  /**
   * Persist a successful classification and award scan points atomically.
   * Points: +10 per classified scan, max 5/day, deduped by (user, sha256, day).
   * A late result (scan already terminal) is a no-op.
   */
  async completeSucceeded(scanId: string, userId: string, sha256: string, result: AdapterResult): Promise<number> {
    return this.sql.begin(async (tx) => {
      const current = await tx<{ status: string }[]>`
        SELECT status FROM scans WHERE id = ${scanId} FOR UPDATE`;
      const status = current[0]?.status;
      if (!status || status === 'succeeded' || status === 'failed') return 0;

      let pointsAwarded = 0;
      if (result.outcome === 'classified') {
        const day = jakartaDay();
        const dedup = await tx<{ id: string }[]>`
          INSERT INTO scan_dedup_keys (user_id, sha256, activity_day, awarded_scan_id)
          VALUES (${userId}, ${sha256}, ${day}, ${scanId})
          ON CONFLICT (user_id, sha256, activity_day) DO NOTHING
          RETURNING id`;
        if (dedup.length > 0) {
          await tx`
            INSERT INTO user_daily_activity (user_id, activity_day)
            VALUES (${userId}, ${day})
            ON CONFLICT (user_id, activity_day) DO NOTHING`;
          const activity = await tx<{ scan_award_count: number }[]>`
            SELECT scan_award_count FROM user_daily_activity
            WHERE user_id = ${userId} AND activity_day = ${day} FOR UPDATE`;
          if ((activity[0]?.scan_award_count ?? 0) < MAX_SCAN_AWARDS_PER_DAY) {
            await tx`
              INSERT INTO point_ledger (user_id, event_key, source_type, source_id, delta, reason, activity_day)
              VALUES (${userId}, ${`scan:${scanId}`}, 'scan', ${scanId}, ${SCAN_AWARD_DELTA}, 'scan_classified', ${day})
              ON CONFLICT (event_key) DO NOTHING`;
            await tx`
              UPDATE user_daily_activity
              SET scan_award_count = scan_award_count + 1, net_points = net_points + ${SCAN_AWARD_DELTA}, updated_at = now()
              WHERE user_id = ${userId} AND activity_day = ${day}`;
            pointsAwarded = SCAN_AWARD_DELTA;
          }
        }
      }

      await tx`
        UPDATE scans
        SET status = 'succeeded', outcome = ${result.outcome}, category_id = ${result.categoryId},
            predictions = ${tx.json(result.predictions as never)}, points_awarded = ${pointsAwarded},
            provider_revision = ${result.providerRevision}, finished_at = now(), updated_at = now()
        WHERE id = ${scanId}`;
      return pointsAwarded;
    });
  }

  /** Mark the scan failed with a domain error code (no points). Late result -> no-op. */
  async completeFailed(scanId: string, errorCode: string): Promise<void> {
    await this.sql`
      UPDATE scans
      SET status = 'failed', error_code = ${errorCode}, finished_at = now(), updated_at = now()
      WHERE id = ${scanId} AND status NOT IN ('succeeded', 'failed')`;
  }
}

import type { Sql } from 'postgres';
import type { AdapterResult } from './ml-adapter.js';

/** Lease covers the documented 90s provider flow plus its one transient retry. */
export const SCAN_PROCESSING_LEASE_MS = 4 * 60 * 1_000;
export const SCAN_OUTBOX_DISPATCH_LEASE_MS = 30 * 1_000;
export const SCAN_OUTBOX_LIVE_JOB_POLL_MS = 60 * 1_000;
export const SCAN_OUTBOX_POLL_MS = 1_000;
export const SCAN_OUTBOX_BATCH_SIZE = 20;

export interface ScanContext {
  scanId: string;
  userId: string;
  status: string;
  objectKey: string;
  sha256: string;
  mediaState: string;
}

export interface ScanDelivery {
  scanId: string;
  generation: number;
  scanStatus: 'queued' | 'processing';
}

export interface ScanCompletion {
  accepted: boolean;
  pointsAwarded: number;
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

  /**
   * Reserve due outbox entries. The state/generation update is committed before
   * touching Redis, so an enqueue crash is reclaimed after the short dispatch
   * lease. Each delivery gets a distinct BullMQ id; failed Bull jobs therefore
   * cannot permanently block a repaired delivery under an old id.
   */
  async claimOutboxBatch(limit = SCAN_OUTBOX_BATCH_SIZE): Promise<ScanDelivery[]> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Array<{ scan_id: string; generation: number; scan_status: 'queued' | 'processing' }>>`
        WITH candidates AS (
          SELECT o.scan_id, s.status AS scan_status
          FROM scan_outbox o
          JOIN scans s ON s.id = o.scan_id
          WHERE s.status IN ('queued', 'processing')
            AND (
              (o.state = 'pending' AND o.available_at <= clock_timestamp())
              OR (o.state = 'dispatching' AND o.lease_expires_at <= clock_timestamp())
              OR (
                o.state = 'enqueued'
                AND o.lease_expires_at <= clock_timestamp()
                AND (s.status = 'queued' OR s.processing_lease_expires_at IS NULL OR s.processing_lease_expires_at <= clock_timestamp())
              )
          )
          ORDER BY o.available_at, o.created_at, o.scan_id
          LIMIT ${limit}
          FOR UPDATE OF o SKIP LOCKED
        )
        UPDATE scan_outbox o
        SET state = 'dispatching',
            generation = CASE WHEN o.state = 'pending' AND o.generation = 0 THEN 1 ELSE o.generation END,
            lease_expires_at = now() + (${SCAN_OUTBOX_DISPATCH_LEASE_MS} * interval '1 millisecond'),
            updated_at = now()
        FROM candidates c
        WHERE o.scan_id = c.scan_id
        RETURNING o.scan_id, o.generation, c.scan_status`;
      return rows.map(row => ({ scanId: row.scan_id, generation: row.generation, scanStatus: row.scan_status }));
    });
  }

  async markOutboxEnqueued(delivery: ScanDelivery): Promise<void> {
    await this.sql`
      UPDATE scan_outbox
      SET state = 'enqueued',
          lease_expires_at = GREATEST(
            COALESCE((SELECT processing_lease_expires_at FROM scans WHERE id = ${delivery.scanId} AND status = 'processing'), clock_timestamp()),
            clock_timestamp() + (${SCAN_OUTBOX_LIVE_JOB_POLL_MS} * interval '1 millisecond')
          ),
          updated_at = now()
      WHERE scan_id = ${delivery.scanId} AND generation = ${delivery.generation} AND state = 'dispatching'`;
  }

  /** Reserve one replacement generation after BullMQ reports an old job terminal. */
  async advanceOutboxGeneration(delivery: ScanDelivery): Promise<ScanDelivery | null> {
    const rows = await this.sql<Array<{ generation: number; scan_status: 'queued' | 'processing' }>>`
      UPDATE scan_outbox o
      SET generation = o.generation + 1,
          state = 'dispatching',
          lease_expires_at = clock_timestamp() + (${SCAN_OUTBOX_DISPATCH_LEASE_MS} * interval '1 millisecond'),
          updated_at = now()
      FROM scans s
      WHERE o.scan_id = ${delivery.scanId} AND o.scan_id = s.id
        AND o.generation = ${delivery.generation} AND o.state = 'dispatching'
        AND s.status IN ('queued', 'processing')
      RETURNING o.generation, s.status AS scan_status`;
    const row = rows[0];
    return row ? { scanId: delivery.scanId, generation: row.generation, scanStatus: row.scan_status } : null;
  }

  async releaseOutbox(delivery: ScanDelivery, delayMs = 5_000): Promise<void> {
    await this.sql`
      UPDATE scan_outbox
      SET state = 'pending', available_at = now() + (${delayMs} * interval '1 millisecond'),
          lease_expires_at = NULL, updated_at = now()
      WHERE scan_id = ${delivery.scanId} AND generation = ${delivery.generation} AND state = 'dispatching'`;
  }

  /**
   * Claim queued work or recover a processing lease that expired after a worker
   * crash. The increasing generation is a fencing token for every completion.
   */
  async markProcessing(scanId: string): Promise<number | null> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Array<{ processing_generation: number }>>`
        UPDATE scans
        SET status = 'processing', started_at = now(), updated_at = now(),
            processing_generation = processing_generation + 1,
            processing_lease_expires_at = now() + (${SCAN_PROCESSING_LEASE_MS} * interval '1 millisecond')
        WHERE id = ${scanId}
          AND (status = 'queued' OR (
            status = 'processing' AND
            (processing_lease_expires_at IS NULL OR processing_lease_expires_at <= clock_timestamp())
          ))
        RETURNING id, processing_generation, processing_lease_expires_at`;
      const generation = rows[0]?.processing_generation;
      if (generation === undefined) return null;
      await tx`
        UPDATE scan_outbox
        SET state = 'enqueued',
            lease_expires_at = (SELECT processing_lease_expires_at FROM scans WHERE id = ${scanId}),
            updated_at = now()
        WHERE scan_id = ${scanId} AND state <> 'processed'`;
      return generation;
    });
  }

  /**
   * Persist classification, award points, and close the outbox atomically. A
   * stale worker (wrong generation or expired lease) is fenced before it can
   * mutate the scan or ledger.
   */
  async completeSucceeded(
    scanId: string,
    generation: number,
    userId: string,
    sha256: string,
    result: AdapterResult,
  ): Promise<ScanCompletion> {
    return this.sql.begin(async (tx) => {
      const current = await tx<{ status: string; processing_generation: number }[]>`
        SELECT status, processing_generation FROM scans
        WHERE id = ${scanId} AND status = 'processing'
          AND processing_generation = ${generation}
          AND processing_lease_expires_at > clock_timestamp()
        FOR UPDATE`;
      if (current.length === 0) return { accepted: false, pointsAwarded: 0 };

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
            const award = await tx<{ delta: number }[]>`
              INSERT INTO point_ledger (user_id, event_key, source_type, source_id, delta, reason, activity_day)
              VALUES (${userId}, ${`scan:${scanId}`}, 'scan', ${scanId}, ${SCAN_AWARD_DELTA}, 'scan_classified', ${day})
              ON CONFLICT (event_key) DO NOTHING
              RETURNING delta`;
            if (award.length > 0) await tx`
              UPDATE user_daily_activity
              SET scan_award_count = scan_award_count + 1, net_points = net_points + ${SCAN_AWARD_DELTA}, updated_at = now()
              WHERE user_id = ${userId} AND activity_day = ${day}`;
            pointsAwarded = award[0]?.delta ?? 0;
          }
        }
      }

      await tx`
        UPDATE scans
        SET status = 'succeeded', outcome = ${result.outcome}, category_id = ${result.categoryId},
            predictions = ${tx.json(result.predictions as never)}, points_awarded = ${pointsAwarded},
            provider_revision = ${result.providerRevision}, finished_at = now(), updated_at = now(),
            processing_lease_expires_at = NULL
        WHERE id = ${scanId} AND processing_generation = ${generation}`;
      await tx`
        UPDATE scan_outbox
        SET state = 'processed', lease_expires_at = NULL, processed_at = now(), updated_at = now()
        WHERE scan_id = ${scanId}`;
      return { accepted: true, pointsAwarded };
    });
  }

  /** Mark a terminal provider/media failure only while this worker still owns the lease. */
  async completeFailed(scanId: string, generation: number, errorCode: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        UPDATE scans
        SET status = 'failed', error_code = ${errorCode}, finished_at = now(), updated_at = now(),
            processing_lease_expires_at = NULL
        WHERE id = ${scanId} AND status = 'processing'
          AND processing_generation = ${generation}
          AND processing_lease_expires_at > clock_timestamp()
        RETURNING id`;
      if (rows.length === 0) return false;
      await tx`
        UPDATE scan_outbox
        SET state = 'processed', lease_expires_at = NULL, processed_at = now(), updated_at = now()
        WHERE scan_id = ${scanId}`;
      return true;
    });
  }
}

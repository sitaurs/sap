import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { IdempotencyStore, type Tx } from '../infrastructure/idempotency.store.js';
import type { CategoryId, ScanOutcome, ScanPrediction, ScanRecord, ScanStatus, ScanView } from './scan.types.js';

interface ScanRow {
  id: string;
  media_id: string;
  status: ScanStatus;
  outcome: ScanOutcome | null;
  category_id: CategoryId | null;
  predictions: ScanPrediction[] | null;
  error_code: ScanRecord['errorCode'];
  points_awarded: number;
  ledger_points?: number;
  points_reason?: ScanRecord['pointsReason'];
  created_at: Date;
  finished_at: Date | null;
}

function mapScan(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    status: row.status,
    outcome: row.outcome,
    categoryId: row.category_id,
    predictions: row.predictions,
    errorCode: row.error_code,
    pointsAwarded: row.ledger_points ?? row.points_awarded,
    ...(row.points_reason ? { pointsReason: row.points_reason } : {}),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

const COLUMNS =
  'id, media_id, status, outcome, category_id, predictions, error_code, points_awarded, created_at, finished_at';

// Read the committed award, and only name a withheld reason backed by durable
// records. Current daily counters alone cannot explain a historical scan.
const READ_COLUMNS = `${COLUMNS},
  COALESCE((SELECT delta FROM point_ledger p
    WHERE p.event_key = 'scan:' || scans.id::text AND p.user_id = scans.user_id
      AND p.source_type = 'scan' AND p.source_id = scans.id AND p.delta > 0), 0) AS ledger_points,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM scan_dedup_keys d
      WHERE d.awarded_scan_id = scans.id AND d.user_id = scans.user_id
        AND (SELECT count(*) FROM point_ledger p
          WHERE p.user_id = scans.user_id AND p.activity_day = d.activity_day
            AND p.source_type = 'scan' AND p.reason = 'scan_classified' AND p.delta > 0) >= 5
    ) THEN 'daily_limit'
    WHEN EXISTS (
      SELECT 1 FROM scan_dedup_keys d JOIN media m ON m.id = scans.media_id AND m.sha256 = d.sha256
      WHERE d.user_id = scans.user_id AND d.awarded_scan_id <> scans.id
        AND d.activity_day = (scans.finished_at AT TIME ZONE 'Asia/Jakarta')::date
        AND d.created_at <= scans.finished_at
    ) THEN 'duplicate_image'
    ELSE 'unknown'
  END AS points_reason`;

@Injectable()
export class ScanRepository {
  constructor(
    @Inject(DATABASE) private readonly sql: Database,
    private readonly idempotency: IdempotencyStore,
  ) {}

  /**
   * Create a queued scan under an idempotency reservation. The reservation, the
   * scan insert, and the stored response commit in one transaction so a
   * duplicate `Idempotency-Key` replays the original 202 body (or 409s on a
   * payload mismatch) without ever creating a second scan.
   */
  async createQueuedIdempotent(input: {
    userId: string;
    mediaId: string;
    actorScope: string;
    route: string;
    key: string;
    requestHash: string;
    toView: (record: ScanRecord) => ScanView;
    beforeCreate?: (tx: Tx) => Promise<void>;
  }): Promise<{ view: ScanView; replayed: boolean }> {
    return this.sql.begin(async (tx) => {
      const replay = await this.idempotency.reserve(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        requestHash: input.requestHash,
      });
      if (replay) return { view: replay.body as ScanView, replayed: true };

      await input.beforeCreate?.(tx);

      const rows = await tx<ScanRow[]>`
        INSERT INTO scans (user_id, media_id, status)
        VALUES (${input.userId}, ${input.mediaId}, 'queued')
        RETURNING ${tx.unsafe(COLUMNS)}`;
      // Keep the durable delivery event inside the same commit as both the
      // scan and its idempotency response. Redis may be unavailable here; the
      // worker relay will deliver this row later.
      await tx`
        INSERT INTO scan_outbox (scan_id) VALUES (${rows[0]!.id})`;
      const view = input.toView(mapScan(rows[0]!));
      await this.idempotency.storeResponse(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        statusCode: 202,
        body: view,
      });
      return { view, replayed: false };
    });
  }

  async findByIdForOwner(scanId: string, userId: string): Promise<ScanRecord | null> {
    const rows = await this.sql<ScanRow[]>`
      SELECT ${this.sql.unsafe(READ_COLUMNS)} FROM scans
      WHERE id = ${scanId} AND user_id = ${userId}
      LIMIT 1`;
    return rows[0] ? mapScan(rows[0]) : null;
  }

  /** Keyset pagination over (created_at, id) descending. `cursor` = last seen id. */
  async listByOwner(userId: string, limit: number, cursor: string | null): Promise<ScanRecord[]> {
    const rows = cursor
      ? await this.sql<ScanRow[]>`
          SELECT ${this.sql.unsafe(READ_COLUMNS)} FROM scans
          WHERE user_id = ${userId}
            AND (created_at, id) < (SELECT created_at, id FROM scans WHERE id = ${cursor})
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}`
      : await this.sql<ScanRow[]>`
          SELECT ${this.sql.unsafe(READ_COLUMNS)} FROM scans
          WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}`;
    return rows.map(mapScan);
  }

  /** Count this user's scans created since `since` (for the per-account rate limit). */
  async countRecentForUser(userId: string, since: Date, executor: Database | Tx = this.sql): Promise<{ count: number; oldestAt: Date | null }> {
    const rows = await executor<{ count: number; oldest: Date | null }[]>`
      SELECT count(*)::int AS count, min(created_at) AS oldest
      FROM scans WHERE user_id = ${userId} AND created_at >= ${since}`;
    return { count: Number(rows[0]?.count ?? 0), oldestAt: rows[0]?.oldest ?? null };
  }
}

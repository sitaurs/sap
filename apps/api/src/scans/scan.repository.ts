import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { IdempotencyStore } from '../infrastructure/idempotency.store.js';
import type { CategoryId, ScanOutcome, ScanPrediction, ScanRecord, ScanStatus, ScanView } from './scan.types.js';

interface ScanRow {
  id: string;
  status: ScanStatus;
  outcome: ScanOutcome | null;
  category_id: CategoryId | null;
  predictions: ScanPrediction[] | null;
  error_code: ScanRecord['errorCode'];
  points_awarded: number;
  created_at: Date;
  finished_at: Date | null;
}

function mapScan(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    status: row.status,
    outcome: row.outcome,
    categoryId: row.category_id,
    predictions: row.predictions,
    errorCode: row.error_code,
    pointsAwarded: row.points_awarded,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

const COLUMNS =
  'id, status, outcome, category_id, predictions, error_code, points_awarded, created_at, finished_at';

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
  }): Promise<{ view: ScanView; replayed: boolean }> {
    return this.sql.begin(async (tx) => {
      const replay = await this.idempotency.reserve(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        requestHash: input.requestHash,
      });
      if (replay) return { view: replay.body as ScanView, replayed: true };

      const rows = await tx<ScanRow[]>`
        INSERT INTO scans (user_id, media_id, status)
        VALUES (${input.userId}, ${input.mediaId}, 'queued')
        RETURNING ${tx.unsafe(COLUMNS)}`;
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
      SELECT ${this.sql.unsafe(COLUMNS)} FROM scans
      WHERE id = ${scanId} AND user_id = ${userId}
      LIMIT 1`;
    return rows[0] ? mapScan(rows[0]) : null;
  }

  /** Keyset pagination over (created_at, id) descending. `cursor` = last seen id. */
  async listByOwner(userId: string, limit: number, cursor: string | null): Promise<ScanRecord[]> {
    const rows = cursor
      ? await this.sql<ScanRow[]>`
          SELECT ${this.sql.unsafe(COLUMNS)} FROM scans
          WHERE user_id = ${userId}
            AND (created_at, id) < (SELECT created_at, id FROM scans WHERE id = ${cursor})
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}`
      : await this.sql<ScanRow[]>`
          SELECT ${this.sql.unsafe(COLUMNS)} FROM scans
          WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}`;
    return rows.map(mapScan);
  }

  /** Count this user's scans created since `since` (for the per-account rate limit). */
  async countRecentForUser(userId: string, since: Date): Promise<{ count: number; oldestAt: Date | null }> {
    const rows = await this.sql<{ count: number; oldest: Date | null }[]>`
      SELECT count(*)::int AS count, min(created_at) AS oldest
      FROM scans WHERE user_id = ${userId} AND created_at >= ${since}`;
    return { count: Number(rows[0]?.count ?? 0), oldestAt: rows[0]?.oldest ?? null };
  }
}

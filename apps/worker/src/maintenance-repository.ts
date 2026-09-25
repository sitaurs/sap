import type { Sql } from 'postgres';

export interface DeletionJob {
  deletionId: string;
  userId: string | null;
  subjectHash: string;
  status: string;
}

export interface DeletionOutboxEvent {
  outboxId: string;
  deletionId: string;
  subjectHash: string;
}

export interface SweepResult {
  orphanMedia: number;
  idempotencyKeys: number;
  areaSnapshots: number;
  tombstones: number;
}

/** Grace period an unattached uploaded media may live before orphan cleanup removes it. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
/** Pseudonymised display name shown for a deleted account's residual public activity. */
export const DELETED_DISPLAY_NAME = 'Pengguna Dihapus';

export class MaintenanceRepository {
  constructor(private readonly sql: Sql) {}

  /**
   * Claim the next pending account-deletion outbox event, moving it to
   * `processing` under a row lock so concurrent workers do not double-run it.
   */
  async claimDeletionEvent(): Promise<DeletionOutboxEvent | null> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string; aggregate_id: string; payload_minimal: { subjectHash?: string } }[]>`
        SELECT id, aggregate_id, payload_minimal FROM outbox_events
        WHERE topic = 'account.deletion.requested' AND state = 'pending' AND next_attempt_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`;
      const row = rows[0];
      if (!row) return null;
      await tx`UPDATE outbox_events SET state = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = ${row.id}`;
      return { outboxId: row.id, deletionId: row.aggregate_id, subjectHash: row.payload_minimal?.subjectHash ?? '' };
    });
  }

  async markOutboxDelivered(outboxId: string): Promise<void> {
    await this.sql`UPDATE outbox_events SET state = 'delivered', updated_at = now() WHERE id = ${outboxId}`;
  }

  /** Return an event to `pending` with a backoff so it is retried later. */
  async markOutboxRetry(outboxId: string, delayMs: number): Promise<void> {
    await this.sql`
      UPDATE outbox_events
      SET state = 'pending', next_attempt_at = now() + make_interval(secs => ${delayMs / 1_000}), updated_at = now()
      WHERE id = ${outboxId}`;
  }

  async loadDeletionJob(deletionId: string): Promise<DeletionJob | null> {
    const rows = await this.sql<{ id: string; user_id: string | null; subject_hash: string; status: string }[]>`
      SELECT id, user_id, subject_hash, status FROM deletion_requests WHERE id = ${deletionId} LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return { deletionId: row.id, userId: row.user_id, subjectHash: row.subject_hash, status: row.status };
  }

  async markDeletionRunning(deletionId: string): Promise<void> {
    await this.sql`UPDATE deletion_requests SET status = 'running' WHERE id = ${deletionId}`;
  }

  async markDeletionFailed(deletionId: string, errorCode: string): Promise<void> {
    await this.sql`
      UPDATE deletion_requests SET status = 'failed', last_error_code = ${errorCode} WHERE id = ${deletionId}`;
  }

  /** Object keys (originals + published derivatives) that must be removed from R2 for a user. */
  async listUserObjectKeys(userId: string): Promise<string[]> {
    const rows = await this.sql<{ object_key: string; public_derivative_key: string | null }[]>`
      SELECT object_key, public_derivative_key FROM media WHERE owner_id = ${userId} AND state <> 'deleted'`;
    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(row.object_key);
      if (row.public_derivative_key) keys.add(row.public_derivative_key);
    }
    return [...keys];
  }

  /**
   * Finalize a deletion in one transaction after R2 objects are gone: mark media
   * rows deleted, pseudonymise the account and its residual public reports/activity
   * (keep the row so aggregates stay consistent — DATABASE.md §7), record the
   * completion, and write a tombstone so a backup restore can replay the cleanup.
   */
  async finalizeDeletion(deletionId: string, userId: string | null, subjectHash: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (userId) {
        await tx`
          UPDATE media SET state = 'deleted', deleted_at = now(), public_derivative_key = NULL, updated_at = now()
          WHERE owner_id = ${userId} AND state <> 'deleted'`;
        // Pseudonymise public reports: drop the reporter link, keep the incident.
        await tx`UPDATE reports SET reporter_id = NULL, updated_at = now() WHERE reporter_id = ${userId}`;
        await tx`
          UPDATE users SET
            display_name = ${DELETED_DISPLAY_NAME},
            password_hash = NULL,
            email_normalized = ${`deleted+${userId}@deleted.invalid`},
            email_verified_at = NULL,
            deleted_at = now(),
            updated_at = now()
          WHERE id = ${userId}`;
      }
      await tx`
        UPDATE deletion_requests SET status = 'completed', completed_at = now(), last_error_code = NULL
        WHERE id = ${deletionId}`;
      await tx`
        INSERT INTO deletion_tombstones (subject_hash, completed_at, expires_at)
        VALUES (${subjectHash}, now(), now() + ${`${TOMBSTONE_TTL_MS / 1_000} seconds`}::interval)
        ON CONFLICT (subject_hash) DO UPDATE SET completed_at = EXCLUDED.completed_at, expires_at = EXCLUDED.expires_at`;
    });
  }

  /**
   * Best-effort retention sweep: delete expired idempotency keys, expired area
   * snapshots, and expired deletion tombstones; mark orphaned uploaded media
   * (past its TTL and never attached to a report or scan) as deleted. The caller
   * removes those R2 objects first via {@link takeOrphanMediaKeys}.
   */
  async sweepExpired(): Promise<SweepResult> {
    const idem = await this.sql`DELETE FROM idempotency_keys WHERE expires_at < now()`;
    const snaps = await this.sql`DELETE FROM area_snapshots WHERE expires_at < now()`;
    const tombs = await this.sql`DELETE FROM deletion_tombstones WHERE expires_at < now()`;
    const media = await this.sql`
      UPDATE media SET state = 'deleted', deleted_at = now(), updated_at = now()
      WHERE state = 'stored' AND expires_at IS NOT NULL AND expires_at < now()
        AND id NOT IN (SELECT media_id FROM report_media)
        AND id NOT IN (SELECT media_id FROM scans)`;
    return {
      orphanMedia: media.count,
      idempotencyKeys: idem.count,
      areaSnapshots: snaps.count,
      tombstones: tombs.count,
    };
  }

  /** Orphan-media object keys eligible for R2 deletion (same predicate as the sweep). */
  async listOrphanMediaKeys(): Promise<{ id: string; objectKey: string }[]> {
    const rows = await this.sql<{ id: string; object_key: string }[]>`
      SELECT id, object_key FROM media
      WHERE state = 'stored' AND expires_at IS NOT NULL AND expires_at < now()
        AND id NOT IN (SELECT media_id FROM report_media)
        AND id NOT IN (SELECT media_id FROM scans)`;
    return rows.map((r) => ({ id: r.id, objectKey: r.object_key }));
  }
}

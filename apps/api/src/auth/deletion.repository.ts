import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { DeletionRecord, DeletionStatus } from './auth.types.js';

interface DeletionRow {
  id: string;
  user_id: string | null;
  status: DeletionStatus;
  requested_at: Date;
  completed_at: Date | null;
}

function map(row: DeletionRow): DeletionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  };
}

const COLUMNS = 'id, user_id, status, requested_at, completed_at';

@Injectable()
export class DeletionRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /**
   * Create a deletion request for a user. Idempotent against the partial unique
   * index on (user_id) WHERE status IN ('queued','running'): a user who already
   * has an in-flight request gets that existing row back rather than a duplicate.
   */
  async create(input: {
    userId: string;
    subjectHash: string;
    receiptHash: string;
    receiptExpiresAt: Date;
  }): Promise<DeletionRecord> {
    const rows = await this.sql<DeletionRow[]>`
      INSERT INTO deletion_requests (user_id, subject_hash, receipt_hash, receipt_expires_at)
      VALUES (${input.userId}, ${input.subjectHash}, ${input.receiptHash}, ${input.receiptExpiresAt})
      ON CONFLICT (user_id) WHERE status IN ('queued', 'running')
      DO UPDATE SET receipt_hash = ${input.receiptHash}, receipt_expires_at = ${input.receiptExpiresAt}
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return map(rows[0]!);
  }

  /** Resolve a deletion request from its receipt digest (deletion cookie flow). */
  async findByReceiptHash(receiptHash: string): Promise<DeletionRecord | null> {
    const rows = await this.sql<DeletionRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM deletion_requests
      WHERE receipt_hash = ${receiptHash} AND receipt_expires_at > now()
      LIMIT 1`;
    return rows[0] ? map(rows[0]) : null;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { ChallengePurpose, ChallengeRecord } from './auth.types.js';

interface ChallengeRow {
  id: string;
  user_id: string | null;
  email_hash: string;
  purpose: ChallengePurpose;
  code_hash: string;
  attempts: number;
  resend_after: Date | null;
  expires_at: Date;
  consumed_at: Date | null;
}

function map(row: ChallengeRow): ChallengeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    emailHash: row.email_hash,
    purpose: row.purpose,
    codeHash: row.code_hash,
    attempts: row.attempts,
    resendAfter: row.resend_after,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

const COLUMNS = 'id, user_id, email_hash, purpose, code_hash, attempts, resend_after, expires_at, consumed_at';

@Injectable()
export class ChallengeRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async create(input: {
    userId: string | null;
    emailHash: string;
    purpose: ChallengePurpose;
    codeHash: string;
    expiresAt: Date;
    resendAfter: Date;
  }): Promise<ChallengeRecord> {
    const rows = await this.sql<ChallengeRow[]>`
      INSERT INTO auth_challenges (user_id, email_hash, purpose, code_hash, expires_at, resend_after)
      VALUES (${input.userId}, ${input.emailHash}, ${input.purpose}, ${input.codeHash}, ${input.expiresAt}, ${input.resendAfter})
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return map(rows[0]!);
  }

  async findById(id: string): Promise<ChallengeRecord | null> {
    const rows = await this.sql<ChallengeRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM auth_challenges WHERE id = ${id} LIMIT 1`;
    return rows[0] ? map(rows[0]) : null;
  }

  /** Most recent challenge for an email + purpose, used to enforce the resend cooldown. */
  async findLatestByEmail(emailHash: string, purpose: ChallengePurpose): Promise<ChallengeRecord | null> {
    const rows = await this.sql<ChallengeRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM auth_challenges
      WHERE email_hash = ${emailHash} AND purpose = ${purpose}
      ORDER BY created_at DESC LIMIT 1`;
    return rows[0] ? map(rows[0]) : null;
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.sql`UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ${id}`;
  }

  /** Atomically mark single-use. Returns true only for the caller that consumed it. */
  async consume(id: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE auth_challenges SET consumed_at = now()
      WHERE id = ${id} AND consumed_at IS NULL
      RETURNING id`;
    return rows.length === 1;
  }
}

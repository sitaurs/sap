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
export const MAX_CHALLENGE_ATTEMPTS = 5;

export interface IssuedChallenge {
  challenge: ChallengeRecord;
  created: boolean;
}

@Injectable()
export class ChallengeRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /**
   * Reuse the active challenge during its cooldown or create one new challenge.
   * A transaction advisory lock serializes requests across API processes for a
   * given (email, purpose), while the row lock coordinates with consumers.
   */
  async createOrReuse(input: {
    userId: string | null;
    emailHash: string;
    purpose: ChallengePurpose;
    codeHash: string;
    ttlMs: number;
    resendCooldownMs: number;
  }): Promise<IssuedChallenge> {
    return this.sql.begin(async (tx) => {
      await tx`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.emailHash} || ':' || ${input.purpose}, 0))`;

      const latestRows = await tx<ChallengeRow[]>`
        SELECT ${tx.unsafe(COLUMNS)} FROM auth_challenges
        WHERE email_hash = ${input.emailHash} AND purpose = ${input.purpose}
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      const latest = latestRows[0] ? map(latestRows[0]) : null;
      const clockRows = await tx<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const now = clockRows[0]!.now;
      if (
        latest && !latest.consumedAt && latest.resendAfter &&
        latest.resendAfter.getTime() > now.getTime() && latest.expiresAt.getTime() > now.getTime()
      ) {
        return { challenge: latest, created: false };
      }

      // A resend replaces the previous code. Invalidate any still-unconsumed
      // challenge so an older code cannot remain usable alongside the new one.
      await tx`
        UPDATE auth_challenges SET consumed_at = clock_timestamp()
        WHERE email_hash = ${input.emailHash} AND purpose = ${input.purpose} AND consumed_at IS NULL`;

      const expiresAt = new Date(now.getTime() + input.ttlMs);
      const resendAfter = new Date(now.getTime() + input.resendCooldownMs);
      const rows = await tx<ChallengeRow[]>`
        INSERT INTO auth_challenges (user_id, email_hash, purpose, code_hash, expires_at, resend_after, created_at)
        VALUES (${input.userId}, ${input.emailHash}, ${input.purpose}, ${input.codeHash}, ${expiresAt}, ${resendAfter}, clock_timestamp())
        RETURNING ${tx.unsafe(COLUMNS)}`;
      return { challenge: map(rows[0]!), created: true };
    });
  }

  async findById(id: string): Promise<ChallengeRecord | null> {
    const rows = await this.sql<ChallengeRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM auth_challenges WHERE id = ${id} LIMIT 1`;
    return rows[0] ? map(rows[0]) : null;
  }

  async incrementAttempts(id: string): Promise<void> {
    // The condition is enforced by PostgreSQL so concurrent wrong-code requests
    // cannot move the challenge past the five-attempt cap.
    await this.sql`
      UPDATE auth_challenges SET attempts = attempts + 1
      WHERE id = ${id} AND consumed_at IS NULL AND expires_at > clock_timestamp() AND attempts < ${MAX_CHALLENGE_ATTEMPTS}`;
  }

  /** Atomically mark single-use. Returns true only for the caller that consumed it. */
  async consume(id: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE auth_challenges SET consumed_at = clock_timestamp()
      WHERE id = ${id} AND consumed_at IS NULL AND expires_at > clock_timestamp() AND attempts < ${MAX_CHALLENGE_ATTEMPTS}
      RETURNING id`;
    return rows.length === 1;
  }

  /** Atomically consume a validated reset challenge, change password and revoke all sessions. */
  async completePasswordReset(input: { challengeId: string; userId: string; passwordHash: string }): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const challenges = await tx<{ id: string; user_id: string | null }[]>`
        SELECT id, user_id FROM auth_challenges
        WHERE id = ${input.challengeId} AND purpose = 'reset_password'
          AND consumed_at IS NULL AND expires_at > clock_timestamp() AND attempts < ${MAX_CHALLENGE_ATTEMPTS}
        FOR UPDATE`;
      if (!challenges[0] || challenges[0].user_id !== input.userId) return false;

      const users = await tx<{ id: string }[]>`
        UPDATE users SET password_hash = ${input.passwordHash}, updated_at = now()
        WHERE id = ${input.userId} AND deleted_at IS NULL
        RETURNING id`;
      if (users.length !== 1) return false;

      await tx`DELETE FROM sessions WHERE user_id = ${input.userId}`;
      const consumed = await tx<{ id: string }[]>`
        UPDATE auth_challenges SET consumed_at = clock_timestamp()
        WHERE id = ${input.challengeId} AND consumed_at IS NULL AND expires_at > clock_timestamp() AND attempts < ${MAX_CHALLENGE_ATTEMPTS}
        RETURNING id`;
      if (consumed.length !== 1) throw new Error('Reset challenge changed while locked');
      return true;
    });
  }
}

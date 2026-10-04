import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { MfaFactorRecord, MfaPreauthRecord, MfaState } from './mfa.types.js';

interface FactorRow {
  user_id: string;
  state: MfaState;
  secret_ciphertext: string;
  secret_iv: string;
  secret_tag: string;
  last_accepted_step: string | number | null;
  pending_expires_at: Date | null;
}

interface PreauthRow {
  token_hash: string;
  user_id: string;
  expires_at: Date;
  attempts: number;
  consumed_at: Date | null;
}

const ROLLBACK_SENTINEL = Symbol('mfa-transaction-rollback');

interface LimitRow {
  user_id: string;
  window_started_at: Date;
  attempts: number;
  locked_until: Date | null;
}

function mapFactor(row: FactorRow): MfaFactorRecord {
  return {
    userId: row.user_id,
    state: row.state,
    secretCiphertext: row.secret_ciphertext,
    secretIv: row.secret_iv,
    secretTag: row.secret_tag,
    lastAcceptedStep: row.last_accepted_step === null ? null : Number(row.last_accepted_step),
    pendingExpiresAt: row.pending_expires_at,
  };
}

/**
 * All MFA persistence. Every ownership scope is the caller's own user_id passed
 * by the service from the authenticated session — never a model/body value. The
 * mutating verifications (activate/advanceStep/consume*) are single-statement
 * atomic guards so concurrent replays cannot both succeed.
 */
@Injectable()
export class MfaRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  private async rollbackValue<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error === ROLLBACK_SENTINEL) return false as T;
      throw error;
    }
  }

  async getFactor(userId: string): Promise<MfaFactorRecord | null> {
    const rows = await this.sql<FactorRow[]>`
      SELECT user_id, state, secret_ciphertext, secret_iv, secret_tag, last_accepted_step, pending_expires_at
      FROM mfa_factors WHERE user_id = ${userId} LIMIT 1`;
    return rows[0] ? mapFactor(rows[0]) : null;
  }

  /** Create or replace a pending factor (a prior pending row is overwritten). */
  async upsertPending(input: {
    userId: string;
    secretCiphertext: string;
    secretIv: string;
    secretTag: string;
    pendingExpiresAt: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO mfa_factors (user_id, state, secret_ciphertext, secret_iv, secret_tag, pending_expires_at)
      VALUES (${input.userId}, 'pending', ${input.secretCiphertext}, ${input.secretIv}, ${input.secretTag}, ${input.pendingExpiresAt})
      ON CONFLICT (user_id) DO UPDATE SET
        state = 'pending',
        secret_ciphertext = EXCLUDED.secret_ciphertext,
        secret_iv = EXCLUDED.secret_iv,
        secret_tag = EXCLUDED.secret_tag,
        last_accepted_step = NULL,
        pending_expires_at = EXCLUDED.pending_expires_at,
        updated_at = now()`;
  }

  /** Activate a pending factor and install its recovery hashes atomically. */
  async completeEnrollment(userId: string, step: number, codeHashes: string[]): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      // Serialize activation with password-only session creation on the user row.
      await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const rows = await tx<{ user_id: string }[]>`
        UPDATE mfa_factors
        SET state = 'active', last_accepted_step = ${step}, pending_expires_at = NULL, updated_at = now()
        WHERE user_id = ${userId} AND state = 'pending' AND pending_expires_at > now()
        RETURNING user_id`;
      if (rows.length !== 1) return false;
      await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
      for (const codeHash of codeHashes) {
        await tx`INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (${userId}, ${codeHash})`;
      }
      // Revoke any password-only session inserted before this lock was acquired.
      await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
      return true;
    });
  }

  /** Mint a second-factor session only while the factor is still active. */
  async createSessionWhileMfaActive(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`;
      const rows = await tx<{ user_id: string }[]>`
        INSERT INTO sessions (user_id, token_hash, expires_at, last_seen_at)
        SELECT u.id, ${input.tokenHash}, ${input.expiresAt}, now()
        FROM users u
        WHERE u.id = ${input.userId}
          AND EXISTS (SELECT 1 FROM mfa_factors f WHERE f.user_id = u.id AND f.state = 'active')
        RETURNING user_id`;
      return rows.length === 1;
    });
  }

  /** Disable the active factor and revoke sessions in one transaction. */
  async disableActiveFactor(userId: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const rows = await tx<{ user_id: string }[]>`
        DELETE FROM mfa_factors WHERE user_id = ${userId} AND state = 'active'
        RETURNING user_id`;
      if (rows.length !== 1) return false;
      await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
      await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
      await tx`DELETE FROM mfa_login_limits WHERE user_id = ${userId}`;
      return true;
    });
  }

  /** Replace recovery codes only while active, revoking sessions atomically. */
  async replaceRecoveryCodesAndRevokeSessions(userId: string, codeHashes: string[]): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const active = await tx<{ user_id: string }[]>`
        SELECT user_id FROM mfa_factors WHERE user_id = ${userId} AND state = 'active'`;
      if (active.length !== 1) return false;
      await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
      for (const codeHash of codeHashes) {
        await tx`INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (${userId}, ${codeHash})`;
      }
      await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
      return true;
    });
  }


  /**
   * Monotonic replay guard for an active factor: accept a step only if it is
   * strictly greater than the last accepted one. Concurrent submissions of the
   * same code race on this single UPDATE, so at most one succeeds.
   */
  async advanceStep(userId: string, step: number): Promise<boolean> {
    const rows = await this.sql<{ user_id: string }[]>`
      UPDATE mfa_factors
      SET last_accepted_step = ${step}, updated_at = now()
      WHERE user_id = ${userId} AND state = 'active'
        AND (last_accepted_step IS NULL OR last_accepted_step < ${step})
      RETURNING user_id`;
    return rows.length === 1;
  }

  async deleteFactor(userId: string): Promise<void> {
    await this.sql`DELETE FROM mfa_factors WHERE user_id = ${userId}`;
  }

  /** Replace the whole recovery-code set in one transaction (regenerate/enroll). */
  async replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
      for (const codeHash of codeHashes) {
        await tx`INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (${userId}, ${codeHash})`;
      }
    });
  }

  /**
   * Atomically consume a pre-auth challenge and advance its TOTP step in one
   * transaction. Any failed condition rolls back both writes (including when
   * concurrent factor submissions race).
   */
  async completePreauthWithTotp(input: { tokenHash: string; userId: string; step: number }): Promise<boolean> {
    return this.rollbackValue(() => this.sql.begin(async (tx) => {
      const preauth = await tx<{ token_hash: string }[]>`
        UPDATE mfa_preauth_challenges SET consumed_at = now()
        WHERE token_hash = ${input.tokenHash} AND user_id = ${input.userId}
          AND consumed_at IS NULL AND expires_at > now() AND attempts <= 5
        RETURNING token_hash`;
      if (preauth.length !== 1) throw ROLLBACK_SENTINEL;
      const factor = await tx<{ user_id: string }[]>`
        UPDATE mfa_factors SET last_accepted_step = ${input.step}, updated_at = now()
        WHERE user_id = ${input.userId} AND state = 'active'
          AND (last_accepted_step IS NULL OR last_accepted_step < ${input.step})
        RETURNING user_id`;
      if (factor.length !== 1) throw ROLLBACK_SENTINEL;
      return true;
    }));
  }

  /**
   * Atomically consume a pre-auth token and one recovery code. A failed second
   * condition rolls back the first write so a concurrent request cannot burn a
   * code without completing authentication.
   */
  async completePreauthWithRecovery(input: { tokenHash: string; userId: string; codeHash: string }): Promise<boolean> {
    return this.rollbackValue(() => this.sql.begin(async (tx) => {
      const preauth = await tx<{ token_hash: string }[]>`
        UPDATE mfa_preauth_challenges SET consumed_at = now()
        WHERE token_hash = ${input.tokenHash} AND user_id = ${input.userId}
          AND consumed_at IS NULL AND expires_at > now() AND attempts <= 5
        RETURNING token_hash`;
      if (preauth.length !== 1) throw ROLLBACK_SENTINEL;
      const code = await tx<{ id: string }[]>`
        UPDATE mfa_recovery_codes SET consumed_at = now()
        WHERE user_id = ${input.userId} AND code_hash = ${input.codeHash} AND consumed_at IS NULL
        RETURNING id`;
      if (code.length !== 1) throw ROLLBACK_SENTINEL;
      return true;
    }));
  }

  /** Atomically consume one unused recovery code; false if absent/already used. */
  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE mfa_recovery_codes SET consumed_at = now()
      WHERE user_id = ${userId} AND code_hash = ${codeHash} AND consumed_at IS NULL
      RETURNING id`;
    return rows.length === 1;
  }

  async countUnusedRecoveryCodes(userId: string): Promise<number> {
    const rows = await this.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM mfa_recovery_codes
      WHERE user_id = ${userId} AND consumed_at IS NULL`;
    return Number(rows[0]?.count ?? 0);
  }

  async deleteRecoveryCodes(userId: string): Promise<void> {
    await this.sql`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
  }

  async createPreauth(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void> {
    await this.sql`
      INSERT INTO mfa_preauth_challenges (token_hash, user_id, expires_at)
      VALUES (${input.tokenHash}, ${input.userId}, ${input.expiresAt})`;
  }

  async findPreauth(tokenHash: string): Promise<MfaPreauthRecord | null> {
    const rows = await this.sql<PreauthRow[]>`
      SELECT token_hash, user_id, expires_at, attempts, consumed_at
      FROM mfa_preauth_challenges WHERE token_hash = ${tokenHash} LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      expiresAt: row.expires_at,
      attempts: row.attempts,
      consumedAt: row.consumed_at,
    };
  }

  /** Count an attempt before any code cryptography; cap it atomically at five. */
  async claimPreauthAttempt(tokenHash: string, userId: string, now: Date): Promise<boolean> {
    const rows = await this.sql<{ token_hash: string }[]>`
      UPDATE mfa_preauth_challenges SET attempts = attempts + 1
      WHERE token_hash = ${tokenHash} AND user_id = ${userId}
        AND consumed_at IS NULL AND expires_at > ${now} AND attempts < 5
      RETURNING token_hash`;
    return rows.length === 1;
  }

  /**
   * Persistent per-account limiter. Five attempts are available in a 15-minute
   * window; a lock is applied on the next attempt and lasts 15 minutes. The
   * increment/window/lock transition is one SQL upsert, not a racy read+write.
   */
  async claimAccountLoginAttempt(userId: string, now: Date): Promise<boolean> {
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 5;
    const lockMs = 15 * 60 * 1000;
    const resetBefore = new Date(now.getTime() - windowMs);
    const lockUntil = new Date(now.getTime() + lockMs);
    const rows = await this.sql<{ attempts: number; locked_until: Date | null }[]>`
      INSERT INTO mfa_login_limits (user_id, window_started_at, attempts, locked_until)
      VALUES (${userId}, ${now}, 1, NULL)
      ON CONFLICT (user_id) DO UPDATE SET
        window_started_at = CASE
          WHEN mfa_login_limits.locked_until IS NULL AND mfa_login_limits.window_started_at <= ${resetBefore}
          THEN ${now} ELSE mfa_login_limits.window_started_at END,
        attempts = CASE
          WHEN mfa_login_limits.locked_until IS NULL AND mfa_login_limits.window_started_at <= ${resetBefore}
          THEN 1 ELSE LEAST(mfa_login_limits.attempts + 1, ${maxAttempts + 1}) END,
        locked_until = CASE
          WHEN mfa_login_limits.locked_until > ${now} THEN mfa_login_limits.locked_until
          WHEN mfa_login_limits.window_started_at <= ${resetBefore} AND mfa_login_limits.locked_until IS NULL
          THEN NULL
          WHEN mfa_login_limits.attempts >= ${maxAttempts} THEN ${lockUntil}
          ELSE NULL END
      RETURNING attempts, locked_until`;
    const row = rows[0];
    return !!row && row.attempts <= maxAttempts && !(row.locked_until && row.locked_until > now);
  }

  async clearLoginLimit(userId: string): Promise<void> {
    await this.sql`DELETE FROM mfa_login_limits WHERE user_id = ${userId}`;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { SessionRecord, UserRecord } from '../auth/auth.types.js';

interface SessionUserRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  last_seen_at: Date | null;
  reauthenticated_at: Date | null;
  u_id: string;
  u_email_normalized: string;
  u_password_hash: string | null;
  u_display_name: string;
  u_role: 'user' | 'admin';
  u_email_verified_at: Date | null;
  u_sapa_enabled: boolean;
  u_deleted_at: Date | null;
}

export interface ResolvedSession {
  session: SessionRecord;
  user: UserRecord;
}

function map(row: SessionUserRow): ResolvedSession {
  return {
    session: {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
      reauthenticatedAt: row.reauthenticated_at,
    },
    user: {
      id: row.u_id,
      emailNormalized: row.u_email_normalized,
      passwordHash: row.u_password_hash,
      displayName: row.u_display_name,
      role: row.u_role,
      emailVerifiedAt: row.u_email_verified_at,
      sapaEnabled: row.u_sapa_enabled,
      deletedAt: row.u_deleted_at,
    },
  };
}

@Injectable()
export class SessionRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.sql`
      INSERT INTO sessions (user_id, token_hash, expires_at, last_seen_at)
      VALUES (${input.userId}, ${input.tokenHash}, ${input.expiresAt}, now())`;
  }

  /** Resolve an unexpired session joined to its (active) owner. */
  async resolveActive(tokenHash: string): Promise<ResolvedSession | null> {
    const rows = await this.sql<SessionUserRow[]>`
      SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.last_seen_at, s.reauthenticated_at,
             u.id AS u_id, u.email_normalized AS u_email_normalized, u.password_hash AS u_password_hash,
             u.display_name AS u_display_name, u.role AS u_role,
             u.email_verified_at AS u_email_verified_at, u.sapa_enabled AS u_sapa_enabled, u.deleted_at AS u_deleted_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() AND u.deleted_at IS NULL
      LIMIT 1`;
    return rows[0] ? map(rows[0]) : null;
  }

  async touchLastSeen(tokenHash: string): Promise<void> {
    await this.sql`UPDATE sessions SET last_seen_at = now() WHERE token_hash = ${tokenHash}`;
  }

  async markReauthenticated(tokenHash: string): Promise<void> {
    await this.sql`UPDATE sessions SET reauthenticated_at = now() WHERE token_hash = ${tokenHash}`;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
  }

  /** Revoke every session for a user (reset-password + account deletion). */
  async deleteAllForUser(userId: string): Promise<void> {
    await this.sql`DELETE FROM sessions WHERE user_id = ${userId}`;
  }
}

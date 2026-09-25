import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { UserRecord } from '../auth/auth.types.js';

interface UserRow {
  id: string;
  email_normalized: string;
  password_hash: string | null;
  display_name: string;
  role: 'user' | 'admin';
  email_verified_at: Date | null;
  sapa_enabled: boolean;
  deleted_at: Date | null;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role,
    emailVerifiedAt: row.email_verified_at,
    sapaEnabled: row.sapa_enabled,
    deletedAt: row.deleted_at,
  };
}

const COLUMNS = 'id, email_normalized, password_hash, display_name, role, email_verified_at, sapa_enabled, deleted_at';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async findActiveByEmail(emailNormalized: string): Promise<UserRecord | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM users
      WHERE email_normalized = ${emailNormalized} AND deleted_at IS NULL
      LIMIT 1`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findActiveById(id: string): Promise<UserRecord | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM users
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createUnverified(input: { emailNormalized: string; passwordHash: string; displayName: string }): Promise<UserRecord> {
    const rows = await this.sql<UserRow[]>`
      INSERT INTO users (email_normalized, password_hash, display_name)
      VALUES (${input.emailNormalized}, ${input.passwordHash}, ${input.displayName})
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return mapUser(rows[0]!);
  }

  /** Refresh an existing still-unverified registration (re-register before verifying). */
  async refreshUnverified(userId: string, input: { passwordHash: string; displayName: string }): Promise<void> {
    await this.sql`
      UPDATE users
      SET password_hash = ${input.passwordHash}, display_name = ${input.displayName}, updated_at = now()
      WHERE id = ${userId} AND email_verified_at IS NULL AND deleted_at IS NULL`;
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.sql`
      UPDATE users SET email_verified_at = now(), updated_at = now()
      WHERE id = ${userId} AND email_verified_at IS NULL`;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.sql`
      UPDATE users SET password_hash = ${passwordHash}, updated_at = now()
      WHERE id = ${userId} AND deleted_at IS NULL`;
  }

  async updateDisplayName(userId: string, displayName: string): Promise<UserRecord | null> {
    const rows = await this.sql<UserRow[]>`
      UPDATE users SET display_name = ${displayName}, updated_at = now()
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  /**
   * Update only the SAPA preference flag for the owning account. The caller
   * passes the id from the verified session, never from the request body.
   */
  async updateSapaEnabled(userId: string, sapaEnabled: boolean): Promise<UserRecord | null> {
    const rows = await this.sql<UserRow[]>`
      UPDATE users SET sapa_enabled = ${sapaEnabled}, updated_at = now()
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return rows[0] ? mapUser(rows[0]) : null;
  }
}

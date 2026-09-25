import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';

/** OpenAPI `AuditEvent` — redacted: action, target, actor display name, timestamp only. */
export interface AuditEventView {
  id: string;
  action: string;
  targetId: string;
  actorDisplayName: string;
  createdAt: string;
}

@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /**
   * Keyset page over audit events, newest first ((created_at, id) descending).
   * Only the redacted projection is returned — `changes_redacted` and `request_id`
   * never leave the database. The actor is exposed as a display name (never email),
   * defaulting to "system" for actor-less events.
   */
  async listAuditEvents(limit: number, cursor: string | null): Promise<AuditEventView[]> {
    const rows = await this.sql<
      { id: string; action: string; target_id: string | null; actor_display_name: string; created_at: Date }[]
    >`
      SELECT a.id, a.action, a.target_id, a.created_at,
             COALESCE(u.display_name, 'system') AS actor_display_name
      FROM audit_events a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE TRUE
        ${cursor ? this.sql`AND (a.created_at, a.id) < (SELECT created_at, id FROM audit_events WHERE id = ${cursor})` : this.sql``}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetId: r.target_id ?? '',
      actorDisplayName: r.actor_display_name,
      createdAt: r.created_at.toISOString(),
    }));
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { AchievementId } from './gamification.types.js';

export interface AchievementDefinitionRow {
  id: AchievementId;
  name: string;
  description: string;
}

export interface UserAchievementRow {
  achievementId: AchievementId;
  unlockedAt: Date;
  revokedAt: Date | null;
}

/**
 * Persistence for badge state. Unlock/revoke are idempotent so the read-time
 * reconciliation in {@link GamificationService} can be applied repeatedly
 * without creating duplicates or spurious history.
 */
@Injectable()
export class AchievementRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async listDefinitions(): Promise<AchievementDefinitionRow[]> {
    return this.sql<AchievementDefinitionRow[]>`
      SELECT id, name, description FROM achievement_definitions ORDER BY id`;
  }

  async listForUser(userId: string): Promise<UserAchievementRow[]> {
    const rows = await this.sql<{ achievement_id: AchievementId; unlocked_at: Date; revoked_at: Date | null }[]>`
      SELECT achievement_id, unlocked_at, revoked_at
      FROM user_achievements WHERE user_id = ${userId}`;
    return rows.map((row) => ({
      achievementId: row.achievement_id,
      unlockedAt: row.unlocked_at,
      revokedAt: row.revoked_at,
    }));
  }

  /** Unlock (or re-unlock a previously revoked) badge. Returns its unlock time. */
  async unlock(userId: string, achievementId: AchievementId): Promise<Date> {
    const rows = await this.sql<{ unlocked_at: Date }[]>`
      INSERT INTO user_achievements (user_id, achievement_id, unlocked_at, revoked_at)
      VALUES (${userId}, ${achievementId}, now(), NULL)
      ON CONFLICT (user_id, achievement_id)
      DO UPDATE SET unlocked_at = now(), revoked_at = NULL
      RETURNING unlocked_at`;
    return rows[0]!.unlocked_at;
  }

  /** Mark a currently-held badge revoked. Returns the revocation time, if any. */
  async revoke(userId: string, achievementId: AchievementId): Promise<Date | null> {
    const rows = await this.sql<{ revoked_at: Date }[]>`
      UPDATE user_achievements SET revoked_at = now()
      WHERE user_id = ${userId} AND achievement_id = ${achievementId} AND revoked_at IS NULL
      RETURNING revoked_at`;
    return rows[0]?.revoked_at ?? null;
  }
}

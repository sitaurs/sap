import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { LeaderboardCursor, LeaderboardEntryView } from './gamification.types.js';

/**
 * Public leaderboard read-model. Ranks users by NET eco-points (sum of
 * point_ledger deltas). Deleted users are excluded before ranking so ranks stay
 * contiguous. Only public identity (displayName) is exposed — never email.
 *
 * Pagination is keyset over (ecoPoints DESC, userId ASC); RANK() provides the
 * displayed competition rank (ties share a rank). Paginating on the value tuple
 * rather than the rank number keeps tied entries from being skipped at a page
 * boundary.
 */
@Injectable()
export class LeaderboardRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async page(limit: number, cursor: LeaderboardCursor | null): Promise<LeaderboardEntryView[]> {
    const rows = await this.sql<{ rank: string; user_id: string; display_name: string; eco_points: string }[]>`
      WITH totals AS (
        SELECT pl.user_id, COALESCE(sum(pl.delta), 0)::int AS eco_points
        FROM point_ledger pl
        JOIN users u ON u.id = pl.user_id AND u.deleted_at IS NULL
        GROUP BY pl.user_id
      ),
      ranked AS (
        SELECT user_id, eco_points, rank() OVER (ORDER BY eco_points DESC) AS rank
        FROM totals
      )
      SELECT r.rank, r.user_id, r.eco_points, u.display_name
      FROM ranked r
      JOIN users u ON u.id = r.user_id
      WHERE ${
        cursor
          ? this.sql`(r.eco_points < ${cursor.ecoPoints}
              OR (r.eco_points = ${cursor.ecoPoints} AND r.user_id > ${cursor.userId}))`
          : this.sql`true`
      }
      ORDER BY r.eco_points DESC, r.user_id ASC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      rank: Number(row.rank),
      userId: row.user_id,
      displayName: row.display_name,
      ecoPoints: Number(row.eco_points),
    }));
  }
}

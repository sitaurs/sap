import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { CategoryId } from '../scans/scan.types.js';
import type { CategoryCountView, StatsFacts } from './gamification.types.js';

/**
 * Read-model aggregations for a user's gamification stats. All counts come
 * straight from the write-model tables (scans, point_ledger, reports) so the
 * numbers are always consistent with what the worker/moderation flows recorded.
 */
@Injectable()
export class StatsRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  async loadFacts(userId: string): Promise<StatsFacts> {
    const [scanRows, pointRows, categoryRows, reportRows, dayRows] = await Promise.all([
      this.sql<{ total: string; classified: string }[]>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE outcome = 'classified') AS classified
        FROM scans WHERE user_id = ${userId}`,
      this.sql<{ eco_points: string }[]>`
        SELECT COALESCE(sum(delta), 0) AS eco_points
        FROM point_ledger WHERE user_id = ${userId}`,
      // classifiedScans counts ALL classified scans (incl. those over the daily
      // point quota), so category counts are grouped over every classified scan.
      this.sql<{ category_id: CategoryId; count: string }[]>`
        SELECT category_id, count(*) AS count
        FROM scans
        WHERE user_id = ${userId} AND outcome = 'classified' AND category_id IS NOT NULL
        GROUP BY category_id
        ORDER BY category_id`,
      this.sql<{ verified: string; resolved: string }[]>`
        SELECT count(*) FILTER (WHERE status IN ('verified', 'in_progress', 'resolved')) AS verified,
               count(*) FILTER (WHERE status = 'resolved') AS resolved
        FROM reports WHERE reporter_id = ${userId}`,
      // Point-earning activity days drive the streak: only positive ledger deltas
      // (awards) count; reversals (negative compensating entries) do not.
      this.sql<{ activity_day: string }[]>`
        SELECT DISTINCT to_char(activity_day, 'YYYY-MM-DD') AS activity_day
        FROM point_ledger
        WHERE user_id = ${userId} AND delta > 0
        ORDER BY 1`,
    ]);

    const categoryCounts: CategoryCountView[] = categoryRows.map((row) => ({
      categoryId: row.category_id,
      count: Number(row.count),
    }));

    return {
      totalScans: Number(scanRows[0]?.total ?? 0),
      classifiedScans: Number(scanRows[0]?.classified ?? 0),
      ecoPoints: Number(pointRows[0]?.eco_points ?? 0),
      verifiedReports: Number(reportRows[0]?.verified ?? 0),
      resolvedReports: Number(reportRows[0]?.resolved ?? 0),
      categoryCounts,
      awardDays: dayRows.map((row) => row.activity_day),
    };
  }
}

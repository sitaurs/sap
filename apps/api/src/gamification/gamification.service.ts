import { BadRequestException, Injectable } from '@nestjs/common';
import { AchievementRepository } from './achievement.repository.js';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { StatsRepository } from './stats.repository.js';
import {
  ACHIEVEMENT_IDS,
  computeStreak,
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  isAchievementEligible,
  jakartaToday,
  type AchievementView,
  type LeaderboardEntryView,
  type StatsView,
} from './gamification.types.js';

export const DEFAULT_LEADERBOARD_PAGE = 20;

export interface AchievementPageView {
  items: AchievementView[];
  nextCursor: string | null;
}

export interface LeaderboardPageView {
  items: LeaderboardEntryView[];
  nextCursor: string | null;
}

@Injectable()
export class GamificationService {
  constructor(
    private readonly stats: StatsRepository,
    private readonly achievements: AchievementRepository,
    private readonly leaderboard: LeaderboardRepository,
  ) {}

  async getStats(userId: string, now: number = Date.now()): Promise<StatsView> {
    const facts = await this.stats.loadFacts(userId);
    return {
      totalScans: facts.totalScans,
      classifiedScans: facts.classifiedScans,
      ecoPoints: facts.ecoPoints,
      streakDays: computeStreak(facts.awardDays, jakartaToday(now)),
      verifiedReports: facts.verifiedReports,
      resolvedReports: facts.resolvedReports,
      categoryCounts: facts.categoryCounts,
    };
  }

  /**
   * Returns all badge definitions with their current state, reconciling stored
   * state against live criteria first: newly-earned badges are unlocked and
   * badges whose criteria no longer hold (e.g. a report verification was
   * cancelled) are revoked. The list is a fixed small set, so nextCursor is
   * always null.
   */
  async getAchievements(userId: string, now: number = Date.now()): Promise<AchievementPageView> {
    const facts = await this.stats.loadFacts(userId);
    const achievementFacts = {
      classifiedScans: facts.classifiedScans,
      verifiedReports: facts.verifiedReports,
      streakDays: computeStreak(facts.awardDays, jakartaToday(now)),
    };

    const [definitions, existing] = await Promise.all([
      this.achievements.listDefinitions(),
      this.achievements.listForUser(userId),
    ]);
    const byId = new Map(existing.map((row) => [row.achievementId, row]));

    const items: AchievementView[] = [];
    for (const id of ACHIEVEMENT_IDS) {
      const definition = definitions.find((d) => d.id === id);
      if (!definition) continue; // reference data missing; skip defensively
      const eligible = isAchievementEligible(id, achievementFacts);
      let row = byId.get(id) ?? null;
      const active = row !== null && row.revokedAt === null;

      if (eligible && !active) {
        const unlockedAt = await this.achievements.unlock(userId, id);
        row = { achievementId: id, unlockedAt, revokedAt: null };
      } else if (!eligible && active) {
        const revokedAt = await this.achievements.revoke(userId, id);
        row = { achievementId: id, unlockedAt: row!.unlockedAt, revokedAt };
      }

      items.push({
        id,
        name: definition.name,
        description: definition.description,
        unlockedAt: row ? row.unlockedAt.toISOString() : null,
        revokedAt: row?.revokedAt ? row.revokedAt.toISOString() : null,
      });
    }

    return { items, nextCursor: null };
  }

  async getLeaderboard(limit: number | undefined, cursor: string | undefined): Promise<LeaderboardPageView> {
    const pageSize = limit ?? DEFAULT_LEADERBOARD_PAGE;
    let decoded = null;
    if (cursor !== undefined) {
      decoded = decodeLeaderboardCursor(cursor);
      if (!decoded) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Cursor tidak valid.' });
      }
    }

    // Fetch one extra row to decide whether another page exists.
    const rows = await this.leaderboard.page(pageSize + 1, decoded);
    const items = rows.slice(0, pageSize);
    const nextCursor =
      rows.length > pageSize && items.length > 0 ? encodeLeaderboardCursor(items[items.length - 1]!) : null;
    return { items, nextCursor };
  }
}

import type { CategoryId } from '../scans/scan.types.js';

/** Achievement identifiers, matching the OpenAPI `Achievement.id` enum exactly. */
export const ACHIEVEMENT_IDS = ['first_scan', 'scanner_10', 'first_verified_report', 'streak_3'] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface CategoryCountView {
  categoryId: CategoryId;
  count: number;
}

/** OpenAPI `Stats`. */
export interface StatsView {
  totalScans: number;
  classifiedScans: number;
  /** Net points; may be negative once reversals (compensating entries) apply. */
  ecoPoints: number;
  streakDays: number;
  verifiedReports: number;
  resolvedReports: number;
  categoryCounts: CategoryCountView[];
}

/** OpenAPI `Achievement`. */
export interface AchievementView {
  id: AchievementId;
  name: string;
  description: string;
  unlockedAt: string | null;
  revokedAt: string | null;
}

/** OpenAPI `LeaderboardEntry` — never exposes email. */
export interface LeaderboardEntryView {
  rank: number;
  userId: string;
  displayName: string;
  ecoPoints: number;
}

/** Raw aggregates read from the database for a single user. */
export interface StatsFacts {
  totalScans: number;
  classifiedScans: number;
  ecoPoints: number;
  verifiedReports: number;
  resolvedReports: number;
  categoryCounts: CategoryCountView[];
  /** Distinct Asia/Jakarta days (YYYY-MM-DD) on which the user earned points. */
  awardDays: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1_000;

/** Current civil day in Asia/Jakarta (UTC+7) as YYYY-MM-DD. */
export function jakartaToday(now: number = Date.now()): string {
  return new Date(now + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD day by `delta` calendar days (interpreted in UTC). */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Streak = number of consecutive Asia/Jakarta days with point-earning activity,
 * ending today. The current day is allowed to be still in progress: if there is
 * no activity today yet, the streak is anchored on yesterday so a not-yet-active
 * "today" does not reset a live streak. Merely refreshing a page never changes
 * this because it is derived entirely from persisted award days.
 */
export function computeStreak(awardDays: readonly string[], today: string): number {
  const days = new Set(awardDays);
  let cursor = today;
  if (!days.has(cursor)) {
    cursor = addDays(today, -1);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface AchievementFacts {
  classifiedScans: number;
  verifiedReports: number;
  streakDays: number;
}

/** Whether an achievement's criteria currently hold (PRD §7). */
export function isAchievementEligible(id: AchievementId, facts: AchievementFacts): boolean {
  switch (id) {
    case 'first_scan':
      return facts.classifiedScans >= 1;
    case 'scanner_10':
      return facts.classifiedScans >= 10;
    case 'first_verified_report':
      return facts.verifiedReports >= 1;
    case 'streak_3':
      return facts.streakDays >= 3;
  }
}

/** Encode/decode the leaderboard keyset cursor as `${ecoPoints}:${userId}`. */
export function encodeLeaderboardCursor(entry: { ecoPoints: number; userId: string }): string {
  return `${entry.ecoPoints}:${entry.userId}`;
}

export interface LeaderboardCursor {
  ecoPoints: number;
  userId: string;
}

const CURSOR_RE = /^(-?\d+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function decodeLeaderboardCursor(raw: string): LeaderboardCursor | null {
  const match = CURSOR_RE.exec(raw);
  if (!match) return null;
  return { ecoPoints: Number(match[1]), userId: match[2]! };
}

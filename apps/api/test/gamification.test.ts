import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { GamificationService } from '../src/gamification/gamification.service.js';
import {
  computeStreak,
  decodeLeaderboardCursor,
  isAchievementEligible,
  type StatsFacts,
} from '../src/gamification/gamification.types.js';
import type {
  AchievementDefinitionRow,
  UserAchievementRow,
} from '../src/gamification/achievement.repository.js';
import type { LeaderboardEntryView } from '../src/gamification/gamification.types.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const DEFINITIONS: AchievementDefinitionRow[] = [
  { id: 'first_scan', name: 'Scan Pertama', description: 'Menyelesaikan scan pertama.' },
  { id: 'scanner_10', name: 'Rajin Memindai', description: 'Menyelesaikan 10 scan.' },
  { id: 'first_verified_report', name: 'Laporan Terverifikasi', description: 'Laporan pertama diverifikasi.' },
  { id: 'streak_3', name: 'Konsisten 3 Hari', description: 'Tiga hari berturut-turut.' },
];

const NOW = Date.parse('2026-09-25T05:00:00Z'); // 12:00 Asia/Jakarta -> today = 2026-09-25

function baseFacts(over: Partial<StatsFacts> = {}): StatsFacts {
  return {
    totalScans: 0,
    classifiedScans: 0,
    ecoPoints: 0,
    verifiedReports: 0,
    resolvedReports: 0,
    categoryCounts: [],
    awardDays: [],
    ...over,
  };
}

interface AchievementCalls {
  unlocked: string[];
  revoked: string[];
}

function makeService(opts: {
  facts?: StatsFacts;
  userAchievements?: UserAchievementRow[];
  leaderboardRows?: LeaderboardEntryView[];
}): { service: GamificationService; calls: AchievementCalls } {
  const calls: AchievementCalls = { unlocked: [], revoked: [] };
  const stats = { loadFacts: async () => opts.facts ?? baseFacts() };
  const achievements = {
    listDefinitions: async () => DEFINITIONS,
    listForUser: async () => opts.userAchievements ?? [],
    unlock: async (_u: string, id: string) => {
      calls.unlocked.push(id);
      return new Date('2026-09-25T00:00:00.000Z');
    },
    revoke: async (_u: string, id: string) => {
      calls.revoked.push(id);
      return new Date('2026-09-25T00:00:00.000Z');
    },
  };
  const leaderboard = { page: async (limit: number) => (opts.leaderboardRows ?? []).slice(0, limit) };
  const service = new GamificationService(stats as never, achievements as never, leaderboard as never);
  return { service, calls };
}

test('computeStreak counts consecutive Jakarta days ending today', () => {
  assert.equal(computeStreak(['2026-09-23', '2026-09-24', '2026-09-25'], '2026-09-25'), 3);
});

test('computeStreak allows an inactive current day by anchoring on yesterday', () => {
  assert.equal(computeStreak(['2026-09-23', '2026-09-24'], '2026-09-25'), 2);
});

test('computeStreak stops at the first gap and is 0 when stale', () => {
  assert.equal(computeStreak(['2026-09-20', '2026-09-24', '2026-09-25'], '2026-09-25'), 2);
  assert.equal(computeStreak(['2026-09-01'], '2026-09-25'), 0);
  assert.equal(computeStreak([], '2026-09-25'), 0);
});

test('isAchievementEligible follows PRD thresholds', () => {
  assert.equal(isAchievementEligible('first_scan', { classifiedScans: 1, verifiedReports: 0, streakDays: 0 }), true);
  assert.equal(isAchievementEligible('scanner_10', { classifiedScans: 9, verifiedReports: 0, streakDays: 0 }), false);
  assert.equal(isAchievementEligible('scanner_10', { classifiedScans: 10, verifiedReports: 0, streakDays: 0 }), true);
  assert.equal(isAchievementEligible('first_verified_report', { classifiedScans: 0, verifiedReports: 1, streakDays: 0 }), true);
  assert.equal(isAchievementEligible('streak_3', { classifiedScans: 0, verifiedReports: 0, streakDays: 3 }), true);
});

test('getStats maps facts and derives the streak', async () => {
  const { service } = makeService({
    facts: baseFacts({
      totalScans: 12,
      classifiedScans: 11,
      ecoPoints: -5,
      verifiedReports: 2,
      resolvedReports: 1,
      categoryCounts: [{ categoryId: 'plastic', count: 4 }],
      awardDays: ['2026-09-24', '2026-09-25'],
    }),
  });
  const stats = await service.getStats('u1', NOW);
  assert.equal(stats.totalScans, 12);
  assert.equal(stats.classifiedScans, 11);
  assert.equal(stats.ecoPoints, -5, 'net points may be negative');
  assert.equal(stats.streakDays, 2);
  assert.equal(stats.verifiedReports, 2);
  assert.equal(stats.resolvedReports, 1);
  assert.deepEqual(stats.categoryCounts, [{ categoryId: 'plastic', count: 4 }]);
});

test('getAchievements unlocks newly-earned badges and lists all four', async () => {
  const { service, calls } = makeService({
    facts: baseFacts({ classifiedScans: 1, awardDays: [] }),
  });
  const page = await service.getAchievements('u1', NOW);
  assert.equal(page.nextCursor, null);
  assert.equal(page.items.length, 4);
  assert.deepEqual(calls.unlocked, ['first_scan']);
  const firstScan = page.items.find((i) => i.id === 'first_scan')!;
  assert.ok(firstScan.unlockedAt !== null);
  assert.equal(firstScan.revokedAt, null);
  const scanner10 = page.items.find((i) => i.id === 'scanner_10')!;
  assert.equal(scanner10.unlockedAt, null, 'a locked badge reports null timestamps');
});

test('getAchievements revokes a held badge whose criteria no longer hold', async () => {
  const { service, calls } = makeService({
    facts: baseFacts({ classifiedScans: 0 }),
    userAchievements: [
      { achievementId: 'first_scan', unlockedAt: new Date('2026-09-20T00:00:00.000Z'), revokedAt: null },
    ],
  });
  const page = await service.getAchievements('u1', NOW);
  assert.deepEqual(calls.revoked, ['first_scan']);
  const firstScan = page.items.find((i) => i.id === 'first_scan')!;
  assert.ok(firstScan.revokedAt !== null);
});

test('getAchievements leaves an already-correct badge untouched', async () => {
  const { service, calls } = makeService({
    facts: baseFacts({ classifiedScans: 1 }),
    userAchievements: [
      { achievementId: 'first_scan', unlockedAt: new Date('2026-09-20T00:00:00.000Z'), revokedAt: null },
    ],
  });
  await service.getAchievements('u1', NOW);
  assert.deepEqual(calls.unlocked, []);
  assert.deepEqual(calls.revoked, []);
});

test('getLeaderboard sets nextCursor only when another page exists', async () => {
  const rows: LeaderboardEntryView[] = [
    { rank: 1, userId: '11111111-1111-1111-1111-111111111111', displayName: 'A', ecoPoints: 30 },
    { rank: 2, userId: '22222222-2222-2222-2222-222222222222', displayName: 'B', ecoPoints: 20 },
    { rank: 3, userId: '33333333-3333-3333-3333-333333333333', displayName: 'C', ecoPoints: 10 },
  ];
  const withMore = makeService({ leaderboardRows: rows });
  const page = await withMore.service.getLeaderboard(2, undefined);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, '20:22222222-2222-2222-2222-222222222222');

  const exact = makeService({ leaderboardRows: rows.slice(0, 2) });
  const page2 = await exact.service.getLeaderboard(2, undefined);
  assert.equal(page2.items.length, 2);
  assert.equal(page2.nextCursor, null);
});

test('getLeaderboard rejects a malformed cursor with VALIDATION_ERROR', async () => {
  const { service } = makeService({});
  await assert.rejects(service.getLeaderboard(20, 'not-a-cursor'), (e) => errorCode(e) === 'VALIDATION_ERROR');
});

test('decodeLeaderboardCursor round-trips a valid cursor and rejects junk', () => {
  const c = decodeLeaderboardCursor('20:22222222-2222-2222-2222-222222222222');
  assert.deepEqual(c, { ecoPoints: 20, userId: '22222222-2222-2222-2222-222222222222' });
  assert.equal(decodeLeaderboardCursor('nope'), null);
  const neg = decodeLeaderboardCursor('-5:22222222-2222-2222-2222-222222222222');
  assert.equal(neg?.ecoPoints, -5, 'negative net points are a valid cursor');
});

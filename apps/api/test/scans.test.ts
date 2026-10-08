import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { ScansService } from '../src/scans/scans.service.js';
import { ScanRepository } from '../src/scans/scan.repository.js';
import { IdempotencyStore } from '../src/infrastructure/idempotency.store.js';
import type { ScanRecord, ScanView } from '../src/scans/scan.types.js';
import { toScanView } from '../src/scans/scan.types.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const KEY = '11111111-1111-1111-1111-111111111111';

function record(id: string, createdAt: string, status: ScanRecord['status'] = 'queued'): ScanRecord {
  return {
    id,
    status,
    outcome: null,
    categoryId: null,
    predictions: null,
    errorCode: null,
    pointsAwarded: 0,
    createdAt: new Date(createdAt),
    finishedAt: null,
  };
}

interface Stub {
  service: ScansService;
}

function makeService(opts: { ownedMedia?: boolean; replayed?: boolean; replayStatus?: ScanRecord['status']; listRows?: ScanRecord[]; recentCount?: number } = {}): Stub {
  const media = {
    findStoredForOwner: async (_id: string, _owner: string) =>
      opts.ownedMedia === false ? null : { id: 'm1', ownerId: 'u1' },
  };
  const scans = {
    createQueuedIdempotent: async (input: { toView: (r: ScanRecord) => ScanView; beforeCreate?: (tx: never) => Promise<void> }) => {
      if (!opts.replayed) {
        const tx = Object.assign(async () => [], { unsafe: (value: string) => value, json: (value: unknown) => value }) as never;
        await input.beforeCreate?.(tx);
      }
      const view = input.toView(record('scan-1', '2026-09-25T00:00:00.000Z'));
      return { view, replayed: opts.replayed ?? false };
    },
    findByIdForOwner: async (id: string) => (id === 'scan-1' ? record('scan-1', '2026-09-25T00:00:00.000Z', opts.replayStatus ?? 'queued') : null),
    listByOwner: async (_u: string, limit: number) => (opts.listRows ?? []).slice(0, limit),
    countRecentForUser: async (_u: string, _since: Date) => ({
      count: opts.recentCount ?? 0,
      oldestAt: opts.recentCount ? new Date(Date.now() - 30 * 60 * 1_000) : null,
    }),
  };
  const service = new ScansService(scans as never, media as never);
  return { service };
}

test('createScan rejects media the caller does not own with NOT_FOUND', async () => {
  const { service } = makeService({ ownedMedia: false });
  await assert.rejects(service.createScan('u1', { mediaId: 'm1' }, KEY), (e) => errorCode(e) === 'NOT_FOUND');
});

test('createScan enforces the per-account rate limit with RATE_LIMITED', async () => {
  const { service } = makeService({ recentCount: 10 });
  await assert.rejects(service.createScan('u1', { mediaId: 'm1' }, KEY), (e) => errorCode(e) === 'RATE_LIMITED');
});

test('createScan returns the durable queued resource without waiting for Redis', async () => {
  const { service } = makeService({ replayed: false });
  const view = await service.createScan('u1', { mediaId: 'm1' }, KEY);
  assert.equal(view.status, 'queued');
  assert.equal(view.pointsAwarded, 0);
  assert.deepEqual(view.predictions, []);
  assert.equal(view.completedAt, null);
  assert.equal(view.status, 'queued', 'outbox relay delivers the durable event asynchronously');
});

test('createScan idempotent replay remains available when the outbox relay has not run', async () => {
  const { service } = makeService({ replayed: true, recentCount: 10 });
  const view = await service.createScan('u1', { mediaId: 'm1' }, KEY);
  assert.equal(view.status, 'queued', 'the original accepted response is replayed independent of queue state');
});

test('createScan replay does not require a queue dependency', async () => {
  const { service } = makeService({ replayed: true, replayStatus: 'processing' });
  const view = await service.createScan('u1', { mediaId: 'm1' }, KEY);
  assert.equal(view.id, 'scan-1');
});

test('scan, idempotency response, and delivery outbox are written in one DB transaction', async () => {
  const statements: string[] = [];
  let committed = false;
  let failResponseWrite = false;
  const tx = Object.assign(
    async (parts: TemplateStringsArray, ..._values: unknown[]) => {
      const statement = parts.join('?');
      statements.push(statement);
      if (/INSERT INTO idempotency_keys/i.test(statement)) return [{ key: KEY }];
      if (/INSERT INTO scans/i.test(statement)) {
        return [{
          id: 'scan-atomic', media_id: 'media-1', status: 'queued', outcome: null,
          category_id: null, predictions: null, error_code: null, points_awarded: 0,
          created_at: new Date('2026-10-04T00:00:00.000Z'), finished_at: null,
        }];
      }
      if (/UPDATE idempotency_keys[\s\S]*SET status_code/i.test(statement) && failResponseWrite) {
        throw new Error('injected response persistence failure');
      }
      return [];
    },
    { unsafe: (sql: string) => sql, json: (value: unknown) => value },
  );
  const sql = Object.assign(
    async () => [],
    {
      begin: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        try {
          const result = await callback(tx);
          committed = true;
          return result;
        } catch (error) {
          committed = false;
          throw error;
        }
      },
      unsafe: (value: string) => value,
      json: (value: unknown) => value,
    },
  );
  const repo = new ScanRepository(sql as never, new IdempotencyStore(sql as never));
  const input = {
    userId: 'user-1', mediaId: 'media-1', actorScope: 'user:user-1', route: 'POST /scans',
    key: KEY, requestHash: 'hash', toView: toScanView,
  };
  const first = await repo.createQueuedIdempotent(input);
  assert.equal(first.view.id, 'scan-atomic');
  assert.equal(committed, true);
  assert.ok(statements.some(statement => /INSERT INTO scans/i.test(statement)));
  assert.ok(statements.some(statement => /INSERT INTO scan_outbox/i.test(statement)));
  assert.ok(statements.some(statement => /UPDATE idempotency_keys/i.test(statement)));

  committed = false;
  failResponseWrite = true;
  await assert.rejects(repo.createQueuedIdempotent(input), /injected response persistence failure/);
  assert.equal(committed, false, 'a failed idempotency response write rolls back the outbox with the scan');
});

test('getScan returns NOT_FOUND for an unknown scan', async () => {
  const { service } = makeService();
  await assert.rejects(service.getScan('u1', 'nope'), (e) => errorCode(e) === 'NOT_FOUND');
});

test('listScans reports nextCursor only when another page exists', async () => {
  const rows = Array.from({ length: 3 }, (_, i) => record(`s${i}`, `2026-09-2${i}T00:00:00.000Z`));
  const withMore = makeService({ listRows: rows });
  // limit 2 -> service asks repo for 3 (limit+1); repo returns 3 -> nextCursor set
  const page = await withMore.service.listScans('u1', 2, undefined);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, 's1');

  const exact = makeService({ listRows: rows.slice(0, 2) });
  const page2 = await exact.service.listScans('u1', 2, undefined);
  assert.equal(page2.items.length, 2);
  assert.equal(page2.nextCursor, null);
});

test('toScanView clamps predictions to three items', () => {
  const view = toScanView({
    ...record('x', '2026-09-25T00:00:00.000Z'),
    status: 'succeeded',
    outcome: 'classified',
    categoryId: 'plastic',
    predictions: [
      { categoryId: 'plastic', score: 0.9 },
      { categoryId: 'glass', score: 0.05 },
      { categoryId: 'paper', score: 0.03 },
      { categoryId: 'metal', score: 0.02 },
    ],
    pointsAwarded: 10,
  });
  assert.equal(view.predictions.length, 3);
});

test('scan award reason distinguishes awarded, capped, duplicate, and unexplained zero points', () => {
  const base: ScanRecord = { ...record('scan', '2026-10-07T00:00:00Z', 'succeeded'), outcome: 'classified' };
  assert.equal(toScanView({ ...base, pointsAwarded: 10, pointsReason: 'daily_limit' }).pointsReason, 'awarded');
  assert.equal(toScanView({ ...base, pointsReason: 'daily_limit' }).pointsReason, 'daily_limit');
  assert.equal(toScanView({ ...base, pointsReason: 'duplicate_image' }).pointsReason, 'duplicate_image');
  assert.equal(toScanView(base).pointsReason, 'unknown');
  for (const outcome of ['unknown', 'no_waste'] as const) {
    assert.equal(toScanView({ ...base, outcome }).pointsReason, 'not_classified');
  }
  assert.equal(toScanView({ ...base, status: 'processing' }).pointsReason, 'pending');
  assert.equal(toScanView({ ...base, status: 'failed' }).pointsReason, 'failed');
});

test('detail and both history pagination paths use ledger awards and durable reasons', async () => {
  const statements: string[] = [];
  const sql = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
    statements.push(query);
    return [{
      id: 'scan', media_id: 'media', status: 'succeeded', outcome: 'classified', category_id: 'plastic',
      predictions: [], error_code: null, points_awarded: 10, ledger_points: 0, points_reason: 'unknown',
      created_at: new Date('2026-10-07T00:00:00Z'), finished_at: new Date('2026-10-07T01:00:00Z'),
    }];
  }, { unsafe: (value: string) => value });
  const repo = new ScanRepository(sql as never, {} as never);
  const detail = await repo.findByIdForOwner('scan', 'user');
  assert.equal(detail?.pointsAwarded, 0, 'a cached scan value must not invent a missing ledger award');
  assert.equal(detail?.pointsReason, 'unknown');
  await repo.listByOwner('user', 20, null);
  await repo.listByOwner('user', 20, 'cursor');
  assert.equal(statements.length, 3);
  for (const query of statements) {
    assert.match(query, /AS ledger_points/);
    assert.match(query, /d.awarded_scan_id = scans.id/);
    assert.match(query, /p.activity_day = d.activity_day/);
    assert.match(query, /p.reason = 'scan_classified'/);
    assert.doesNotMatch(query, /user_daily_activity/);
  }
});

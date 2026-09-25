import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { ScansService } from '../src/scans/scans.service.js';
import type { ScanRecord, ScanView } from '../src/scans/scan.types.js';
import { toScanView } from '../src/scans/scan.types.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const KEY = '11111111-1111-1111-1111-111111111111';

function record(id: string, createdAt: string): ScanRecord {
  return {
    id,
    status: 'queued',
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
  enqueued: string[];
  created: number;
}

function makeService(opts: { ownedMedia?: boolean; replayed?: boolean; listRows?: ScanRecord[] } = {}): Stub {
  const enqueued: string[] = [];
  let created = 0;
  const media = {
    findStoredForOwner: async (_id: string, _owner: string) =>
      opts.ownedMedia === false ? null : { id: 'm1', ownerId: 'u1' },
  };
  const scans = {
    createQueuedIdempotent: async (input: { toView: (r: ScanRecord) => ScanView }) => {
      created += 1;
      const view = input.toView(record('scan-1', '2026-09-25T00:00:00.000Z'));
      return { view, replayed: opts.replayed ?? false };
    },
    findByIdForOwner: async (id: string) => (id === 'scan-1' ? record('scan-1', '2026-09-25T00:00:00.000Z') : null),
    listByOwner: async (_u: string, limit: number) => (opts.listRows ?? []).slice(0, limit),
  };
  const queue = { enqueueScan: async (id: string) => void enqueued.push(id) };
  const service = new ScansService(scans as never, media as never, queue as never);
  return { service, enqueued, created };
}

test('createScan rejects media the caller does not own with NOT_FOUND', async () => {
  const { service } = makeService({ ownedMedia: false });
  await assert.rejects(service.createScan('u1', { mediaId: 'm1' }, KEY), (e) => errorCode(e) === 'NOT_FOUND');
});

test('createScan enqueues a job for a fresh reservation', async () => {
  const { service, enqueued } = makeService({ replayed: false });
  const view = await service.createScan('u1', { mediaId: 'm1' }, KEY);
  assert.equal(view.status, 'queued');
  assert.equal(view.pointsAwarded, 0);
  assert.deepEqual(view.predictions, []);
  assert.equal(view.completedAt, null);
  assert.deepEqual(enqueued, ['scan-1']);
});

test('createScan does not enqueue again on an idempotent replay', async () => {
  const { service, enqueued } = makeService({ replayed: true });
  await service.createScan('u1', { mediaId: 'm1' }, KEY);
  assert.deepEqual(enqueued, [], 'a replayed create must not double-queue');
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

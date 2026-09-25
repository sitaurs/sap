import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeletionProcessor } from '../src/deletion-processor.js';
import type { DeletionOutboxEvent, MaintenanceRepository, SweepResult } from '../src/maintenance-repository.js';
import { drainOneDeletion, runSweep } from '../src/maintenance-runner.js';
import type { ObjectStore } from '../src/object-store.js';

interface RelayCalls {
  processed: Array<{ deletionId: string; subjectHash: string }>;
  delivered: string[];
  failed: Array<{ deletionId: string; code: string }>;
  retried: Array<{ outboxId: string; delayMs: number }>;
}

function relayHarness(event: DeletionOutboxEvent | null, opts: { processThrows?: boolean } = {}) {
  const calls: RelayCalls = { processed: [], delivered: [], failed: [], retried: [] };
  const repo = {
    claimDeletionEvent: async () => event,
    markOutboxDelivered: async (id: string) => {
      calls.delivered.push(id);
    },
    markDeletionFailed: async (deletionId: string, code: string) => {
      calls.failed.push({ deletionId, code });
    },
    markOutboxRetry: async (outboxId: string, delayMs: number) => {
      calls.retried.push({ outboxId, delayMs });
    },
  } as unknown as MaintenanceRepository;
  const processor = {
    process: async (deletionId: string, subjectHash: string) => {
      calls.processed.push({ deletionId, subjectHash });
      if (opts.processThrows) throw new Error('boom');
    },
  } as unknown as DeletionProcessor;
  return { repo, processor, calls };
}

const event: DeletionOutboxEvent = { outboxId: 'out-1', deletionId: 'del-1', subjectHash: 'hash-1' };

test('drainOneDeletion processes and marks the event delivered', async () => {
  const { repo, processor, calls } = relayHarness(event);
  const handled = await drainOneDeletion(repo, processor);
  assert.equal(handled, true);
  assert.deepEqual(calls.processed, [{ deletionId: 'del-1', subjectHash: 'hash-1' }]);
  assert.deepEqual(calls.delivered, ['out-1']);
  assert.equal(calls.failed.length, 0);
});

test('drainOneDeletion returns false when the queue is empty', async () => {
  const { repo, processor, calls } = relayHarness(null);
  const handled = await drainOneDeletion(repo, processor);
  assert.equal(handled, false);
  assert.equal(calls.processed.length, 0);
  assert.equal(calls.delivered.length, 0);
});

test('drainOneDeletion marks failed and re-queues on processor error', async () => {
  const { repo, processor, calls } = relayHarness(event, { processThrows: true });
  const handled = await drainOneDeletion(repo, processor);
  assert.equal(handled, true);
  assert.deepEqual(calls.delivered, [], 'must not deliver a failed job');
  assert.deepEqual(calls.failed, [{ deletionId: 'del-1', code: 'DELETION_FAILED' }]);
  assert.equal(calls.retried.length, 1);
  assert.equal(calls.retried[0]!.outboxId, 'out-1');
});

test('runSweep deletes orphan R2 objects before sweeping rows', async () => {
  const order: string[] = [];
  const sweepResult: SweepResult = { orphanMedia: 1, idempotencyKeys: 2, areaSnapshots: 0, tombstones: 1 };
  const repo = {
    listOrphanMediaKeys: async () => [
      { id: 'm1', objectKey: 'scan/orphan-1.jpg' },
      { id: 'm2', objectKey: 'scan/orphan-2.jpg' },
    ],
    sweepExpired: async () => {
      order.push('sweep');
      return sweepResult;
    },
  } as unknown as MaintenanceRepository;
  const store = {
    deleteObject: async (key: string) => {
      order.push(`delete:${key}`);
    },
  } as unknown as ObjectStore;
  const result = await runSweep(repo, store);
  assert.deepEqual(order, ['delete:scan/orphan-1.jpg', 'delete:scan/orphan-2.jpg', 'sweep']);
  assert.deepEqual(result, sweepResult);
});

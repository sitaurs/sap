import assert from 'node:assert/strict';
import test from 'node:test';
import { DeletionProcessor } from '../src/deletion-processor.js';
import type { DeletionJob, MaintenanceRepository } from '../src/maintenance-repository.js';
import type { ObjectStore } from '../src/object-store.js';

interface Calls {
  running: string[];
  deleted: string[];
  finalized: Array<{ deletionId: string; userId: string | null; subjectHash: string }>;
}

function harness(
  job: DeletionJob | null,
  opts: { keys?: string[]; deleteThrows?: boolean } = {},
) {
  const calls: Calls = { running: [], deleted: [], finalized: [] };
  const repo = {
    loadDeletionJob: async () => job,
    markDeletionRunning: async (id: string) => {
      calls.running.push(id);
    },
    listUserObjectKeys: async () => opts.keys ?? [],
    finalizeDeletion: async (deletionId: string, userId: string | null, subjectHash: string) => {
      calls.finalized.push({ deletionId, userId, subjectHash });
    },
  } as unknown as MaintenanceRepository;
  const store = {
    deleteObject: async (key: string) => {
      if (opts.deleteThrows) throw new Error('r2 down');
      calls.deleted.push(key);
    },
  } as unknown as ObjectStore;
  return { processor: new DeletionProcessor(repo, store), calls };
}

const job: DeletionJob = {
  deletionId: 'del-1',
  userId: 'user-1',
  subjectHash: 'hash-1',
  status: 'queued',
};

test('DeletionProcessor deletes R2 objects before finalizing', async () => {
  const { processor, calls } = harness(job, { keys: ['scan/user-1/a.jpg', 'report/user-1/b.jpg'] });
  await processor.process('del-1', 'hash-1');
  assert.deepEqual(calls.running, ['del-1']);
  assert.deepEqual(calls.deleted, ['scan/user-1/a.jpg', 'report/user-1/b.jpg']);
  assert.deepEqual(calls.finalized, [{ deletionId: 'del-1', userId: 'user-1', subjectHash: 'hash-1' }]);
});

test('DeletionProcessor is idempotent for an already-completed request', async () => {
  const { processor, calls } = harness({ ...job, status: 'completed' }, { keys: ['scan/x.jpg'] });
  await processor.process('del-1', 'hash-1');
  assert.deepEqual(calls.running, []);
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.finalized, []);
});

test('DeletionProcessor ignores an unknown deletion id', async () => {
  const { processor, calls } = harness(null);
  await processor.process('missing', 'hash-1');
  assert.equal(calls.running.length, 0);
  assert.equal(calls.finalized.length, 0);
});

test('DeletionProcessor does not finalize when an R2 delete fails', async () => {
  const { processor, calls } = harness(job, { keys: ['scan/user-1/a.jpg'], deleteThrows: true });
  await assert.rejects(processor.process('del-1', 'hash-1'));
  assert.deepEqual(calls.running, ['del-1']);
  assert.equal(calls.finalized.length, 0, 'row must not be pseudonymised while bytes remain');
});

test('DeletionProcessor handles a null-user request (already scrubbed) without R2 calls', async () => {
  const { processor, calls } = harness({ ...job, userId: null });
  await processor.process('del-1', 'hash-1');
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.finalized, [{ deletionId: 'del-1', userId: null, subjectHash: 'hash-1' }]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { drainScanOutboxOnce } from '../src/scan-outbox-relay.js';
import type { ScanDelivery } from '../src/scan-repository.js';

function relayHarness(options: { generation?: number; scanStatus?: ScanDelivery['scanStatus'] } = {}) {
  let generation = options.generation ?? 0;
  let scanStatus = options.scanStatus ?? 'queued';
  let available = true;
  const released: ScanDelivery[] = [];
  const enqueued: ScanDelivery[] = [];
  const advanced: Array<[ScanDelivery, ScanDelivery]> = [];
  const jobIds: string[] = [];
  const logs: string[] = [];
  const jobs = new Map<string, string>();
  const repo = {
    claimOutboxBatch: async () => {
      if (!available) return [];
      available = false;
      if (generation === 0) generation = 1;
      return [{ scanId: 'scan-1', generation, scanStatus }];
    },
    markOutboxEnqueued: async (delivery: ScanDelivery) => { enqueued.push(delivery); },
    advanceOutboxGeneration: async (delivery: ScanDelivery) => {
      if (delivery.generation !== generation || available) return null;
      const replacement = { ...delivery, generation: ++generation };
      advanced.push([delivery, replacement]);
      return replacement;
    },
    releaseOutbox: async (delivery: ScanDelivery) => {
      released.push(delivery);
      available = true;
    },
    makeDeliveryAvailableAgain: () => { available = true; },
    setScanStatus: (status: ScanDelivery['scanStatus']) => { scanStatus = status; },
  };
  const queue = {
    getJob: async (id: string) => {
      const state = jobs.get(id);
      return state === undefined ? undefined : { getState: async () => state };
    },
    add: async (_name: string, _data: { scanId: string }, opts: { jobId: string }) => {
      jobIds.push(opts.jobId);
      jobs.set(opts.jobId, 'waiting');
    },
    setJobState: (id: string, state: string) => { jobs.set(id, state); },
    hasJob: (id: string) => jobs.has(id),
  };
  const logger = { error: (message: string) => { logs.push(message); } };
  return { repo, queue, logger, released, enqueued, advanced, jobIds, logs };
}

test('queue failure with no accepted job releases and retries the same deterministic id', async () => {
  const h = relayHarness();
  let firstAttempt = true;
  const flakyQueue = {
    getJob: h.queue.getJob,
    add: async (name: string, data: { scanId: string }, options: { jobId: string }) => {
      if (firstAttempt) {
        firstAttempt = false;
        throw new Error('Redis unavailable');
      }
      return h.queue.add(name, data, options);
    },
  };

  assert.equal(await drainScanOutboxOnce(h.repo, flakyQueue, h.logger), 1);
  assert.deepEqual(h.released, [{ scanId: 'scan-1', generation: 1, scanStatus: 'queued' }]);
  assert.deepEqual(h.enqueued, []);
  assert.deepEqual(h.logs, ['scan_outbox_enqueue_error']);

  assert.equal(await drainScanOutboxOnce(h.repo, flakyQueue, h.logger), 1);
  assert.deepEqual(h.enqueued, [{ scanId: 'scan-1', generation: 1, scanStatus: 'queued' }]);
  assert.deepEqual(h.jobIds, ['scan-scan-1-1']);
});

test('queued job waiting longer than the lease is deferred without duplicate Bull jobs or generation churn', async () => {
  const h = relayHarness({ generation: 1 });
  h.queue.setJobState('scan-scan-1-1', 'waiting');

  // Each pass represents an outbox check after the live-job poll lease expired.
  for (let i = 0; i < 6; i += 1) {
    h.repo.makeDeliveryAvailableAgain();
    assert.equal(await drainScanOutboxOnce(h.repo, h.queue, h.logger), 1);
  }

  assert.deepEqual(h.jobIds, []);
  assert.equal(h.advanced.length, 0);
  assert.equal(h.enqueued.length, 6);
});

test('ambiguous enqueue then crash before marking is recovered by finding the existing waiting job', async () => {
  const h = relayHarness();
  let failMarkOnce = true;
  const repo = {
    ...h.repo,
    markOutboxEnqueued: async (delivery: ScanDelivery) => {
      if (failMarkOnce) {
        failMarkOnce = false;
        throw new Error('process died before outbox mark');
      }
      return h.repo.markOutboxEnqueued(delivery);
    },
  };

  await drainScanOutboxOnce(repo, h.queue, h.logger);
  assert.deepEqual(h.jobIds, ['scan-scan-1-1']);
  assert.deepEqual(h.released, [{ scanId: 'scan-1', generation: 1, scanStatus: 'queued' }]);

  await drainScanOutboxOnce(repo, h.queue, h.logger);
  assert.deepEqual(h.jobIds, ['scan-scan-1-1']);
  assert.deepEqual(h.enqueued, [{ scanId: 'scan-1', generation: 1, scanStatus: 'queued' }]);
});

test('failed Bull job advances generation before replay so retained failed id cannot block delivery', async () => {
  const h = relayHarness({ generation: 1 });
  h.queue.setJobState('scan-scan-1-1', 'failed');
  h.repo.makeDeliveryAvailableAgain();

  await drainScanOutboxOnce(h.repo, h.queue, h.logger);

  assert.deepEqual(h.advanced, [[
    { scanId: 'scan-1', generation: 1, scanStatus: 'queued' },
    { scanId: 'scan-1', generation: 2, scanStatus: 'queued' },
  ]]);
  assert.deepEqual(h.jobIds, ['scan-scan-1-2']);
  assert.deepEqual(h.enqueued, [{ scanId: 'scan-1', generation: 2, scanStatus: 'queued' }]);
});

test('expired active job for a processing scan is fenced and replaced', async () => {
  const h = relayHarness({ generation: 4, scanStatus: 'processing' });
  h.queue.setJobState('scan-scan-1-4', 'active');
  h.repo.makeDeliveryAvailableAgain();

  await drainScanOutboxOnce(h.repo, h.queue, h.logger);

  assert.deepEqual(h.jobIds, ['scan-scan-1-5']);
  assert.deepEqual(h.advanced.map(([, replacement]) => replacement.generation), [5]);
  assert.deepEqual(h.enqueued, [{ scanId: 'scan-1', generation: 5, scanStatus: 'processing' }]);
});

test('missing expired job is re-added with its current generation', async () => {
  const h = relayHarness({ generation: 3 });
  h.repo.makeDeliveryAvailableAgain();

  await drainScanOutboxOnce(h.repo, h.queue, h.logger);

  assert.deepEqual(h.jobIds, ['scan-scan-1-3']);
  assert.equal(h.advanced.length, 0);
});

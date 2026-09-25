import assert from 'node:assert/strict';
import test from 'node:test';
import { ScanProcessor } from '../src/scan-processor.js';
import { MlError, type AdapterResult, type MlAdapter } from '../src/ml-adapter.js';
import type { ObjectStore } from '../src/object-store.js';
import type { ScanContext, ScanRepository } from '../src/scan-repository.js';

interface Calls {
  markProcessing: string[];
  succeeded: Array<{ scanId: string; result: AdapterResult }>;
  failed: Array<{ scanId: string; code: string }>;
}

function harness(context: ScanContext | null, opts: { claim?: boolean; classify?: () => Promise<AdapterResult> } = {}) {
  const calls: Calls = { markProcessing: [], succeeded: [], failed: [] };
  const repo = {
    loadContext: async () => context,
    markProcessing: async (id: string) => {
      calls.markProcessing.push(id);
      return opts.claim ?? true;
    },
    completeSucceeded: async (scanId: string, _u: string, _s: string, result: AdapterResult) => {
      calls.succeeded.push({ scanId, result });
      return result.outcome === 'classified' ? 10 : 0;
    },
    completeFailed: async (scanId: string, code: string) => {
      calls.failed.push({ scanId, code });
    },
  } as unknown as ScanRepository;
  const store = { getObject: async () => Buffer.from('bytes') } as unknown as ObjectStore;
  const adapter = {
    classify:
      opts.classify ??
      (async () => ({ outcome: 'classified', categoryId: 'metal', predictions: [], providerRevision: null }) as AdapterResult),
  } as unknown as MlAdapter;
  return { processor: new ScanProcessor(repo, store, adapter), calls };
}

const baseContext: ScanContext = {
  scanId: 'scan-1',
  userId: 'user-1',
  status: 'queued',
  objectKey: 'scan/user-1/obj.jpg',
  sha256: 'a'.repeat(64),
  mediaState: 'stored',
};

test('ScanProcessor completes a queued scan successfully', async () => {
  const { processor, calls } = harness(baseContext);
  await processor.process('scan-1');
  assert.deepEqual(calls.markProcessing, ['scan-1']);
  assert.equal(calls.succeeded.length, 1);
  assert.equal(calls.succeeded[0]!.result.categoryId, 'metal');
  assert.equal(calls.failed.length, 0);
});

test('ScanProcessor ignores an already-terminal scan (late-result guard)', async () => {
  const { processor, calls } = harness({ ...baseContext, status: 'succeeded' });
  await processor.process('scan-1');
  assert.deepEqual(calls.markProcessing, []);
  assert.equal(calls.succeeded.length, 0);
  assert.equal(calls.failed.length, 0);
});

test('ScanProcessor fails a scan whose media is not stored', async () => {
  const { processor, calls } = harness({ ...baseContext, mediaState: 'pending' });
  await processor.process('scan-1');
  assert.deepEqual(calls.failed, [{ scanId: 'scan-1', code: 'MEDIA_INVALID' }]);
  assert.equal(calls.markProcessing.length, 0);
});

test('ScanProcessor does nothing when the job cannot be claimed', async () => {
  const { processor, calls } = harness(baseContext, { claim: false });
  await processor.process('scan-1');
  assert.deepEqual(calls.markProcessing, ['scan-1']);
  assert.equal(calls.succeeded.length, 0);
  assert.equal(calls.failed.length, 0);
});

test('ScanProcessor records the domain error code when the adapter throws', async () => {
  const { processor, calls } = harness(baseContext, {
    classify: async () => {
      throw new MlError('ML_TIMEOUT');
    },
  });
  await processor.process('scan-1');
  assert.deepEqual(calls.failed, [{ scanId: 'scan-1', code: 'ML_TIMEOUT' }]);
});

test('ScanProcessor ignores an unknown scan id', async () => {
  const { processor, calls } = harness(null);
  await processor.process('missing');
  assert.equal(calls.markProcessing.length, 0);
  assert.equal(calls.succeeded.length, 0);
  assert.equal(calls.failed.length, 0);
});

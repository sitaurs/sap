import assert from 'node:assert/strict';
import test from 'node:test';
import { ScanProcessor } from '../src/scan-processor.js';
import { MlError, type AdapterResult, type MlAdapter } from '../src/ml-adapter.js';
import type { ObjectStore } from '../src/object-store.js';
import type { ScanContext, ScanRepository } from '../src/scan-repository.js';
import type { ScanSettings } from '../src/hybrid.js';
import type { ScanSettingsRepository } from '../src/scan-settings-repository.js';
import type { VisionClient } from '../src/vision-client.js';
import type { MlPrediction } from '../src/ml-client.js';

interface Calls {
  markProcessing: string[];
  succeeded: Array<{ scanId: string; result: AdapterResult }>;
  failed: Array<{ scanId: string; code: string }>;
}

function harness(context: ScanContext | null, opts: { claim?: boolean; classify?: () => Promise<AdapterResult>; persistFailure?: Error } = {}) {
  const calls: Calls = { markProcessing: [], succeeded: [], failed: [] };
  const repo = {
    loadContext: async () => context,
    markProcessing: async (id: string) => {
      calls.markProcessing.push(id);
      return opts.claim === false ? null : 1;
    },
    completeSucceeded: async (scanId: string, _generation: number, _u: string, _s: string, result: AdapterResult) => {
      if (opts.persistFailure) throw opts.persistFailure;
      calls.succeeded.push({ scanId, result });
      return result.outcome === 'classified' ? 10 : 0;
    },
    completeFailed: async (scanId: string, _generation: number, code: string) => {
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
  assert.equal(calls.markProcessing.length, 1, 'terminal media failures must first obtain the fencing lease');
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

test('ScanProcessor lets result persistence errors escape for outbox recovery', async () => {
  const { processor, calls } = harness(baseContext, { persistFailure: new Error('database unavailable') });
  await assert.rejects(processor.process('scan-1'), /database unavailable/);
  assert.deepEqual(calls.failed, [], 'a database outage must not be mislabeled as an ML failure');
});

test('ScanProcessor ignores an unknown scan id', async () => {
  const { processor, calls } = harness(null);
  await processor.process('missing');
  assert.equal(calls.markProcessing.length, 0);
  assert.equal(calls.succeeded.length, 0);
  assert.equal(calls.failed.length, 0);
});

test('expired processing is reclaimed and stale worker is fenced without duplicate ledger award', async () => {
  let status = 'queued';
  let generation = 0;
  let leaseLive = true;
  const ledgerAwards: string[] = [];
  const completions: Array<{ generation: number; accepted: boolean }> = [];
  const repo = {
    loadContext: async () => ({ ...baseContext, status }),
    markProcessing: async () => {
      if (status === 'queued' || (status === 'processing' && !leaseLive)) {
        status = 'processing';
        leaseLive = true;
        generation += 1;
        return generation;
      }
      return null;
    },
    completeSucceeded: async (scanId: string, claimedGeneration: number, _userId: string, _sha256: string, result: AdapterResult) => {
      const accepted = status === 'processing' && leaseLive && claimedGeneration === generation;
      completions.push({ generation: claimedGeneration, accepted });
      if (!accepted) return { accepted: false, pointsAwarded: 0 };
      status = 'succeeded';
      if (result.outcome === 'classified') ledgerAwards.push(scanId);
      return { accepted: true, pointsAwarded: 10 };
    },
    completeFailed: async () => false,
  } as unknown as ScanRepository;
  let providerCalls = 0;
  let providerStarted!: () => void;
  const started = new Promise<void>(resolve => { providerStarted = resolve; });
  let finishFirst!: (result: AdapterResult) => void;
  const firstResult = new Promise<AdapterResult>(resolve => { finishFirst = resolve; });
  const adapter = {
    classify: async () => {
      providerCalls += 1;
      if (providerCalls === 1) {
        providerStarted();
        return firstResult;
      }
      return { outcome: 'classified', categoryId: 'metal', predictions: [], providerRevision: null } as AdapterResult;
    },
  } as unknown as MlAdapter;
  const store = { getObject: async () => Buffer.from('bytes') } as unknown as ObjectStore;
  const firstWorker = new ScanProcessor(repo, store, adapter);
  const secondWorker = new ScanProcessor(repo, store, adapter);

  const staleRun = firstWorker.process('scan-1');
  await started;
  leaseLive = false; // models provider/worker death beyond the persisted lease
  await secondWorker.process('scan-1'); // reclaims with generation 2 and commits once
  finishFirst({ outcome: 'classified', categoryId: 'plastic', predictions: [], providerRevision: null });
  await staleRun;
  await firstWorker.process('scan-1'); // terminal duplicate delivery is a no-op

  assert.equal(status, 'succeeded');
  assert.equal(generation, 2);
  assert.deepEqual(completions, [{ generation: 2, accepted: true }, { generation: 1, accepted: false }]);
  assert.deepEqual(ledgerAwards, ['scan-1']);
});

// --- Hybrid wiring (settings repo + vision client) -------------------------

function hybridHarness(opts: {
  settings: ScanSettings;
  mlResult?: AdapterResult;
  vision?: () => Promise<MlPrediction>;
}) {
  const calls: Calls = { markProcessing: [], succeeded: [], failed: [] };
  const repo = {
    loadContext: async () => baseContext,
    markProcessing: async (id: string) => { calls.markProcessing.push(id); return 1; },
    completeSucceeded: async (scanId: string, _generation: number, _u: string, _s: string, result: AdapterResult) => {
      calls.succeeded.push({ scanId, result });
      return result.outcome === 'classified' ? 10 : 0;
    },
    completeFailed: async (scanId: string, _generation: number, code: string) => { calls.failed.push({ scanId, code }); },
  } as unknown as ScanRepository;
  const store = { getObject: async () => Buffer.from('bytes') } as unknown as ObjectStore;
  const adapter = {
    classify: async () =>
      opts.mlResult ?? ({ outcome: 'unknown', categoryId: null, predictions: [], providerRevision: null } as AdapterResult),
  } as unknown as MlAdapter;
  let visionCalls = 0;
  const visionClient = {
    classify: async () => {
      visionCalls += 1;
      if (!opts.vision) throw new Error('unexpected vision call');
      return opts.vision();
    },
  } as unknown as VisionClient;
  const settingsRepo = { get: async () => opts.settings } as unknown as ScanSettingsRepository;
  return {
    processor: new ScanProcessor(repo, store, adapter, visionClient, settingsRepo),
    calls,
    visionCalls: () => visionCalls,
  };
}

test('ScanProcessor escalates a low-confidence ML result to the vision LLM', async () => {
  const h = hybridHarness({
    settings: { mode: 'unknown_plus_threshold', confidenceThreshold: 0.6, visionEnabled: true, visionModel: 'sapa' },
    mlResult: { outcome: 'classified', categoryId: 'metal', predictions: [{ categoryId: 'metal', score: 0.3 }], providerRevision: null },
    vision: async () => ({ label: 'plastic', confidences: [{ label: 'plastic', confidence: 0.88 }] }),
  });
  await h.processor.process('scan-1');
  assert.equal(h.visionCalls(), 1);
  assert.equal(h.calls.succeeded.length, 1);
  assert.equal(h.calls.succeeded[0]!.result.categoryId, 'plastic');
  assert.equal(h.calls.succeeded[0]!.result.providerRevision, 'llm:sapa');
});

test('ScanProcessor succeeds via ML fallback when the vision LLM fails (NFR1)', async () => {
  const h = hybridHarness({
    settings: { mode: 'unknown_only', confidenceThreshold: 0.6, visionEnabled: true, visionModel: 'sapa' },
    mlResult: { outcome: 'unknown', categoryId: null, predictions: [], providerRevision: null },
    vision: async () => { throw new Error('ML_TIMEOUT'); },
  });
  await h.processor.process('scan-1');
  assert.equal(h.calls.failed.length, 0, 'vision failure must never fail the scan');
  assert.equal(h.calls.succeeded.length, 1);
  assert.equal(h.calls.succeeded[0]!.result.outcome, 'unknown');
  assert.equal(h.calls.succeeded[0]!.result.providerRevision, 'llm_failed:sapa');
});

test('ScanProcessor skips vision for a confident ML result', async () => {
  const h = hybridHarness({
    settings: { mode: 'unknown_plus_threshold', confidenceThreshold: 0.6, visionEnabled: true, visionModel: 'sapa' },
    mlResult: { outcome: 'classified', categoryId: 'metal', predictions: [{ categoryId: 'metal', score: 0.95 }], providerRevision: null },
  });
  await h.processor.process('scan-1');
  assert.equal(h.visionCalls(), 0);
  assert.equal(h.calls.succeeded[0]!.result.categoryId, 'metal');
  assert.equal(h.calls.succeeded[0]!.result.providerRevision, null);
});

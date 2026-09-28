import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveClassification, shouldUseVision, type ScanSettings } from '../src/hybrid.js';
import type { AdapterResult } from '../src/ml-adapter.js';

const settings = (over: Partial<ScanSettings> = {}): ScanSettings => ({
  mode: 'unknown_plus_threshold',
  confidenceThreshold: 0.6,
  visionEnabled: true,
  visionModel: 'sapa',
  ...over,
});

const classified = (score: number): AdapterResult => ({
  outcome: 'classified',
  categoryId: 'metal',
  predictions: [{ categoryId: 'metal', score }],
  providerRevision: null,
});
const unknown: AdapterResult = { outcome: 'unknown', categoryId: null, predictions: [], providerRevision: null };
const visionAnswer: AdapterResult = {
  outcome: 'classified',
  categoryId: 'plastic',
  predictions: [{ categoryId: 'plastic', score: 0.82 }],
  providerRevision: null,
};

test('shouldUseVision: full_ml never escalates', () => {
  assert.equal(shouldUseVision(settings({ mode: 'full_ml' }), unknown), false);
  assert.equal(shouldUseVision(settings({ mode: 'full_ml' }), classified(0.1)), false);
});

test('shouldUseVision: full_llm returns false (handled before ML)', () => {
  assert.equal(shouldUseVision(settings({ mode: 'full_llm' }), unknown), false);
});

test('shouldUseVision: unknown_only escalates only on unknown', () => {
  const s = settings({ mode: 'unknown_only' });
  assert.equal(shouldUseVision(s, unknown), true);
  assert.equal(shouldUseVision(s, classified(0.1)), false);
  assert.equal(shouldUseVision(s, classified(0.99)), false);
});

test('shouldUseVision: unknown_plus_threshold escalates on unknown or low confidence', () => {
  const s = settings({ mode: 'unknown_plus_threshold', confidenceThreshold: 0.6 });
  assert.equal(shouldUseVision(s, unknown), true);
  assert.equal(shouldUseVision(s, classified(0.59)), true);
  assert.equal(shouldUseVision(s, classified(0.6)), false, 'at threshold is confident enough');
  assert.equal(shouldUseVision(s, classified(0.9)), false);
});

test('resolveClassification: full_ml ignores vision even when enabled', async () => {
  let visionCalls = 0;
  const result = await resolveClassification(
    settings({ mode: 'full_ml' }),
    async () => classified(0.2),
    async () => { visionCalls += 1; return visionAnswer; },
  );
  assert.equal(visionCalls, 0);
  assert.equal(result.categoryId, 'metal');
  assert.equal(result.providerRevision, null);
});

test('resolveClassification: full_llm with vision disabled falls back to ML', async () => {
  let visionCalls = 0;
  const result = await resolveClassification(
    settings({ mode: 'full_llm', visionEnabled: false }),
    async () => classified(0.9),
    async () => { visionCalls += 1; return visionAnswer; },
  );
  assert.equal(visionCalls, 0);
  assert.equal(result.categoryId, 'metal');
  assert.equal(result.providerRevision, null);
});

test('resolveClassification: full_llm uses vision and tags provider', async () => {
  let mlCalls = 0;
  const result = await resolveClassification(
    settings({ mode: 'full_llm', visionModel: 'sapa' }),
    async () => { mlCalls += 1; return classified(0.9); },
    async (model) => ({ ...visionAnswer, categoryId: model === 'sapa' ? 'plastic' : 'glass' }),
  );
  assert.equal(mlCalls, 0, 'ML is skipped entirely in full_llm');
  assert.equal(result.categoryId, 'plastic');
  assert.equal(result.providerRevision, 'llm:sapa');
});

test('resolveClassification: vision failure falls back to ML without failing the scan', async () => {
  const result = await resolveClassification(
    settings({ mode: 'full_llm' }),
    async () => classified(0.5),
    async () => { throw new Error('gateway down'); },
  );
  assert.equal(result.categoryId, 'metal');
  assert.equal(result.providerRevision, 'llm_failed:sapa');
});

test('resolveClassification: threshold mode escalates a low-confidence ML result', async () => {
  const result = await resolveClassification(
    settings({ mode: 'unknown_plus_threshold', confidenceThreshold: 0.6 }),
    async () => classified(0.3),
    async () => visionAnswer,
  );
  assert.equal(result.categoryId, 'plastic');
  assert.equal(result.providerRevision, 'llm:sapa');
});

test('resolveClassification: threshold mode keeps a confident ML result (no vision call)', async () => {
  let visionCalls = 0;
  const result = await resolveClassification(
    settings({ mode: 'unknown_plus_threshold', confidenceThreshold: 0.6 }),
    async () => classified(0.95),
    async () => { visionCalls += 1; return visionAnswer; },
  );
  assert.equal(visionCalls, 0);
  assert.equal(result.categoryId, 'metal');
  assert.equal(result.providerRevision, null);
});

test('resolveClassification: vision disabled keeps ML even when it would escalate', async () => {
  let visionCalls = 0;
  const result = await resolveClassification(
    settings({ mode: 'unknown_plus_threshold', visionEnabled: false }),
    async () => unknown,
    async () => { visionCalls += 1; return visionAnswer; },
  );
  assert.equal(visionCalls, 0);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.providerRevision, null);
});

test('resolveClassification: unknown_only escalates an unknown ML result', async () => {
  const result = await resolveClassification(
    settings({ mode: 'unknown_only' }),
    async () => unknown,
    async () => visionAnswer,
  );
  assert.equal(result.categoryId, 'plastic');
  assert.equal(result.providerRevision, 'llm:sapa');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CircuitBreaker,
  MlAdapter,
  MlError,
  classifyError,
  mapPrediction,
} from '../src/ml-adapter.js';
import { jakartaDay } from '../src/scan-repository.js';
import type { MlClient, MlPrediction } from '../src/ml-client.js';

const cfg = {} as never;

function fakeClient(impl: () => Promise<MlPrediction>): MlClient {
  return { predict: impl } as unknown as MlClient;
}

test('mapPrediction classifies a known category and sorts top-3 predictions', () => {
  const result = mapPrediction({
    label: 'plastic',
    confidences: [
      { label: 'plastic', confidence: 0.8 },
      { label: 'glass', confidence: 0.15 },
      { label: 'paper', confidence: 0.03 },
      { label: 'metal', confidence: 0.02 },
    ],
  });
  assert.equal(result.outcome, 'classified');
  assert.equal(result.categoryId, 'plastic');
  assert.equal(result.predictions.length, 3);
  assert.equal(result.predictions[0]!.categoryId, 'plastic');
  assert.ok(result.predictions[0]!.score >= result.predictions[1]!.score);
});

test('mapPrediction maps no_waste with null category and no predictions', () => {
  const result = mapPrediction({ label: 'no_waste', confidences: [{ label: 'plastic', confidence: 0.1 }] });
  assert.equal(result.outcome, 'no_waste');
  assert.equal(result.categoryId, null);
  assert.deepEqual(result.predictions, []);
});

test('mapPrediction maps Unknown/Mixed to unknown outcome', () => {
  assert.equal(mapPrediction({ label: 'Unknown', confidences: [] }).outcome, 'unknown');
  assert.equal(mapPrediction({ label: 'Mixed', confidences: [] }).outcome, 'unknown');
});

test('mapPrediction rejects a foreign label as ML_INVALID_RESPONSE (never no_waste)', () => {
  assert.throws(
    () => mapPrediction({ label: 'error', confidences: [] }),
    (e) => e instanceof MlError && e.code === 'ML_INVALID_RESPONSE',
  );
});

test('classifyError maps 401/403 to ML_UNAVAILABLE and timeout to ML_TIMEOUT', () => {
  assert.equal(classifyError(new Error('Request failed 401')), 'ML_UNAVAILABLE');
  assert.equal(classifyError(new Error('ML_TIMEOUT')), 'ML_TIMEOUT');
  assert.equal(classifyError(new MlError('ML_INVALID_RESPONSE')), 'ML_INVALID_RESPONSE');
});

test('CircuitBreaker opens after threshold and half-opens after cooldown', () => {
  let now = 1_000;
  const breaker = new CircuitBreaker(3, 60_000, () => now);
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.isOpen, false);
  breaker.recordFailure();
  assert.equal(breaker.isOpen, true);
  now += 60_000;
  assert.equal(breaker.isOpen, false, 'should half-open after cooldown');
});

test('MlAdapter retries once on a transient timeout then succeeds', async () => {
  let calls = 0;
  const client = fakeClient(async () => {
    calls += 1;
    if (calls === 1) throw new Error('ML_TIMEOUT');
    return { label: 'metal', confidences: [{ label: 'metal', confidence: 0.9 }] };
  });
  const adapter = new MlAdapter(client, cfg);
  const result = await adapter.classify(Buffer.from('x'));
  assert.equal(calls, 2);
  assert.equal(result.categoryId, 'metal');
});

test('MlAdapter does not retry on a 401 configuration failure', async () => {
  let calls = 0;
  const client = fakeClient(async () => {
    calls += 1;
    throw new Error('gradio responded 401');
  });
  const adapter = new MlAdapter(client, cfg);
  await assert.rejects(adapter.classify(Buffer.from('x')), (e) => e instanceof MlError && e.code === 'ML_UNAVAILABLE');
  assert.equal(calls, 1, 'a 401 must not be retried');
});

test('MlAdapter fails fast when the circuit breaker is open', async () => {
  let now = 0;
  const breaker = new CircuitBreaker(1, 60_000, () => now);
  breaker.recordFailure(); // opens immediately (threshold 1)
  let calls = 0;
  const client = fakeClient(async () => {
    calls += 1;
    return { label: 'metal', confidences: [] };
  });
  const adapter = new MlAdapter(client, cfg, breaker);
  await assert.rejects(adapter.classify(Buffer.from('x')), (e) => e instanceof MlError && e.code === 'ML_UNAVAILABLE');
  assert.equal(calls, 0, 'open breaker must not call the provider');
});

test('jakartaDay returns a YYYY-MM-DD string in UTC+7', () => {
  // 2026-09-25T18:30:00Z -> 2026-09-26 in Jakarta (UTC+7).
  assert.equal(jakartaDay(Date.parse('2026-09-25T18:30:00Z')), '2026-09-26');
  assert.equal(jakartaDay(Date.parse('2026-09-25T10:00:00Z')), '2026-09-25');
});

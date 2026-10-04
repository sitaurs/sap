import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from '@sap/config';
import { VisionClient } from '../src/vision-client.js';

const config = {
  SAPA_LLM_BASE_URL: 'https://gateway.test/v1',
  SAPA_LLM_API_KEY: 'test-key',
  SCAN_LLM_VISION_TIMEOUT_MS: 25,
} as AppConfig;
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function responseWith(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }),
  } as unknown as Response;
}

async function withFetch(
  fetchImpl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('VisionClient timeout includes reading and parsing the upstream response body', async () => {
  let requestSignal: AbortSignal | undefined;
  await withFetch(async (_input, init) => {
    requestSignal = init?.signal as AbortSignal;
    return {
      ok: true,
      status: 200,
      // Simulate a body stream that never completes even though headers arrived.
      json: () => new Promise<never>(() => {}),
    } as unknown as Response;
  }, async () => {
    const client = new VisionClient(config);
    await assert.rejects(client.classify(image, 'vision-test'), /ML_TIMEOUT/);
  });
  assert.equal(requestSignal?.aborted, true, 'deadline aborts the in-flight body read');
});

test('VisionClient accepts a finite confidence within the documented range', async () => {
  await withFetch(async () => responseWith({ category: 'plastic', confidence: 0.72 }), async () => {
    const prediction = await new VisionClient(config).classify(image, 'vision-test');
    assert.deepEqual(prediction, { label: 'plastic', confidences: [{ label: 'plastic', confidence: 0.72 }] });
  });
});

for (const [name, payload] of [
  ['missing', { category: 'plastic' }],
  ['string', { category: 'plastic', confidence: '0.8' }],
  ['null', { category: 'plastic', confidence: null }],
  ['negative', { category: 'plastic', confidence: -0.01 }],
  ['above one', { category: 'plastic', confidence: 1.01 }],
  ['non-finite', '{"category":"plastic","confidence":1e999}'],
] as const) {
  test(`VisionClient rejects ${name} confidence rather than guessing or clamping`, async () => {
    await withFetch(async () => responseWith(payload), async () => {
      await assert.rejects(
        new VisionClient(config).classify(image, 'vision-test'),
        /ML_INVALID_RESPONSE: confidence must be a number from 0 to 1/,
      );
    });
  });
}

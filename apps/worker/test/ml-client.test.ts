import assert from 'node:assert/strict';
import test from 'node:test';
import { MlClient } from '../src/ml-client.js';
import type { AppConfig } from '@sap/config';

const config = {
  ML_INFERENCE_URL: 'http://gradio.test',
  ML_API_NAME: '/predict_gradio',
  ML_USERNAME: 'test-user',
  ML_PASSWORD: 'test-password',
  ML_TIMEOUT_MS: 20,
} as AppConfig;

test('MlClient closes the Gradio client after a successful prediction', async () => {
  let closed = 0;
  const client = new MlClient(config, async () => ({
    predict: async () => ({ data: [{ label: 'plastic', confidences: [{ label: 'plastic', confidence: 0.9 }] }] }),
    close: () => { closed += 1; },
  }));

  const prediction = await client.predict(Buffer.from('image'));

  assert.equal(prediction.label, 'plastic');
  assert.equal(closed, 1);
});

test('MlClient closes the Gradio stream and returns ML_TIMEOUT when prediction hangs', async () => {
  let closed = 0;
  const client = new MlClient(config, async () => ({
    predict: async () => new Promise(() => {}),
    close: () => { closed += 1; },
  }));

  await assert.rejects(client.predict(Buffer.from('image')), /ML_TIMEOUT/);
  assert.equal(closed, 1);
});

test('MlClient bounds connection setup and closes a client that arrives after timeout', async () => {
  let resolveConnect!: (value: { predict: () => Promise<never>; close: () => void }) => void;
  let predictCalls = 0;
  let closed = 0;
  const client = new MlClient(config, () => new Promise((resolve) => { resolveConnect = resolve; }));

  await assert.rejects(client.predict(Buffer.from('image')), /ML_TIMEOUT/);
  resolveConnect({
    predict: async () => { predictCalls += 1; return { data: [] } as never; },
    close: () => { closed += 1; },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(predictCalls, 0, 'a late connection must not start inference');
  assert.equal(closed, 1, 'a late client must be closed');
});

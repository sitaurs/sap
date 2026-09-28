import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import type { HttpException } from '@nestjs/common';

// A valid environment WITHOUT the SAPA gateway configured, so getConfig() (read
// in ScanSettingsService's constructor) parses cleanly while leaving
// SAPA_LLM_BASE_URL / SAPA_LLM_API_KEY unset for the gateway-guard tests.
const environment = {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal', PORT: '3001',
  APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.0.0', DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'rediss://default:p@localhost:6379', SESSION_SECRET: 's'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32), SMTP_HOST: 'localhost', SMTP_PORT: '587',
  SMTP_USER: 'user', SMTP_PASSWORD: 'password', MAIL_FROM: 'SAP <sap@localhost>',
  S3_ENDPOINT: 'https://r2.invalid', S3_REGION: 'auto', S3_BUCKET: 'sap',
  S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret',
  ML_INFERENCE_URL: 'https://ml.invalid', ML_API_NAME: '/predict_gradio',
  ML_USERNAME: 'ecolens', ML_PASSWORD: 'password', ML_TIMEOUT_MS: '90000',
};
Object.assign(process.env, environment);

let ScanSettingsService: typeof import('../src/admin/scan-settings.service.js').ScanSettingsService;
let getConfig: typeof import('@sap/config').getConfig;

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}
function httpStatus(error: unknown): number {
  return (error as HttpException).getStatus?.() ?? 0;
}

before(async () => {
  ({ ScanSettingsService } = await import('../src/admin/scan-settings.service.js'));
  ({ getConfig } = await import('@sap/config'));
});

const ACTOR = '11111111-1111-1111-1111-111111111111';
const VIEW = {
  mode: 'unknown_plus_threshold' as const,
  confidenceThreshold: 0.6,
  visionEnabled: false,
  visionModel: 'sapa',
  updatedAt: '2026-09-28T00:00:00.000Z',
};

function makeService(gatewayConfigured: boolean) {
  const updateArgs: unknown[] = [];
  const repo = {
    get: async () => VIEW,
    update: async (actorId: string, requestId: string | null, patch: unknown) => {
      updateArgs.push({ actorId, requestId, patch });
      return VIEW;
    },
  };
  const service = new ScanSettingsService(repo as never);
  // Override the constructor-cached config to control gateway presence.
  (service as unknown as { config: ReturnType<typeof getConfig> }).config = {
    ...getConfig(),
    SAPA_LLM_BASE_URL: gatewayConfigured ? 'https://llm.invalid/v1' : undefined,
    SAPA_LLM_API_KEY: gatewayConfigured ? 'sk-test-key' : undefined,
  } as ReturnType<typeof getConfig>;
  return { service, updateArgs };
}

async function expectReject(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected the call to reject');
}

test('getScanSettings delegates to the repository', async () => {
  const { service } = makeService(false);
  assert.deepEqual(await service.getScanSettings(), VIEW);
});

test('updateScanSettings rejects enabling vision when the gateway is unconfigured', async () => {
  const { service, updateArgs } = makeService(false);
  const error = await expectReject(() => service.updateScanSettings(ACTOR, null, { visionEnabled: true }));
  assert.equal(errorCode(error), 'SCAN_SETTINGS_INVALID');
  assert.equal(httpStatus(error), 422);
  assert.equal(updateArgs.length, 0, 'must not touch the repository on rejection');
});

test('updateScanSettings rejects full_llm mode when the gateway is unconfigured', async () => {
  const { service } = makeService(false);
  const error = await expectReject(() => service.updateScanSettings(ACTOR, null, { mode: 'full_llm' }));
  assert.equal(errorCode(error), 'SCAN_SETTINGS_INVALID');
});

test('updateScanSettings allows a non-vision change when the gateway is unconfigured', async () => {
  const { service, updateArgs } = makeService(false);
  const result = await service.updateScanSettings(ACTOR, 'req-1', { mode: 'unknown_only', confidenceThreshold: 0.75 });
  assert.deepEqual(result, VIEW);
  assert.equal(updateArgs.length, 1);
  assert.deepEqual((updateArgs[0] as { patch: unknown }).patch, { mode: 'unknown_only', confidenceThreshold: 0.75 });
});

test('updateScanSettings allows enabling vision once the gateway is configured', async () => {
  const { service, updateArgs } = makeService(true);
  await service.updateScanSettings(ACTOR, 'req-2', { visionEnabled: true, mode: 'full_llm' });
  assert.equal(updateArgs.length, 1);
});

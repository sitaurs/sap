import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfig } from '../dist/index.js';

const valid = {
  NODE_ENV: 'test', LOG_LEVEL: 'info', PORT: '3001',
  APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.0.0', DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'rediss://default:p@localhost:6379', SESSION_SECRET: 'a'.repeat(32),
  CSRF_SECRET: 'b'.repeat(32), SMTP_HOST: 'localhost', SMTP_PORT: '587',
  SMTP_USER: 'user', SMTP_PASSWORD: 'password', MAIL_FROM: 'SAP <sap@localhost>',
  S3_ENDPOINT: 'https://r2.invalid', S3_REGION: 'auto', S3_BUCKET: 'sap',
  S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret',
  ML_INFERENCE_URL: 'https://ml.invalid', ML_API_NAME: '/predict_gradio',
  ML_USERNAME: 'ecolens', ML_PASSWORD: 'password', ML_TIMEOUT_MS: '90000',
};

test('accepts the canonical environment contract', () => {
  const cfg = getConfig(valid);
  assert.equal(cfg.CONTRACT_VERSION, '1.0.0');
  // DB readiness cold-start budget defaults when unset and coerces when provided.
  assert.equal(cfg.DB_HEALTH_TIMEOUT_MS, 10000);
  assert.equal(getConfig({ ...valid, DB_HEALTH_TIMEOUT_MS: '8000' }).DB_HEALTH_TIMEOUT_MS, 8000);
  // SAPA defaults: kill switch off, provider fields optional, sane LLM defaults.
  assert.equal(cfg.SAPA_FEATURE_ENABLED, false);
  assert.equal(cfg.SAPA_LLM_BASE_URL, undefined);
  assert.equal(cfg.SAPA_LLM_TIMEOUT_MS, 30000);
  assert.equal(cfg.SAPA_LLM_MAX_OUTPUT_TOKENS, 500);
  assert.equal(cfg.SAPA_LLM_TEMPERATURE, 0.3);
});

test('treats SAPA_FEATURE_ENABLED string tokens as real booleans', () => {
  // z.coerce.boolean would make "false" truthy; the custom parser must not.
  assert.equal(getConfig({ ...valid, SAPA_FEATURE_ENABLED: 'false' }).SAPA_FEATURE_ENABLED, false);
  assert.equal(getConfig({ ...valid, SAPA_FEATURE_ENABLED: '0' }).SAPA_FEATURE_ENABLED, false);
});

test('requires the LLM provider trio when SAPA is enabled', () => {
  assert.throws(() => getConfig({ ...valid, SAPA_FEATURE_ENABLED: 'true' }), /SAPA_LLM_BASE_URL/);
  const enabled = getConfig({
    ...valid,
    SAPA_FEATURE_ENABLED: 'true',
    SAPA_LLM_BASE_URL: 'https://llm.invalid/v1',
    SAPA_LLM_API_KEY: 'sk-test-key',
    SAPA_LLM_MODEL: 'test-model',
  });
  assert.equal(enabled.SAPA_FEATURE_ENABLED, true);
  assert.equal(enabled.SAPA_LLM_MODEL, 'test-model');
});

test('rejects placeholders and short secrets', () => {
  assert.throws(() => getConfig({ ...valid, SESSION_SECRET: 'short', S3_ACCESS_KEY_ID: 'replace-me' }));
});

test('rejects shared application secrets without exposing their values', () => {
  const shared = 'sensitive-value-that-must-never-appear';
  assert.throws(
    () => getConfig({ ...valid, SESSION_SECRET: shared, CSRF_SECRET: shared }),
    (error) => error instanceof Error && error.message.includes('CSRF_SECRET') && !error.message.includes(shared),
  );
});

test('requires HTTPS origins in production', () => {
  assert.throws(() => getConfig({ ...valid, NODE_ENV: 'production' }), /APP_ORIGIN/);
  assert.equal(
    getConfig({ ...valid, NODE_ENV: 'production', APP_ORIGIN: 'https://sap.invalid', API_INTERNAL_URL: 'https://api.sap.invalid' }).NODE_ENV,
    'production',
  );
});

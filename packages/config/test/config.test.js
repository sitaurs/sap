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
  assert.equal(getConfig(valid).CONTRACT_VERSION, '1.0.0');
});

test('rejects placeholders and short secrets', () => {
  assert.throws(() => getConfig({ ...valid, SESSION_SECRET: 'short', S3_ACCESS_KEY_ID: 'replace-me' }));
});

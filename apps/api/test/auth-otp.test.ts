import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import type { HttpException } from '@nestjs/common';

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

// Loaded in before() so process.env is populated before AuthCryptoService reads config.
let AuthService: typeof import('../src/auth/auth.service.js').AuthService;
let AuthCryptoService: typeof import('../src/auth/auth-crypto.js').AuthCryptoService;
let PasswordService: typeof import('../src/auth/password.service.js').PasswordService;

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

before(async () => {
  ({ AuthService } = await import('../src/auth/auth.service.js'));
  ({ AuthCryptoService } = await import('../src/auth/auth-crypto.js'));
  ({ PasswordService } = await import('../src/auth/password.service.js'));
});

interface Harness {
  service: InstanceType<typeof AuthService>;
  challenge: {
    id: string; userId: string | null; emailHash: string; purpose: 'verify_email' | 'reset_password';
    codeHash: string; attempts: number; resendAfter: Date | null; expiresAt: Date; consumedAt: Date | null;
  };
  user: {
    id: string; emailNormalized: string; passwordHash: string | null; displayName: string;
    role: 'user' | 'admin'; emailVerifiedAt: Date | null; deletedAt: Date | null;
  };
  revokedUsers: string[];
  deletedTokenHashes: string[];
}

async function makeHarness(purpose: 'verify_email' | 'reset_password' = 'verify_email'): Promise<Harness> {
  const crypto = new AuthCryptoService();
  const passwords = new PasswordService();
  const now = Date.now();

  const user: Harness['user'] = {
    id: 'u1', emailNormalized: 'user@example.com', passwordHash: await passwords.hash('current-password-1'),
    displayName: 'User One', role: 'user', emailVerifiedAt: purpose === 'reset_password' ? new Date(now) : null,
    deletedAt: null,
  };
  const challenge: Harness['challenge'] = {
    id: 'ch-1', userId: 'u1', emailHash: crypto.hashEmail(user.emailNormalized), purpose,
    codeHash: crypto.hashOtp('123456'), attempts: 0,
    resendAfter: new Date(now - 1_000), expiresAt: new Date(now + 600_000), consumedAt: null,
  };
  const revokedUsers: string[] = [];
  const deletedTokenHashes: string[] = [];

  const users = {
    findActiveByEmail: async (email: string) => (email === user.emailNormalized ? user : null),
    findActiveById: async (id: string) => (id === user.id ? user : null),
    markEmailVerified: async (id: string) => { if (id === user.id) user.emailVerifiedAt = new Date(); },
    updatePassword: async (id: string, hash: string) => { if (id === user.id) user.passwordHash = hash; },
  };
  const sessions = {
    create: async () => {},
    deleteByTokenHash: async (tokenHash: string) => { deletedTokenHashes.push(tokenHash); },
    deleteAllForUser: async (userId: string) => { revokedUsers.push(userId); },
    markReauthenticated: async () => {},
  };
  const sessionService = {
    createToken: () => ({ token: 'raw-token', tokenHash: 'token-hash', expiresAt: new Date(now + 1_000) }),
  };
  const challenges = {
    findById: async (id: string) => (id === challenge.id ? challenge : null),
    findLatestByEmail: async () => challenge,
    incrementAttempts: async (id: string) => { if (id === challenge.id) challenge.attempts += 1; },
    consume: async (id: string) => {
      if (id === challenge.id && !challenge.consumedAt) { challenge.consumedAt = new Date(); return true; }
      return false;
    },
  };
  const mailer = { sendOtp: async () => {} };
  const deletions = {};
  const outbox = {};

  const service = new AuthService(
    users as never, sessions as never, sessionService as never, challenges as never,
    deletions as never, outbox as never, passwords as never, crypto as never, mailer as never,
  );
  return { service, challenge, user, revokedUsers, deletedTokenHashes };
}

test('verifyEmail consumes the OTP challenge exactly once (single-use)', async () => {
  const h = await makeHarness('verify_email');

  const result = await h.service.verifyEmail({ challengeId: 'ch-1', code: '123456' });
  assert.equal(result.user.id, 'u1');
  assert.equal(result.user.emailVerified, true);
  assert.ok(h.challenge.consumedAt, 'challenge should be marked consumed');

  await assert.rejects(
    h.service.verifyEmail({ challengeId: 'ch-1', code: '123456' }),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
    'a consumed challenge must not verify a second time',
  );
});

test('verifyEmail rejects a wrong code and counts the attempt', async () => {
  const h = await makeHarness('verify_email');
  await assert.rejects(
    h.service.verifyEmail({ challengeId: 'ch-1', code: '000000' }),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
  );
  assert.equal(h.challenge.attempts, 1);
  assert.equal(h.challenge.consumedAt, null);
});

test('verifyEmail rejects once the attempt cap is exhausted', async () => {
  const h = await makeHarness('verify_email');
  h.challenge.attempts = 5;
  await assert.rejects(
    h.service.verifyEmail({ challengeId: 'ch-1', code: '123456' }),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
  );
});

test('resetPassword revokes every session for the account', async () => {
  const h = await makeHarness('reset_password');
  const ack = await h.service.resetPassword({ challengeId: 'ch-1', code: '123456', newPassword: 'brand-new-password-1' });
  assert.match(ack.message, /kata sandi/i);
  assert.deepEqual(h.revokedUsers, ['u1'], 'reset-password must revoke all sessions for the user');
  assert.ok(await new PasswordService().verify(h.user.passwordHash, 'brand-new-password-1'));
});

test('logout revokes the current session token', async () => {
  const h = await makeHarness('verify_email');
  await h.service.logout('token-hash-42');
  assert.deepEqual(h.deletedTokenHashes, ['token-hash-42']);
});

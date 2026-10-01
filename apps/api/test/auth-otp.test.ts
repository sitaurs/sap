import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import type { HttpException } from '@nestjs/common';

const environment = {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal', PORT: '3001',
  APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.1.0', DATABASE_URL: 'postgresql://u:p@localhost/db',
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
    role: 'user' | 'admin'; emailVerifiedAt: Date | null; sapaEnabled: boolean;
    avatarMediaId: string | null; deletedAt: Date | null;
  };
  revokedUsers: string[];
  deletedTokenHashes: string[];
  revokedExcept: Array<{ userId: string; keep: string }>;
  clearedAvatars: string[];
  scheduledAvatarExpiry: string[];
}

async function makeHarness(purpose: 'verify_email' | 'reset_password' = 'verify_email'): Promise<Harness> {
  const crypto = new AuthCryptoService();
  const passwords = new PasswordService();
  const now = Date.now();

  const user: Harness['user'] = {
    id: 'u1', emailNormalized: 'user@example.com', passwordHash: await passwords.hash('current-password-1'),
    displayName: 'User One', role: 'user', emailVerifiedAt: purpose === 'reset_password' ? new Date(now) : null,
    sapaEnabled: true, avatarMediaId: null, deletedAt: null,
  };
  const challenge: Harness['challenge'] = {
    id: 'ch-1', userId: 'u1', emailHash: crypto.hashEmail(user.emailNormalized), purpose,
    codeHash: crypto.hashOtp('123456'), attempts: 0,
    resendAfter: new Date(now - 1_000), expiresAt: new Date(now + 600_000), consumedAt: null,
  };
  const revokedUsers: string[] = [];
  const deletedTokenHashes: string[] = [];
  const revokedExcept: Array<{ userId: string; keep: string }> = [];
  const clearedAvatars: string[] = [];
  const scheduledAvatarExpiry: string[] = [];

  const users = {
    findActiveByEmail: async (email: string) => (email === user.emailNormalized ? user : null),
    findActiveById: async (id: string) => (id === user.id ? user : null),
    markEmailVerified: async (id: string) => { if (id === user.id) user.emailVerifiedAt = new Date(); },
    updatePassword: async (id: string, hash: string) => { if (id === user.id) user.passwordHash = hash; },
    updateSapaEnabled: async (id: string, sapaEnabled: boolean) => {
      if (id !== user.id) return null;
      user.sapaEnabled = sapaEnabled;
      return user;
    },
    updateAvatar: async (id: string, avatarMediaId: string | null) => {
      if (id !== user.id) return null;
      user.avatarMediaId = avatarMediaId;
      return user;
    },
  };
  const sessions = {
    create: async () => {},
    deleteByTokenHash: async (tokenHash: string) => { deletedTokenHashes.push(tokenHash); },
    deleteAllForUser: async (userId: string) => { revokedUsers.push(userId); },
    deleteAllForUserExcept: async (userId: string, keep: string) => { revokedExcept.push({ userId, keep }); },
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
  // These OTP-flow tests never enter the MFA login branch; a no-factor stub keeps
  // AuthService.login on its existing path. MFA behaviour is covered in auth-mfa.test.ts.
  const mfa = { isActive: async () => false, issuePreauth: async () => ({ token: 'unused', expiresAt: new Date().toISOString() }) };
  const media = {
    // A stored avatar object the account owns; anything else resolves to null (→ 404/validation).
    findStoredForOwner: async (mediaId: string, ownerId: string) =>
      mediaId === 'avatar-1' && ownerId === user.id
        ? { id: 'avatar-1', ownerId, purpose: 'avatar', objectKey: 'avatar/u1/x.webp', mime: 'image/webp', sizeBytes: 1, expiresAt: new Date() }
        : null,
    clearExpiry: async (mediaId: string) => { clearedAvatars.push(mediaId); },
    scheduleExpiry: async (mediaId: string) => { scheduledAvatarExpiry.push(mediaId); },
  };

  const service = new AuthService(
    users as never, sessions as never, sessionService as never, challenges as never,
    deletions as never, outbox as never, passwords as never, crypto as never, mailer as never,
    media as never, mfa as never,
  );
  return { service, challenge, user, revokedUsers, deletedTokenHashes, revokedExcept, clearedAvatars, scheduledAvatarExpiry };
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

test('updateSapaPreference persists the flag and echoes it back', async () => {
  const h = await makeHarness('verify_email');
  const off = await h.service.updateSapaPreference('u1', false);
  assert.equal(off.sapaEnabled, false);
  assert.equal(h.user.sapaEnabled, false);
  const on = await h.service.updateSapaPreference('u1', true);
  assert.equal(on.sapaEnabled, true);
});

test('updateSapaPreference rejects an unknown account with NOT_FOUND', async () => {
  const h = await makeHarness('verify_email');
  await assert.rejects(
    h.service.updateSapaPreference('nope', true),
    (error) => errorCode(error) === 'NOT_FOUND',
  );
});

test('changePassword updates the hash and revokes other sessions, keeping the current one', async () => {
  const h = await makeHarness('verify_email');
  const ack = await h.service.changePassword('u1', 'token-hash', 'current-password-1', 'brand-new-password-1');
  assert.match(ack.message, /kata sandi/i);
  assert.ok(await new PasswordService().verify(h.user.passwordHash, 'brand-new-password-1'), 'new password must be stored');
  assert.deepEqual(h.revokedExcept, [{ userId: 'u1', keep: 'token-hash' }], 'other sessions revoked, current kept');
  assert.deepEqual(h.revokedUsers, [], 'must not revoke every session (would boot the caller)');
});

test('changePassword rejects a wrong current password', async () => {
  const h = await makeHarness('verify_email');
  await assert.rejects(
    h.service.changePassword('u1', 'token-hash', 'wrong-password', 'brand-new-password-1'),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
  );
  assert.deepEqual(h.revokedExcept, [], 'no sessions touched on a failed change');
  assert.ok(await new PasswordService().verify(h.user.passwordHash, 'current-password-1'), 'password unchanged');
});

test('changePassword rejects a new password equal to the current one', async () => {
  const h = await makeHarness('verify_email');
  await assert.rejects(
    h.service.changePassword('u1', 'token-hash', 'current-password-1', 'current-password-1'),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
  );
});

test('setAvatar attaches an owned avatar object and persists it against cleanup', async () => {
  const h = await makeHarness('verify_email');
  const view = await h.service.setAvatar('u1', 'avatar-1');
  assert.equal(view.avatarMediaId, 'avatar-1');
  assert.equal(h.user.avatarMediaId, 'avatar-1');
  assert.deepEqual(h.clearedAvatars, ['avatar-1'], 'new avatar must have its orphan TTL cleared');
  assert.deepEqual(h.scheduledAvatarExpiry, [], 'no previous avatar to reclaim');
});

test('setAvatar re-arms cleanup on the photo it replaces', async () => {
  const h = await makeHarness('verify_email');
  h.user.avatarMediaId = 'old-avatar';
  const view = await h.service.setAvatar('u1', 'avatar-1');
  assert.equal(view.avatarMediaId, 'avatar-1');
  assert.deepEqual(h.scheduledAvatarExpiry, ['old-avatar'], 'the replaced photo is reclaimed');
});

test('setAvatar clears the photo when given null', async () => {
  const h = await makeHarness('verify_email');
  h.user.avatarMediaId = 'old-avatar';
  const view = await h.service.setAvatar('u1', null);
  assert.equal(view.avatarMediaId, null);
  assert.equal(h.user.avatarMediaId, null);
  assert.deepEqual(h.scheduledAvatarExpiry, ['old-avatar'], 'removing re-arms cleanup on the old photo');
  assert.deepEqual(h.clearedAvatars, [], 'nothing new to persist');
});

test('setAvatar rejects a media id the account does not own', async () => {
  const h = await makeHarness('verify_email');
  await assert.rejects(
    h.service.setAvatar('u1', '99999999-9999-4999-8999-999999999999'),
    (error) => errorCode(error) === 'VALIDATION_ERROR',
  );
  assert.equal(h.user.avatarMediaId, null, 'avatar unchanged on rejection');
});

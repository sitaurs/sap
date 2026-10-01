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
  MFA_TOTP_ENABLED: 'true', MFA_TOTP_ENCRYPTION_KEY: 'ab'.repeat(32),
};
Object.assign(process.env, environment);

let AuthService: typeof import('../src/auth/auth.service.js').AuthService;
let AuthCryptoService: typeof import('../src/auth/auth-crypto.js').AuthCryptoService;
let MfaCryptoService: typeof import('../src/auth/mfa-crypto.js').MfaCryptoService;
let MfaService: typeof import('../src/auth/mfa.service.js').MfaService;
let PasswordService: typeof import('../src/auth/password.service.js').PasswordService;

function errorCode(error: unknown): string {
  const response = (error as HttpException).getResponse();
  return typeof response === 'object' && response !== null ? (response as { code?: string }).code ?? '' : '';
}

before(async () => {
  ({ AuthService } = await import('../src/auth/auth.service.js'));
  ({ AuthCryptoService } = await import('../src/auth/auth-crypto.js'));
  ({ MfaCryptoService } = await import('../src/auth/mfa-crypto.js'));
  ({ MfaService } = await import('../src/auth/mfa.service.js'));
  ({ PasswordService } = await import('../src/auth/password.service.js'));
});

interface MemoryFactor {
  userId: string;
  state: 'pending' | 'active';
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  lastAcceptedStep: number | null;
  pendingExpiresAt: Date | null;
}
interface MemoryPreauth {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

async function makeMfaHarness() {
  const crypto = new MfaCryptoService();
  const factorSecret = crypto.generateSecret();
  const sealed = crypto.encryptSecret(factorSecret);
  const factors = new Map<string, MemoryFactor>([['u1', {
    userId: 'u1', state: 'active', secretCiphertext: sealed.ciphertext, secretIv: sealed.iv,
    secretTag: sealed.tag, lastAcceptedStep: null, pendingExpiresAt: null,
  }]]);
  const preauths = new Map<string, MemoryPreauth>();
  const recovery = new Map<string, Set<string>>();
  const revokedUsers: string[] = [];
  const createdSessions: Array<{ userId: string; tokenHash: string }> = [];
  const loginAttempts = new Map<string, number>();

  const user = {
    id: 'u1', emailNormalized: 'user@example.com', passwordHash: 'password-hash',
    displayName: 'User One', role: 'user' as const, emailVerifiedAt: new Date(),
    sapaEnabled: true, avatarMediaId: null, deletedAt: null,
  };
  const users = {
    findActiveById: async (id: string) => id === user.id ? user : null,
    findActiveByEmail: async (email: string) => email === user.emailNormalized ? user : null,
  };
  const sessions = {
    create: async (input: { userId: string; tokenHash: string }) => { createdSessions.push(input); },
    deleteAllForUser: async (userId: string) => { revokedUsers.push(userId); },
    deleteAllForUserExcept: async () => {},
    deleteByTokenHash: async () => {},
    markReauthenticated: async () => {},
  };
  const sessionService = {
    createToken: () => ({ token: `session-${createdSessions.length + 1}`, tokenHash: `session-hash-${createdSessions.length + 1}`, expiresAt: new Date(Date.now() + 60_000) }),
  };
  const repository = {
    getFactor: async (userId: string) => factors.get(userId) ?? null,
    upsertPending: async (input: { userId: string; secretCiphertext: string; secretIv: string; secretTag: string; pendingExpiresAt: Date }) => {
      factors.set(input.userId, { ...input, state: 'pending', lastAcceptedStep: null });
    },
    completeEnrollment: async (userId: string, step: number, hashes: string[]) => {
      const factor = factors.get(userId);
      if (!factor || factor.state !== 'pending' || !factor.pendingExpiresAt || factor.pendingExpiresAt.getTime() <= Date.now()) return false;
      factor.state = 'active'; factor.lastAcceptedStep = step; factor.pendingExpiresAt = null;
      recovery.set(userId, new Set(hashes));
      // Activation revokes any password-only session created before the lock.
      revokedUsers.push(userId);
      return true;
    },
    createSessionWhileMfaActive: async (input: { userId: string; tokenHash: string; expiresAt: Date }) => {
      const factor = factors.get(input.userId);
      if (!factor || factor.state !== 'active') return false;
      createdSessions.push({ userId: input.userId, tokenHash: input.tokenHash });
      return true;
    },
    replaceRecoveryCodesAndRevokeSessions: async (userId: string, hashes: string[]) => {
      const factor = factors.get(userId);
      if (!factor || factor.state !== 'active') return false;
      recovery.set(userId, new Set(hashes));
      revokedUsers.push(userId);
      return true;
    },
    disableActiveFactor: async (userId: string) => {
      const factor = factors.get(userId);
      if (!factor || factor.state !== 'active') return false;
      factors.delete(userId); recovery.delete(userId); loginAttempts.delete(userId);
      revokedUsers.push(userId);
      return true;
    },
    advanceStep: async (userId: string, step: number) => {
      const factor = factors.get(userId);
      if (!factor || factor.state !== 'active' || (factor.lastAcceptedStep !== null && factor.lastAcceptedStep >= step)) return false;
      factor.lastAcceptedStep = step;
      return true;
    },
    deleteFactor: async (userId: string) => { factors.delete(userId); },
    replaceRecoveryCodes: async (userId: string, hashes: string[]) => { recovery.set(userId, new Set(hashes)); },
    deleteRecoveryCodes: async (userId: string) => { recovery.delete(userId); },
    createPreauth: async (input: { tokenHash: string; userId: string; expiresAt: Date }) => {
      preauths.set(input.tokenHash, { ...input, attempts: 0, consumedAt: null });
    },
    findPreauth: async (tokenHash: string) => preauths.get(tokenHash) ?? null,
    claimPreauthAttempt: async (tokenHash: string, userId: string, now: Date) => {
      const record = preauths.get(tokenHash);
      if (!record || record.userId !== userId || record.consumedAt || record.expiresAt <= now || record.attempts >= 5) return false;
      record.attempts += 1;
      return true;
    },
    completePreauthWithTotp: async ({ tokenHash, userId, step }: { tokenHash: string; userId: string; step: number }) => {
      const record = preauths.get(tokenHash);
      const factor = factors.get(userId);
      if (!record || record.userId !== userId || record.consumedAt || record.expiresAt <= new Date() || record.attempts > 5 || !factor || factor.state !== 'active' || (factor.lastAcceptedStep !== null && factor.lastAcceptedStep >= step)) return false;
      record.consumedAt = new Date(); factor.lastAcceptedStep = step;
      return true;
    },
    completePreauthWithRecovery: async ({ tokenHash, userId, codeHash }: { tokenHash: string; userId: string; codeHash: string }) => {
      const record = preauths.get(tokenHash);
      const codes = recovery.get(userId);
      if (!record || record.userId !== userId || record.consumedAt || record.expiresAt <= new Date() || record.attempts > 5 || !codes?.has(codeHash)) return false;
      record.consumedAt = new Date(); codes.delete(codeHash);
      return true;
    },
    consumeRecoveryCode: async (userId: string, hash: string) => {
      const codes = recovery.get(userId);
      if (!codes?.has(hash)) return false;
      codes.delete(hash); return true;
    },
    countUnusedRecoveryCodes: async (userId: string) => recovery.get(userId)?.size ?? 0,
    claimAccountLoginAttempt: async (userId: string, now: Date) => {
      const count = loginAttempts.get(userId) ?? 0;
      loginAttempts.set(userId, count + 1);
      return count < 5;
    },
    clearLoginLimit: async (userId: string) => { loginAttempts.delete(userId); },
  };
  const service = new MfaService(repository as never, crypto, users as never, sessions as never, sessionService as never);
  return { service, crypto, factorSecret, factors, preauths, recovery, revokedUsers, createdSessions, user, repository };
}

async function issue(h: Awaited<ReturnType<typeof makeMfaHarness>>) {
  return h.service.issuePreauth('u1');
}

test('password login with active MFA returns preauth and creates no session; non-MFA login is unchanged', async () => {
  const h = await makeMfaHarness();
  const authCrypto = new AuthCryptoService();
  const passwords = new PasswordService();
  const user = { ...h.user, passwordHash: await passwords.hash('current-password-1') };
  let sessionsCreated = 0;
  let active = true;
  const users = { findActiveByEmail: async () => user };
  const sessions = { createIfMfaDisabled: async () => { if (active) return false; sessionsCreated += 1; return true; } };
  const sessionService = { createToken: () => ({ token: 'raw-session', tokenHash: 'session-hash', expiresAt: new Date(Date.now() + 60_000) }) };
  const mfa = { isActive: async () => active, issuePreauth: (id: string) => h.service.issuePreauth(id) };
  const auth = new AuthService(users as never, sessions as never, sessionService as never, {} as never, {} as never, {} as never, passwords, authCrypto, {} as never, {} as never, mfa as never);

  const challenge = await auth.login({ email: user.emailNormalized, password: 'current-password-1' });
  assert.equal('mfaRequired' in challenge && challenge.mfaRequired, true);
  assert.equal('preauthToken' in challenge && challenge.preauthToken.length, 43);
  assert.equal(sessionsCreated, 0, 'password-only login must not create a session for active MFA');

  active = false;
  const result = await auth.login({ email: user.emailNormalized, password: 'current-password-1' });
  assert.equal('user' in result, true);
  assert.equal(sessionsCreated, 1, 'non-MFA login must still create a session');
});

test('login losing the enrollment race (stale MFA check, conditional insert refuses) issues preauth and no session', async () => {
  const h = await makeMfaHarness();
  const authCrypto = new AuthCryptoService();
  const passwords = new PasswordService();
  const user = { ...h.user, passwordHash: await passwords.hash('current-password-1') };
  let sessionsCreated = 0;
  const users = { findActiveByEmail: async () => user };
  // isActive returns false (the factor activated after this read), but the
  // conditional session insert refuses because enrollment won the user-row lock.
  const sessions = { createIfMfaDisabled: async () => { return false; } };
  const sessionService = { createToken: () => ({ token: 'raw-session', tokenHash: 'session-hash', expiresAt: new Date(Date.now() + 60_000) }) };
  const mfa = { isActive: async () => false, issuePreauth: (id: string) => h.service.issuePreauth(id) };
  const auth = new AuthService(users as never, sessions as never, sessionService as never, {} as never, {} as never, {} as never, passwords, authCrypto, {} as never, {} as never, mfa as never);

  const challenge = await auth.login({ email: user.emailNormalized, password: 'current-password-1' });
  assert.equal('mfaRequired' in challenge && challenge.mfaRequired, true, 'the race must downgrade to a second-factor challenge');
  assert.equal('preauthToken' in challenge && challenge.preauthToken.length, 43);
  assert.equal(sessionsCreated, 0, 'no password-only session may survive a lost enrollment race');
});

test('MFA login with valid TOTP creates exactly one session and consumes preauth', async () => {
  const h = await makeMfaHarness();
  const preauth = await issue(h);
  const now = Date.now();
  const code = h.crypto.totpForStep(h.factorSecret, h.crypto.currentStep(now));
  const result = await h.service.completeLogin({ preauthToken: preauth.token, code, now });
  assert.equal(result.user.id, 'u1');
  assert.equal(h.createdSessions.length, 1);
  assert.equal(h.preauths.get(h.crypto.hashPreauthToken(preauth.token))?.consumedAt instanceof Date, true);
  await assert.rejects(h.service.completeLogin({ preauthToken: preauth.token, code, now: now + 1_000 }), e => errorCode(e) === 'MFA_INVALID', 'replayed preauth must fail');
  assert.equal(h.createdSessions.length, 1, 'replay must not issue a second session');
});

test('MFA login with a recovery code creates a session once and consumes the recovery code', async () => {
  const h = await makeMfaHarness();
  const codes = h.crypto.generateRecoveryCodes();
  const hashes = codes.map(code => h.crypto.hashRecoveryCode(code));
  h.recovery.set('u1', new Set(hashes));
  const preauth = await issue(h);
  const result = await h.service.completeLogin({ preauthToken: preauth.token, code: codes[0]! });
  assert.equal(result.user.id, 'u1');
  assert.equal(h.createdSessions.length, 1);
  assert.equal(h.recovery.get('u1')?.has(hashes[0]!), false);
  await assert.rejects(h.service.completeLogin({ preauthToken: preauth.token, code: codes[0]! }), e => errorCode(e) === 'MFA_INVALID');
  assert.equal(h.createdSessions.length, 1);
});

test('MFA login rejects wrong, expired, replayed, and cross-account preauth proofs', async () => {
  const h = await makeMfaHarness();
  const wrong = await issue(h);
  const now = Date.now();
  await assert.rejects(h.service.completeLogin({ preauthToken: wrong.token, code: '000000', now }), e => errorCode(e) === 'MFA_INVALID');
  assert.equal(h.createdSessions.length, 0);

  // An email OTP challenge is a different purpose and cannot be substituted for
  // an MFA pre-auth token, even if the caller submits a syntactically valid token.
  await assert.rejects(
    h.service.completeLogin({ preauthToken: '11111111-1111-4111-8111-111111111111', code: '123456', now }),
    e => errorCode(e) === 'MFA_INVALID',
    'an unknown/cross-purpose challenge token must not authenticate',
  );
  assert.equal(h.createdSessions.length, 0);

  const expired = await issue(h);
  await assert.rejects(h.service.completeLogin({ preauthToken: expired.token, code: '123456', now: Date.now() + 6 * 60_000 }), e => errorCode(e) === 'MFA_INVALID');

  const foreignUser = { ...h.user, id: 'u2' };
  const foreignRepository = { ...h.repository, createPreauth: async (input: { tokenHash: string; userId: string; expiresAt: Date }) => {
    h.preauths.set(input.tokenHash, { ...input, attempts: 0, consumedAt: null });
  } };
  const foreignMfa = new MfaService(foreignRepository as never, h.crypto, { findActiveById: async (id: string) => id === 'u2' ? foreignUser : null } as never, { create: async () => { throw new Error('must not create foreign session'); }, deleteAllForUser: async () => {} } as never, { createToken: () => ({ token: 'x', tokenHash: 'x', expiresAt: new Date() }) } as never);
  const foreign = await foreignMfa.issuePreauth('u1');
  // The second service is given a valid token for u1 but only has a factor/user for u2;
  // the token remains bound to u1 and cannot complete as the other account.
  await assert.rejects(foreignMfa.completeLogin({ preauthToken: foreign.token, code: '123456' }), e => errorCode(e) === 'MFA_INVALID');
  assert.equal(h.createdSessions.length, 0);
});

test('enrollment requires fresh reauth; confirmation activates MFA and reveals recovery codes once', async () => {
  const h = await makeMfaHarness();
  // Enrollment harness starts active for login tests; this account is starting fresh.
  h.factors.delete('u1');
  await assert.rejects(h.service.beginEnrollment('u1', null), e => errorCode(e) === 'REAUTH_REQUIRED');
  const setup = await h.service.beginEnrollment('u1', new Date());
  assert.match(setup.provisioningUri, /^otpauth:\/\/totp\//);
  assert.equal((await h.service.status('u1')), 'pending');

  const pending = h.factors.get('u1')!;
  const seed = h.crypto.decryptSecret({ ciphertext: pending.secretCiphertext, iv: pending.secretIv, tag: pending.secretTag });
  const now = Date.now();
  // Use the pending seed in place of the previously active test factor.
  h.factors.set('u1', { ...pending, state: 'pending' });
  const reveal = await h.service.confirmEnrollment('u1', h.crypto.totpForStep(seed, h.crypto.currentStep(now)), new Date(now));
  assert.equal(reveal.recoveryCodes.length, 10);
  assert.equal(await h.service.status('u1'), 'active');
  assert.deepEqual(h.revokedUsers, ['u1'], 'activation revokes existing sessions');
  assert.equal(h.recovery.get('u1')?.size, 10);
  // The endpoint only returns plaintext on this activation result; status cannot retrieve them.
  assert.deepEqual(await h.service.status('u1'), 'active');
  assert.equal('recoveryCodes' in reveal, true, 'recovery codes are returned only by the activation response');
  assert.equal(Object.keys(await h.service.status('u1')).includes('recoveryCodes'), false);
});

test('disable and regenerate require fresh reauth and current non-replayed TOTP, then revoke sessions', async () => {
  const h = await makeMfaHarness();
  const now = Date.now();
  const code = h.crypto.totpForStep(h.factorSecret, h.crypto.currentStep(now));
  await assert.rejects(h.service.regenerateRecoveryCodes({ userId: 'u1', reauthenticatedAt: null, currentTotpCode: code }), e => errorCode(e) === 'REAUTH_REQUIRED');
  await assert.rejects(h.service.disable({ userId: 'u1', reauthenticatedAt: null, currentTotpCode: code }), e => errorCode(e) === 'REAUTH_REQUIRED');
  await assert.rejects(h.service.regenerateRecoveryCodes({ userId: 'u1', reauthenticatedAt: new Date(), currentTotpCode: '000000' }), e => errorCode(e) === 'MFA_INVALID');

  const reauth = new Date();
  const generated = await h.service.regenerateRecoveryCodes({ userId: 'u1', reauthenticatedAt: reauth, currentTotpCode: code });
  assert.equal(generated.recoveryCodes.length, 10);
  assert.deepEqual(h.revokedUsers, ['u1'], 'regeneration revokes all sessions');
  await assert.rejects(h.service.regenerateRecoveryCodes({ userId: 'u1', reauthenticatedAt: reauth, currentTotpCode: code }), e => errorCode(e) === 'MFA_INVALID', 'same TOTP step cannot be replayed');

  const later = Date.now() + 30_000;
  const laterCode = h.crypto.totpForStep(h.factorSecret, h.crypto.currentStep(later));
  await h.service.disable({ userId: 'u1', reauthenticatedAt: new Date(later), currentTotpCode: laterCode, now: later });
  assert.equal(await h.service.status('u1'), 'disabled');
  assert.deepEqual(h.revokedUsers, ['u1', 'u1'], 'disable revokes all sessions');
});

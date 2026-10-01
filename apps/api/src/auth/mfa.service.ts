import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import { SessionRepository } from '../session/session.repository.js';
import { SessionService } from '../session/session.service.js';
import { UsersRepository } from '../users/users.repository.js';
import type { SessionResult } from './auth.service.js';
import { toUserView } from './auth.types.js';
import { MfaCryptoService } from './mfa-crypto.js';
import { MfaRepository } from './mfa.repository.js';
import type { MfaFactorRecord, MfaStatus, SealedSecret } from './mfa.types.js';

const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const PREAUTH_TTL_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const INVALID_FACTOR_MESSAGE = 'Kode verifikasi tidak valid atau telah kedaluwarsa.';

/** One-time enrollment material. Never cache/log this object. */
export interface MfaEnrollmentSetup {
  provisioningUri: string;
  expiresAt: string;
}

/** Recovery plaintext is returned only once by confirm/regenerate. */
export interface MfaRecoveryReveal {
  recoveryCodes: string[];
}

export interface MfaPreauthToken {
  /** Opaque bearer token; store only its keyed hash. */
  token: string;
  expiresAt: string;
}

/**
 * MFA primitives exposed through MfaController (contract v1.1.0) and the login
 * challenge flow in AuthService. Callers must never create a normal session
 * before completeLogin: password login issues only a pre-auth token when a
 * factor is active, and the session is minted here after the second factor.
 */
@Injectable()
export class MfaService {
  private readonly config: AppConfig = getConfig();

  constructor(
    private readonly repository: MfaRepository,
    private readonly mfaCrypto: MfaCryptoService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionRepository,
    private readonly sessionService: SessionService,
  ) {}

  isAvailable(): boolean {
    return this.config.MFA_TOTP_ENABLED;
  }

  async status(userId: string): Promise<MfaStatus> {
    if (!this.isAvailable()) return 'disabled';
    const factor = await this.repository.getFactor(userId);
    if (factor?.state === 'pending' && factor.pendingExpiresAt && factor.pendingExpiresAt.getTime() <= Date.now()) {
      await this.repository.deleteFactor(userId);
      return 'disabled';
    }
    return factor?.state ?? 'disabled';
  }

  async isActive(userId: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const factor = await this.repository.getFactor(userId);
    return factor?.state === 'active';
  }

  /**
   * Begin/replace a pending setup only after recent server-verified password
   * reauthentication. Replacing an active factor is intentionally not supported
   * here; a separate design must require current-factor proof first.
   */
  async beginEnrollment(userId: string, reauthenticatedAt: Date | null, now = Date.now()): Promise<MfaEnrollmentSetup> {
    this.assertAvailable();
    this.assertFreshReauth(reauthenticatedAt, now);
    const existing = await this.repository.getFactor(userId);
    if (existing?.state === 'active') {
      throw new ForbiddenException({ code: 'MFA_FACTOR_ACTIVE', message: 'Nonaktifkan faktor saat ini sebelum menyiapkan yang baru.' });
    }

    const secret = this.mfaCrypto.generateSecret();
    const sealed = this.mfaCrypto.encryptSecret(secret);
    const expiry = new Date(now + PENDING_TTL_MS);
    await this.repository.upsertPending({
      userId,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      pendingExpiresAt: expiry,
    });

    // Email is loaded from the session-owned account record; no caller-supplied identity.
    const user = await this.users.findActiveById(userId);
    if (!user) throw this.invalidFactor();
    return {
      provisioningUri: this.mfaCrypto.buildOtpauthUri(secret, user.emailNormalized, 'SAP'),
      expiresAt: expiry.toISOString(),
    };
  }

  /** Confirm setup by proving possession; activation + recovery hashes are atomic. */
  async confirmEnrollment(userId: string, code: string, reauthenticatedAt: Date | null, now = Date.now()): Promise<MfaRecoveryReveal> {
    this.assertAvailable();
    this.assertFreshReauth(reauthenticatedAt, now);
    await this.assertAccountAttempt(userId, now);
    const factor = await this.repository.getFactor(userId);
    if (!factor || factor.state !== 'pending' || !factor.pendingExpiresAt || factor.pendingExpiresAt.getTime() <= now) {
      throw this.invalidFactor();
    }
    const step = this.verifyFactorCode(factor, code, now);
    if (step === null) {
      throw this.invalidFactor();
    }
    const codes = this.mfaCrypto.generateRecoveryCodes();
    const hashes = codes.map((item) => this.mfaCrypto.hashRecoveryCode(item));
    const activated = await this.repository.completeEnrollment(userId, step, hashes);
    if (!activated) throw this.invalidFactor();
    await this.repository.clearLoginLimit(userId);
    // Enrollment transaction already revokes sessions while holding the user lock.
    return { recoveryCodes: codes };
  }

  /**
   * Password-login second phase. The returned value is opaque, purpose-scoped,
   * short-lived, and only its keyed hash is persisted. This method does not issue
   * a session cookie/token.
   */
  async issuePreauth(userId: string, now = Date.now()): Promise<MfaPreauthToken> {
    this.assertAvailable();
    if (!(await this.isActive(userId))) throw this.invalidFactor();
    const generated = this.mfaCrypto.generatePreauthToken();
    const expires = new Date(now + PREAUTH_TTL_MS);
    await this.repository.createPreauth({ tokenHash: generated.hash, userId, expiresAt: expires });
    return { token: generated.token, expiresAt: expires.toISOString() };
  }

  /** Verify password-login TOTP OR one recovery code, then and only then create session. */
  async completeLogin(input: {
    preauthToken: string;
    code: string;
    now?: number;
  }): Promise<SessionResult> {
    this.assertAvailable();
    const now = input.now ?? Date.now();
    const tokenHash = this.mfaCrypto.hashPreauthToken(input.preauthToken);
    const preauth = await this.repository.findPreauth(tokenHash);
    if (!preauth || preauth.consumedAt || preauth.expiresAt.getTime() <= now || preauth.attempts >= MAX_LOGIN_ATTEMPTS) {
      throw this.invalidFactor();
    }
    // Account-wide limiter runs before any code cryptography (plan ACCOUNT-R3).
    await this.assertAccountAttempt(preauth.userId, now);
    if (!(await this.repository.claimPreauthAttempt(tokenHash, preauth.userId, new Date(now)))) {
      throw this.invalidFactor();
    }

    const factor = await this.repository.getFactor(preauth.userId);
    if (!factor || factor.state !== 'active') throw this.invalidFactor();
    let accepted = false;
    const step = this.verifyFactorCode(factor, input.code, now);
    if (step !== null) {
      accepted = await this.repository.completePreauthWithTotp({ tokenHash, userId: preauth.userId, step });
    } else {
      const codeHash = this.mfaCrypto.hashRecoveryCode(input.code);
      accepted = await this.repository.completePreauthWithRecovery({ tokenHash, userId: preauth.userId, codeHash });
    }
    if (!accepted) {
      throw this.invalidFactor();
    }

    await this.repository.clearLoginLimit(preauth.userId);
    const user = await this.users.findActiveById(preauth.userId);
    if (!user || !user.emailVerifiedAt) throw this.invalidFactor();
    const token = this.sessionService.createToken();
    const created = await this.repository.createSessionWhileMfaActive({
      userId: user.id,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
    });
    if (!created) throw this.invalidFactor();
    return { user: toUserView(user), sessionToken: token.token, sessionTokenHash: token.tokenHash };
  }

  /**
   * Regenerate codes after recent password reauthentication AND current TOTP
   * proof. Codes replace atomically and plaintext is returned only in this result.
   */
  async regenerateRecoveryCodes(input: {
    userId: string;
    reauthenticatedAt: Date | null;
    currentTotpCode: string;
    now?: number;
  }): Promise<MfaRecoveryReveal> {
    this.assertAvailable();
    const now = input.now ?? Date.now();
    this.assertFreshReauth(input.reauthenticatedAt, now);
    await this.requireCurrentTotp(input.userId, input.currentTotpCode, now);
    const codes = this.mfaCrypto.generateRecoveryCodes();
    const replaced = await this.repository.replaceRecoveryCodesAndRevokeSessions(
      input.userId,
      codes.map((code) => this.mfaCrypto.hashRecoveryCode(code)),
    );
    if (!replaced) throw this.invalidFactor();
    return { recoveryCodes: codes };
  }

  /** Disable requires fresh password reauth + current TOTP; revoke every session. */
  async disable(input: {
    userId: string;
    reauthenticatedAt: Date | null;
    currentTotpCode: string;
    now?: number;
  }): Promise<void> {
    this.assertAvailable();
    const now = input.now ?? Date.now();
    this.assertFreshReauth(input.reauthenticatedAt, now);
    // requireCurrentTotp proves possession and advances the replay step; the
    // factor is then torn down with its sessions in one transaction.
    await this.requireCurrentTotp(input.userId, input.currentTotpCode, now);
    if (!(await this.repository.disableActiveFactor(input.userId))) {
      throw this.invalidFactor();
    }
  }

  private async requireCurrentTotp(userId: string, code: string, now: number): Promise<void> {
    await this.assertAccountAttempt(userId, now);
    const factor = await this.repository.getFactor(userId);
    if (!factor || factor.state !== 'active') throw this.invalidFactor();
    const step = this.verifyFactorCode(factor, code, now);
    if (step === null || !(await this.repository.advanceStep(userId, step))) {
      throw this.invalidFactor();
    }
    await this.repository.clearLoginLimit(userId);
  }

  private verifyFactorCode(factor: MfaFactorRecord, code: string, now: number): number | null {
    let secret: Buffer;
    try {
      secret = this.mfaCrypto.decryptSecret(this.toSealed(factor));
    } catch {
      // Corrupt ciphertext / wrong key fails closed without leaking crypto details.
      return null;
    }
    return this.mfaCrypto.verifyTotp(secret, code, now);
  }

  private toSealed(factor: MfaFactorRecord): SealedSecret {
    return {
      ciphertext: factor.secretCiphertext,
      iv: factor.secretIv,
      tag: factor.secretTag,
    };
  }

  private async assertAccountAttempt(userId: string, now: number): Promise<void> {
    const allowed = await this.repository.claimAccountLoginAttempt(userId, new Date(now));
    if (!allowed) throw this.invalidFactor();
  }

  private assertFreshReauth(reauthenticatedAt: Date | null, now: number): void {
    if (!reauthenticatedAt || now - reauthenticatedAt.getTime() > REAUTH_WINDOW_MS || reauthenticatedAt.getTime() > now) {
      throw new ForbiddenException({ code: 'REAUTH_REQUIRED', message: 'Reautentikasi terbaru diperlukan.' });
    }
  }

  private assertAvailable(): void {
    if (!this.config.MFA_TOTP_ENABLED) {
      throw new ServiceUnavailableException({ code: 'MFA_UNAVAILABLE', message: 'Autentikasi dua faktor belum tersedia.' });
    }
  }

  private invalidFactor(): ForbiddenException {
    return new ForbiddenException({ code: 'MFA_INVALID', message: INVALID_FACTOR_MESSAGE });
  }
}

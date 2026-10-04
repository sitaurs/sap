import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SessionService } from '../session/session.service.js';
import { SessionRepository } from '../session/session.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { MediaRepository } from '../media/media.repository.js';
import { AuthCryptoService } from './auth-crypto.js';
import type { ChallengePurpose, ChallengeRecord, DeletionRecord, UserRecord, UserView } from './auth.types.js';
import { toUserView } from './auth.types.js';
import { ChallengeRepository, MAX_CHALLENGE_ATTEMPTS } from './challenge.repository.js';
import { DeletionRepository } from './deletion.repository.js';
import { MailerService } from './mailer.service.js';
import { OutboxRepository } from './outbox.repository.js';
import { PasswordService } from './password.service.js';
import { ORPHAN_TTL_MS } from '../media/media.service.js';
import { MfaService } from './mfa.service.js';

const OTP_TTL_MS = 10 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const REAUTH_WINDOW_MS = 10 * 60 * 1_000;
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const CHALLENGE_MESSAGE = 'Jika akun memenuhi syarat, kode verifikasi telah dikirim ke email tersebut.';

export interface ChallengeResult {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
  message: string;
}

export interface AckResult {
  message: string;
}

export interface DeletionResult {
  requestId: string;
  status: DeletionRecord['status'];
  requestedAt: string;
  completedAt: string | null;
}

/** A newly established session; the raw token is handed to the controller to set the cookie. */
export interface SessionResult {
  user: UserView;
  sessionToken: string;
  sessionTokenHash: string;
}

/**
 * Login stopped at the first factor: the account has an active TOTP factor, so no
 * session is issued. The client must call POST /auth/mfa/login with the preauth
 * token and a code to obtain a session.
 */
export interface MfaRequiredResult {
  mfaRequired: true;
  preauthToken: string;
  expiresAt: string;
}

/** Password-login outcome: either a live session or a pending second factor. */
export type LoginOutcome = SessionResult | MfaRequiredResult;

/** Discriminates the login union without leaking token internals to callers. */
export function isMfaRequired(outcome: LoginOutcome): outcome is MfaRequiredResult {
  return 'mfaRequired' in outcome;
}

export interface DeleteAccountResult {
  deletion: DeletionResult;
  receiptToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionRepository,
    private readonly sessionService: SessionService,
    private readonly challenges: ChallengeRepository,
    private readonly deletions: DeletionRepository,
    private readonly outbox: OutboxRepository,
    private readonly passwords: PasswordService,
    private readonly crypto: AuthCryptoService,
    private readonly mailer: MailerService,
    private readonly media: MediaRepository,
    private readonly mfa: MfaService,
  ) {}

  async register(input: { displayName: string; email: string; password: string }): Promise<ChallengeResult> {
    const email = this.crypto.normalizeEmail(input.email);
    const emailHash = this.crypto.hashEmail(email);
    const existing = await this.users.findActiveByEmail(email);
    const passwordHash = await this.passwords.hash(input.password);

    // Verified account already owns this address: return an indistinguishable
    // dummy challenge so registration cannot be used to enumerate accounts.
    if (existing?.emailVerifiedAt) {
      return this.dummyChallenge();
    }

    let userId: string;
    if (existing) {
      await this.users.refreshUnverified(existing.id, { passwordHash, displayName: input.displayName });
      userId = existing.id;
    } else {
      const created = await this.users.createUnverified({ emailNormalized: email, passwordHash, displayName: input.displayName });
      userId = created.id;
    }

    return this.issueChallenge({ userId, email, emailHash, purpose: 'verify_email' });
  }

  async resendVerification(input: { email: string }): Promise<ChallengeResult> {
    const email = this.crypto.normalizeEmail(input.email);
    const emailHash = this.crypto.hashEmail(email);
    const user = await this.users.findActiveByEmail(email);
    if (!user || user.emailVerifiedAt) {
      // Unknown, or already verified: nothing to resend, but stay non-enumerable.
      return this.dummyChallenge();
    }
    return this.issueChallenge({ userId: user.id, email, emailHash, purpose: 'verify_email' });
  }

  async verifyEmail(input: { challengeId: string; code: string }): Promise<SessionResult> {
    const challenge = await this.consumeChallenge(input.challengeId, input.code, 'verify_email');
    if (!challenge.userId) throw this.invalidChallenge();
    await this.users.markEmailVerified(challenge.userId);
    const user = await this.users.findActiveById(challenge.userId);
    if (!user) throw this.invalidChallenge();
    return this.startSession(user);
  }

  async login(input: { email: string; password: string }): Promise<LoginOutcome> {
    const email = this.crypto.normalizeEmail(input.email);
    const user = await this.users.findActiveByEmail(email);
    const valid = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || !valid) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Email atau kata sandi salah.' });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({ code: 'EMAIL_UNVERIFIED', message: 'Email belum diverifikasi.' });
    }
    // Second factor gate: an active TOTP factor means the password alone is not
    // enough. Session creation and enrollment activation serialize on the user
    // row, so a stale MFA check can never mint a password-only session afterward.
    if (await this.mfa.isActive(user.id)) {
      const preauth = await this.mfa.issuePreauth(user.id);
      return { mfaRequired: true, preauthToken: preauth.token, expiresAt: preauth.expiresAt };
    }
    const token = this.sessionService.createToken();
    const created = await this.sessions.createIfMfaDisabled({
      userId: user.id,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
    });
    if (!created) {
      const preauth = await this.mfa.issuePreauth(user.id);
      return { mfaRequired: true, preauthToken: preauth.token, expiresAt: preauth.expiresAt };
    }
    return { user: toUserView(user), sessionToken: token.token, sessionTokenHash: token.tokenHash };
  }

  async forgotPassword(input: { email: string }): Promise<ChallengeResult> {
    const email = this.crypto.normalizeEmail(input.email);
    const emailHash = this.crypto.hashEmail(email);
    const user = await this.users.findActiveByEmail(email);
    if (!user || !user.emailVerifiedAt) {
      return this.dummyChallenge();
    }
    return this.issueChallenge({ userId: user.id, email, emailHash, purpose: 'reset_password' });
  }

  async resetPassword(input: { challengeId: string; code: string; newPassword: string }): Promise<AckResult> {
    const challenge = await this.validatedChallenge(input.challengeId, input.code, 'reset_password');
    if (!challenge.userId) throw this.invalidChallenge();
    const passwordHash = await this.passwords.hash(input.newPassword);
    // Consume the challenge, update the password and revoke sessions together;
    // a database failure cannot strand a consumed OTP without resetting the account.
    const completed = await this.challenges.completePasswordReset({
      challengeId: challenge.id,
      userId: challenge.userId,
      passwordHash,
    });
    if (!completed) throw this.invalidChallenge();
    return { message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.' };
  }

  async logout(sessionTokenHash: string): Promise<AckResult> {
    await this.sessions.deleteByTokenHash(sessionTokenHash);
    return { message: 'Anda telah keluar.' };
  }

  async reauthenticate(userId: string, sessionTokenHash: string, password: string): Promise<AckResult> {
    const user = await this.users.findActiveById(userId);
    const valid = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !valid) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Kata sandi salah.' });
    }
    await this.sessions.markReauthenticated(sessionTokenHash);
    return { message: 'Reautentikasi berhasil.' };
  }

  /**
   * Change the password of the signed-in account. The current password is
   * verified first; the new one must differ. On success every other session is
   * revoked (other devices are logged out) while the caller's current session
   * stays valid, so an in-app change does not boot the user mid-action.
   */
  async changePassword(userId: string, sessionTokenHash: string, currentPassword: string, newPassword: string): Promise<AckResult> {
    const user = await this.users.findActiveById(userId);
    const valid = await this.passwords.verify(user?.passwordHash, currentPassword);
    if (!user || !valid) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Kata sandi saat ini salah.' });
    }
    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Kata sandi baru harus berbeda dari yang sekarang.' });
    }
    const passwordHash = await this.passwords.hash(newPassword);
    const changed = await this.sessions.changePasswordAndRevokeOthers({ userId, keepTokenHash: sessionTokenHash, passwordHash });
    if (!changed) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    }
    return { message: 'Kata sandi berhasil diperbarui. Sesi di perangkat lain telah keluar.' };
  }

  async updateDisplayName(userId: string, displayName: string): Promise<UserView> {
    const updated = await this.users.updateDisplayName(userId, displayName);
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });
    return toUserView(updated);
  }

  /**
   * Attach a stored `avatar` media object to the signed-in account, or clear the
   * photo with `mediaId = null`. The object must be owned by the caller and have
   * purpose `avatar`; on attach its orphan TTL is cleared so cleanup keeps it,
   * and any previously attached photo is re-armed for cleanup.
   */
  async setAvatar(userId: string, mediaId: string | null): Promise<UserView> {
    const current = await this.users.findActiveById(userId);
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });

    if (mediaId !== null) {
      const media = await this.media.findStoredForOwner(mediaId, userId);
      if (!media || media.purpose !== 'avatar') {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Foto profil tidak ditemukan atau bukan milik Anda.' });
      }
      // Persist the new object so the orphan cleanup job leaves it alone.
      await this.media.clearExpiry(mediaId, userId);
    }

    // Re-arm cleanup on the photo being replaced/removed so it is reclaimed.
    if (current.avatarMediaId && current.avatarMediaId !== mediaId) {
      await this.media.scheduleExpiry(current.avatarMediaId, userId, new Date(Date.now() + ORPHAN_TTL_MS));
    }

    const updated = await this.users.updateAvatar(userId, mediaId);
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });
    return toUserView(updated);
  }

  /** Persist the SAPA preference for the session owner; returns just the flag. */
  async updateSapaPreference(userId: string, sapaEnabled: boolean): Promise<{ sapaEnabled: boolean }> {
    const updated = await this.users.updateSapaEnabled(userId, sapaEnabled);
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Akun tidak ditemukan.' });
    return { sapaEnabled: updated.sapaEnabled };
  }

  async deleteAccount(input: { userId: string; reauthenticatedAt: Date | null }): Promise<DeleteAccountResult> {
    if (!this.isReauthFresh(input.reauthenticatedAt)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Reautentikasi diperlukan sebelum menghapus akun.' });
    }
    const subjectHash = this.crypto.hashSubject(input.userId);
    const receipt = this.crypto.generateReceipt();
    const receiptExpiresAt = new Date(Date.now() + RECEIPT_TTL_MS);
    const deletion = await this.deletions.create({
      userId: input.userId,
      subjectHash,
      receiptHash: receipt.hash,
      receiptExpiresAt,
    });
    return { deletion: this.toDeletionResult(deletion), receiptToken: receipt.token };
  }

  async getDeletionStatus(receiptToken: string): Promise<DeletionResult> {
    const receiptHash = this.crypto.hashReceipt(receiptToken);
    const deletion = await this.deletions.findByReceiptHash(receiptHash);
    if (!deletion) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Permintaan penghapusan tidak ditemukan.' });
    return this.toDeletionResult(deletion);
  }

  private async startSession(user: UserRecord): Promise<SessionResult> {
    const token = this.sessionService.createToken();
    await this.sessions.create({ userId: user.id, tokenHash: token.tokenHash, expiresAt: token.expiresAt });
    return { user: toUserView(user), sessionToken: token.token, sessionTokenHash: token.tokenHash };
  }

  /**
   * Create-or-reuse an OTP challenge. If a still-valid challenge exists within the
   * resend cooldown, it is returned unchanged (no new email) with the remaining
   * seconds, which is how the client learns when it may request another code.
   */
  private async issueChallenge(input: { userId: string; email: string; emailHash: string; purpose: ChallengePurpose }): Promise<ChallengeResult> {
    const code = this.crypto.generateOtp();
    const issued = await this.challenges.createOrReuse({
      userId: input.userId,
      emailHash: input.emailHash,
      purpose: input.purpose,
      codeHash: this.crypto.hashOtp(code),
      ttlMs: OTP_TTL_MS,
      resendCooldownMs: RESEND_COOLDOWN_MS,
    });
    if (issued.created) await this.mailer.sendOtp(input.email, code, input.purpose);
    return this.toChallengeResult(issued.challenge);
  }

  /** Validate + atomically consume a challenge, enforcing expiry and the attempt cap. */
  private async consumeChallenge(challengeId: string, code: string, purpose: ChallengePurpose): Promise<ChallengeRecord> {
    const challenge = await this.validatedChallenge(challengeId, code, purpose);
    const consumed = await this.challenges.consume(challenge.id);
    if (!consumed) throw this.invalidChallenge();
    return challenge;
  }

  /** Validate the code before a separate transactional completion step. */
  private async validatedChallenge(challengeId: string, code: string, purpose: ChallengePurpose): Promise<ChallengeRecord> {
    const challenge = await this.challenges.findById(challengeId);
    const now = Date.now();
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= now ||
      challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
    ) {
      throw this.invalidChallenge();
    }
    if (!this.crypto.safeEqual(challenge.codeHash, this.crypto.hashOtp(code))) {
      await this.challenges.incrementAttempts(challenge.id);
      throw this.invalidChallenge();
    }
    return challenge;
  }

  private dummyChallenge(): ChallengeResult {
    return {
      challengeId: randomUUID(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      retryAfterSeconds: Math.floor(RESEND_COOLDOWN_MS / 1_000),
      message: CHALLENGE_MESSAGE,
    };
  }

  private toChallengeResult(challenge: ChallengeRecord): ChallengeResult {
    const remainingMs = challenge.resendAfter ? challenge.resendAfter.getTime() - Date.now() : 0;
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      retryAfterSeconds: Math.max(0, Math.ceil(remainingMs / 1_000)),
      message: CHALLENGE_MESSAGE,
    };
  }

  private toDeletionResult(deletion: DeletionRecord): DeletionResult {
    return {
      requestId: deletion.id,
      status: deletion.status,
      requestedAt: deletion.requestedAt.toISOString(),
      completedAt: deletion.completedAt ? deletion.completedAt.toISOString() : null,
    };
  }

  private isReauthFresh(reauthenticatedAt: Date | null): boolean {
    return reauthenticatedAt !== null && Date.now() - reauthenticatedAt.getTime() <= REAUTH_WINDOW_MS;
  }

  private invalidChallenge(): BadRequestException {
    return new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Kode verifikasi tidak valid atau telah kedaluwarsa.' });
  }
}

import { Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Keyed hashing + token generation for the auth flows. All at-rest digests are
 * HMAC-SHA256 under SESSION_SECRET with a per-use domain-separation label, so a
 * database leak alone does not let an attacker reverse low-entropy values such
 * as the 6-digit OTP or an email address. Comparisons are constant-time.
 */
@Injectable()
export class AuthCryptoService {
  private readonly config = getConfig();

  /** RFC-ish email normalisation: trim + lowercase. Uniqueness key for accounts. */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Deterministic keyed digest of a normalised email (for auth_challenges.email_hash). */
  hashEmail(normalizedEmail: string): string {
    return this.digest('email', normalizedEmail);
  }

  /** A single-use 6-digit numeric OTP (contract pattern ^[0-9]{6}$). */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  hashOtp(code: string): string {
    return this.digest('otp', code);
  }

  /** Opaque deletion receipt token + its at-rest digest. */
  generateReceipt(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashReceipt(token) };
  }

  hashReceipt(token: string): string {
    return this.digest('deletion-receipt', token);
  }

  /** Stable pseudonymisation key for a user (deletion tombstones, B-11). */
  hashSubject(userId: string): string {
    return this.digest('deletion-subject', userId);
  }

  safeEqual(actual: string, expected: string): boolean {
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private digest(label: string, value: string): string {
    return createHmac('sha256', this.config.SESSION_SECRET).update(label).update('\0').update(value).digest('hex');
  }
}

import { Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { SealedSecret } from './mfa.types.js';

/** RFC 6238 pinned parameters — never widen the window; clock skew is an NTP problem. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** +/- one step tolerance only (NIST SP 800-63 / plan ACCOUNT-R3). */
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20; // 160-bit seed
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 10; // 80 bits of entropy per code, over the ~60-bit floor
const GCM_IV_BYTES = 12;
/** RFC 4648 base32 alphabet, used for the otpauth secret + recovery codes. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * TOTP + at-rest crypto for MFA. The seed is encrypted with AES-256-GCM under a
 * dedicated key (never SESSION_SECRET); recovery codes are keyed-hashed. Nothing
 * here logs or returns a plaintext seed except the one-time enrollment reveal.
 */
@Injectable()
export class MfaCryptoService {
  private readonly config = getConfig();

  /** Generate a fresh 160-bit seed as raw bytes. */
  generateSecret(): Buffer {
    return randomBytes(SECRET_BYTES);
  }

  /** Base32 (no padding) encoding of the seed for the otpauth:// URI / QR. */
  encodeSecret(secret: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of secret) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
  }

  /**
   * Build the otpauth:// provisioning URI. Label/issuer are URL-encoded. Only
   * ever shown once during enrollment; never persisted or logged.
   */
  buildOtpauthUri(secret: Buffer, accountLabel: string, issuer: string): string {
    const params = new URLSearchParams({
      secret: this.encodeSecret(secret),
      issuer,
      algorithm: 'SHA1',
      digits: String(TOTP_DIGITS),
      period: String(TOTP_STEP_SECONDS),
    });
    const label = encodeURIComponent(`${issuer}:${accountLabel}`);
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** The RFC 6238 time-step for a given epoch-ms instant. */
  currentStep(now: number = Date.now()): number {
    return Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  }

  /** RFC 4226 HOTP for a counter, formatted to TOTP_DIGITS. */
  private hotp(secret: Buffer, counter: number): string {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', secret).update(buffer).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);
    return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
  }

  /** Compute the TOTP for an explicit step (used for tests / matching). */
  totpForStep(secret: Buffer, step: number): string {
    return this.hotp(secret, step);
  }

  /**
   * Verify a candidate code against the +/-1 window. Returns the matched step so
   * the caller can enforce monotonic replay protection; null when nothing matches.
   */
  verifyTotp(secret: Buffer, code: string, now: number = Date.now()): number | null {
    const trimmed = code.trim();
    if (!/^[0-9]{6}$/.test(trimmed)) return null;
    const center = this.currentStep(now);
    for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
      const step = center + offset;
      if (step < 0) continue;
      if (this.constantTimeEqual(this.hotp(secret, step), trimmed)) return step;
    }
    return null;
  }

  /** Encrypt a raw seed with AES-256-GCM under the dedicated MFA key. */
  encryptSecret(secret: Buffer): SealedSecret {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
    };
  }

  /** Decrypt a sealed seed; throws (GCM tag failure) on tamper/wrong key. */
  decryptSecret(sealed: SealedSecret): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(sealed.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'hex')), decipher.final()]);
  }

  /** A fresh batch of human-friendly single-use recovery codes (shown once). */
  generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
      const raw = this.encodeSecret(randomBytes(RECOVERY_CODE_BYTES)).slice(0, 10);
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return codes;
  }

  /** Normalize (strip separators + upper) so display formatting is irrelevant. */
  normalizeRecoveryCode(code: string): string {
    return code.replace(/[\s-]/g, '').toUpperCase();
  }

  /** Keyed hash of a recovery code for at-rest storage (codes are high-entropy). */
  hashRecoveryCode(code: string): string {
    return createHmac('sha256', this.config.SESSION_SECRET)
      .update('mfa-recovery')
      .update('\0')
      .update(this.normalizeRecoveryCode(code))
      .digest('hex');
  }

  /** Opaque pre-auth login token + its at-rest digest (raw token never stored). */
  generatePreauthToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashPreauthToken(token) };
  }

  hashPreauthToken(token: string): string {
    return createHmac('sha256', this.config.SESSION_SECRET)
      .update('mfa-preauth')
      .update('\0')
      .update(token)
      .digest('hex');
  }

  private key(): Buffer {
    const hex = this.config.MFA_TOTP_ENCRYPTION_KEY;
    if (!hex) throw new Error('MFA_TOTP_ENCRYPTION_KEY is not configured');
    return Buffer.from(hex, 'hex');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

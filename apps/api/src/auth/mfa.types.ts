/**
 * Types for optional TOTP MFA (SAP_FEATURE_PLAN.md §7 ACCOUNT-R3). All secrets
 * live encrypted at rest; recovery codes as keyed hashes only. None of these
 * shapes ever carries the plaintext seed, provisioning URI, or a recovery code
 * back out beyond the single enrollment/regeneration reveal.
 */

export type MfaState = 'pending' | 'active';

/** Public enrollment status; 'disabled' means no factor row exists. */
export type MfaStatus = 'disabled' | MfaState;

/** Encrypted TOTP factor as stored. The seed is only ever AES-256-GCM ciphertext. */
export interface MfaFactorRecord {
  userId: string;
  state: MfaState;
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  lastAcceptedStep: number | null;
  pendingExpiresAt: Date | null;
}

export interface MfaRecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  consumedAt: Date | null;
}

export interface MfaPreauthRecord {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export interface MfaLoginLimitRecord {
  userId: string;
  windowStartedAt: Date;
  attempts: number;
  lockedUntil: Date | null;
}

/** Sealed secret payload produced by MfaCryptoService.encryptSecret. */
export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

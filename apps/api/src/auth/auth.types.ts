export type UserRole = 'user' | 'admin';
export type ChallengePurpose = 'verify_email' | 'reset_password';
export type DeletionStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface UserRecord {
  id: string;
  emailNormalized: string;
  passwordHash: string | null;
  displayName: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date | null;
  reauthenticatedAt: Date | null;
}

export interface ChallengeRecord {
  id: string;
  userId: string | null;
  emailHash: string;
  purpose: ChallengePurpose;
  codeHash: string;
  attempts: number;
  resendAfter: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface DeletionRecord {
  id: string;
  userId: string | null;
  status: DeletionStatus;
  requestedAt: Date;
  completedAt: Date | null;
}

/** Public User projection (contract schema `User`). Never carries the password hash. */
export interface UserView {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

export function toUserView(user: UserRecord): UserView {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.emailNormalized,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

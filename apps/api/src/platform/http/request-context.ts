import type { Request } from 'express';

/** The authenticated principal resolved from a session cookie. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
}

/** The session row backing the current request, resolved by the auth guard. */
export interface AuthenticatedSession {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  reauthenticatedAt: Date | null;
}

export interface SapRequest extends Request {
  requestId: string;
  sessionTokenHash?: string;
  user?: AuthenticatedUser;
  session?: AuthenticatedSession;
}

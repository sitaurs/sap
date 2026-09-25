import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SapRequest } from '../platform/http/request-context.js';
import { SessionRepository } from '../session/session.repository.js';

/**
 * Authenticates requests that carry a `sap_session` cookie. The middleware in
 * bootstrap has already derived `request.sessionTokenHash` from the cookie; this
 * guard resolves it to a live session + owner and attaches them to the request.
 *
 * - No session token at all           -> 401 AUTH_REQUIRED
 * - Token present but no live session  -> 401 SESSION_EXPIRED (expired/revoked)
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SapRequest>();
    const tokenHash = request.sessionTokenHash;
    if (!tokenHash) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Authentication is required.' });
    }

    const resolved = await this.sessions.resolveActive(tokenHash);
    if (!resolved) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired.' });
    }

    request.user = {
      id: resolved.user.id,
      email: resolved.user.emailNormalized,
      displayName: resolved.user.displayName,
      role: resolved.user.role,
      emailVerified: resolved.user.emailVerifiedAt !== null,
    };
    request.session = {
      id: resolved.session.id,
      tokenHash: resolved.session.tokenHash,
      expiresAt: resolved.session.expiresAt,
      reauthenticatedAt: resolved.session.reauthenticatedAt,
    };
    return true;
  }
}

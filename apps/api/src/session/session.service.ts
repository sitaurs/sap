import { Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import type { NextFunction, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { parseCookies, serializeCookie } from '../platform/http/cookies.js';
import type { SapRequest } from '../platform/http/request-context.js';

export const SESSION_COOKIE = 'sap_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class SessionService {
  private readonly config = getConfig();

  attach(request: SapRequest, _response: Response, next: NextFunction): void {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) request.sessionTokenHash = this.hashToken(token);
    next();
  }

  createToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1_000),
    };
  }

  cookie(token: string): string {
    return serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_SECONDS, httpOnly: true });
  }

  clearCookie(): string {
    return serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0, httpOnly: true });
  }

  hashToken(token: string): string {
    return createHash('sha256').update(this.config.SESSION_SECRET).update('\0').update(token).digest('hex');
  }
}

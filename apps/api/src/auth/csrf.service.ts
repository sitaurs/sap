import { Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { serializeCookie } from '../platform/http/cookies.js';

export const CSRF_COOKIE = 'sap_csrf';
const CSRF_TTL_SECONDS = 60 * 60;

@Injectable()
export class CsrfService {
  private readonly config = getConfig();

  issue(sessionTokenHash?: string): { token: string; expiresAt: Date; cookie: string } {
    const expiresAt = new Date(Date.now() + CSRF_TTL_SECONDS * 1_000);
    const payload = [randomBytes(32).toString('base64url'), Math.floor(expiresAt.getTime() / 1_000), this.binding(sessionTokenHash)].join('.');
    const token = `${payload}.${this.sign(payload)}`;
    return {
      token,
      expiresAt,
      cookie: serializeCookie(CSRF_COOKIE, token, { maxAgeSeconds: CSRF_TTL_SECONDS, httpOnly: true }),
    };
  }

  verify(token: string, sessionTokenHash?: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 4) return false;
    const [nonce, expiry, binding, signature] = parts;
    if (!nonce || !expiry || !binding || !signature) return false;
    const expirySeconds = Number(expiry);
    if (!Number.isInteger(expirySeconds) || expirySeconds <= Math.floor(Date.now() / 1_000)) return false;
    if (!this.safeEqual(binding, this.binding(sessionTokenHash))) return false;
    return this.safeEqual(signature, this.sign(`${nonce}.${expiry}.${binding}`));
  }

  private binding(sessionTokenHash?: string): string {
    return createHmac('sha256', this.config.CSRF_SECRET).update(sessionTokenHash ?? 'pre-auth').digest('base64url');
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.CSRF_SECRET).update(payload).digest('base64url');
  }

  private safeEqual(actual: string, expected: string): boolean {
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

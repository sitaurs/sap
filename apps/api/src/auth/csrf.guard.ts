import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { parseCookies } from '../platform/http/cookies.js';
import type { SapRequest } from '../platform/http/request-context.js';
import { CSRF_COOKIE, CsrfService } from './csrf.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly config = getConfig();
  private readonly allowedOrigins = new Set(
    [this.config.APP_ORIGIN, ...this.config.APP_ORIGIN_ALIASES].map((value) => new URL(value).origin),
  );
  private readonly logger = new Logger(CsrfGuard.name);

  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SapRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.header('origin');
    const header = request.header('x-csrf-token');
    const cookie = parseCookies(request.headers.cookie)[CSRF_COOKIE];
    if (!origin || !this.allowedOrigins.has(origin) || !header || !cookie || header !== cookie || !this.csrf.verify(header, request.sessionTokenHash)) {
      // Redacted diagnostics: log why the check failed without ever emitting the
      // token values. Origin mismatch is the most common deploy-time cause, so
      // record received vs expected origin to make APP_ORIGIN misconfig obvious.
      if (!origin || !this.allowedOrigins.has(origin)) {
        this.logger.warn(`CSRF rejected: origin mismatch received=${origin ?? '<none>'} expected=${[...this.allowedOrigins].join(',')}`);
      } else {
        this.logger.warn(`CSRF rejected: token check failed (header=${header ? 'present' : 'missing'} cookie=${cookie ? 'present' : 'missing'})`);
      }
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'CSRF validation failed.' });
    }
    return true;
  }
}

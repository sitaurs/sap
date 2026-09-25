import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { parseCookies } from '../platform/http/cookies.js';
import type { SapRequest } from '../platform/http/request-context.js';
import { CSRF_COOKIE, CsrfService } from './csrf.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly config = getConfig();

  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SapRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.header('origin');
    const header = request.header('x-csrf-token');
    const cookie = parseCookies(request.headers.cookie)[CSRF_COOKIE];
    if (origin !== this.config.APP_ORIGIN || !header || !cookie || header !== cookie || !this.csrf.verify(header, request.sessionTokenHash)) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'CSRF validation failed.' });
    }
    return true;
  }
}

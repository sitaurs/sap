import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { SapRequest } from '../platform/http/request-context.js';

/**
 * Authorises admin-only routes. Runs after {@link SessionAuthGuard} (which
 * attaches `request.user`); a non-admin principal is rejected with 403 FORBIDDEN.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SapRequest>();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Admin role is required.' });
    }
    return true;
  }
}

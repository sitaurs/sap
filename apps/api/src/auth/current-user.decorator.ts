import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedSession, AuthenticatedUser, SapRequest } from '../platform/http/request-context.js';

/** Resolves the authenticated principal attached by SessionAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<SapRequest>();
  if (!request.user) {
    throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Authentication is required.' });
  }
  return request.user;
});

/** Resolves the authenticated session attached by SessionAuthGuard. */
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedSession => {
  const request = context.switchToHttp().getRequest<SapRequest>();
  if (!request.session) {
    throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Authentication is required.' });
  }
  return request.session;
});

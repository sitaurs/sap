import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { SapRequest } from '../platform/http/request-context.js';
import { CsrfService } from './csrf.service.js';

@Controller('auth/csrf')
export class CsrfController {
  constructor(private readonly csrf: CsrfService) {}

  @Get()
  getCsrf(@Req() request: SapRequest, @Res({ passthrough: true }) response: Response) {
    const issued = this.csrf.issue(request.sessionTokenHash);
    response.setHeader('Set-Cookie', issued.cookie);
    return { csrfToken: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }
}

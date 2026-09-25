import { Controller, Get, NotFoundException, Req } from '@nestjs/common';
import type { SapRequest } from '../platform/http/request-context.js';
import { parseCookies } from '../platform/http/cookies.js';
import { AuthService } from './auth.service.js';
import { DELETION_COOKIE } from './deletion-cookie.js';

@Controller('account-deletion')
export class AccountDeletionController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  getDeletionStatus(@Req() request: SapRequest) {
    const receipt = parseCookies(request.headers.cookie)[DELETION_COOKIE];
    if (!receipt) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Permintaan penghapusan tidak ditemukan.' });
    }
    return this.auth.getDeletionStatus(receipt);
  }
}

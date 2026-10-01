import { Body, Controller, Delete, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedSession, AuthenticatedUser } from '../platform/http/request-context.js';
import { SessionService } from '../session/session.service.js';
import { CsrfService } from './csrf.service.js';
import { CurrentSession, CurrentUser } from './current-user.decorator.js';
import { MfaConfirmInputDto, MfaCurrentCodeInputDto, MfaLoginInputDto } from './dto.js';
import { MfaService } from './mfa.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';

/**
 * TOTP MFA surface (contract v1.1.0). Enrollment/disable/regenerate require a
 * live session AND recent password reauthentication (reused from the session's
 * reauthenticatedAt); identity always comes from the session, never the body.
 * POST /auth/mfa/login is the password-login second phase: it is unauthenticated
 * (no session yet) but CSRF-guarded like every mutation, and is the only place a
 * session is issued for an MFA-protected account.
 */
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly sessionService: SessionService,
    private readonly csrf: CsrfService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async status(@CurrentUser() user: AuthenticatedUser) {
    return { status: await this.mfa.status(user.id) };
  }

  @Post('enroll')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  beginEnrollment(@CurrentUser() user: AuthenticatedUser, @CurrentSession() session: AuthenticatedSession) {
    return this.mfa.beginEnrollment(user.id, session.reauthenticatedAt);
  }

  @Post('enroll/confirm')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  confirmEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: MfaConfirmInputDto,
  ) {
    return this.mfa.confirmEnrollment(user.id, dto.code, session.reauthenticatedAt);
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: MfaCurrentCodeInputDto,
  ) {
    return this.mfa.regenerateRecoveryCodes({
      userId: user.id,
      reauthenticatedAt: session.reauthenticatedAt,
      currentTotpCode: dto.currentTotpCode,
    });
  }

  @Delete()
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: MfaCurrentCodeInputDto,
  ) {
    await this.mfa.disable({
      userId: user.id,
      reauthenticatedAt: session.reauthenticatedAt,
      currentTotpCode: dto.currentTotpCode,
    });
    return { message: 'Autentikasi dua faktor dinonaktifkan.' };
  }

  @Post('login')
  @HttpCode(200)
  async completeLogin(@Body() dto: MfaLoginInputDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.mfa.completeLogin({ preauthToken: dto.preauthToken, code: dto.code });
    // Second factor proven: only now is the session cookie set + CSRF rebound.
    response.setHeader('Set-Cookie', [
      this.sessionService.cookie(result.sessionToken),
      this.csrf.issue(result.sessionTokenHash).cookie,
    ]);
    return result.user;
  }
}

import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedSession, AuthenticatedUser } from '../platform/http/request-context.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { CurrentSession, CurrentUser } from './current-user.decorator.js';
import { EmailInputDto, LoginInputDto, ReauthInputDto, RegisterInputDto, ResetInputDto, VerifyInputDto } from './dto.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionService } from '../session/session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionService: SessionService,
    private readonly csrf: CsrfService,
  ) {}

  @Post('register')
  @HttpCode(202)
  register(@Body() dto: RegisterInputDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyInputDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.verifyEmail(dto);
    this.openSession(response, result.sessionToken, result.sessionTokenHash);
    return result.user;
  }

  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(@Body() dto: EmailInputDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginInputDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    this.openSession(response, result.sessionToken, result.sessionTokenHash);
    return result.user;
  }

  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() dto: EmailInputDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetInputDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  async logout(@CurrentSession() session: AuthenticatedSession, @Res({ passthrough: true }) response: Response) {
    const ack = await this.auth.logout(session.tokenHash);
    this.closeSession(response);
    return ack;
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      sapaEnabled: user.sapaEnabled,
    };
  }

  @Post('reauthenticate')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  reauthenticate(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: ReauthInputDto,
  ) {
    return this.auth.reauthenticate(user.id, session.tokenHash, dto.password);
  }

  /** Set the session cookie and rotate CSRF so it is bound to the new session. */
  private openSession(response: Response, token: string, tokenHash: string): void {
    response.setHeader('Set-Cookie', [this.sessionService.cookie(token), this.csrf.issue(tokenHash).cookie]);
  }

  /** Clear the session cookie and rotate CSRF back to a pre-auth binding. */
  private closeSession(response: Response): void {
    response.setHeader('Set-Cookie', [this.sessionService.clearCookie(), this.csrf.issue(undefined).cookie]);
  }
}

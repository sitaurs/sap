import { Body, Controller, Delete, HttpCode, Patch, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedSession, AuthenticatedUser } from '../platform/http/request-context.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { CurrentSession, CurrentUser } from './current-user.decorator.js';
import { deletionCookie } from './deletion-cookie.js';
import { DeleteInputDto, PreferencesInputDto, ProfileInputDto } from './dto.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionService } from '../session/session.service.js';

@Controller('users')
@UseGuards(SessionAuthGuard)
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionService: SessionService,
    private readonly csrf: CsrfService,
  ) {}

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProfileInputDto) {
    return this.auth.updateDisplayName(user.id, dto.displayName);
  }

  @Patch('me/preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreferencesInputDto) {
    // Identity comes from the verified session, never the body. Only the SAPA
    // preference flag is writable here (addendum v1.1).
    return this.auth.updateSapaPreference(user.id, dto.sapaEnabled);
  }

  @Delete('me')
  @HttpCode(202)
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() _dto: DeleteInputDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.deleteAccount({ userId: user.id, reauthenticatedAt: session.reauthenticatedAt });
    // Issue the deletion receipt cookie; tear down the (now revoked) session.
    response.setHeader('Set-Cookie', [
      deletionCookie(result.receiptToken),
      this.sessionService.clearCookie(),
      this.csrf.issue(undefined).cookie,
    ]);
    return result.deletion;
  }
}

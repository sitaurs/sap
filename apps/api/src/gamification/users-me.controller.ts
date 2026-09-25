import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { GamificationService } from './gamification.service.js';

/**
 * Authenticated per-user gamification reads. Base path `users/me` complements
 * the auth module's profile routes; only the new `stats`/`achievements`
 * sub-paths live here.
 */
@Controller('users/me')
@UseGuards(SessionAuthGuard)
export class UsersMeGamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('stats')
  @HttpCode(200)
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getStats(user.id);
  }

  @Get('achievements')
  @HttpCode(200)
  getAchievements(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getAchievements(user.id);
  }
}

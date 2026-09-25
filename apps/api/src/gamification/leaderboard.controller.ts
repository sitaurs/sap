import { Controller, Get, HttpCode, Query } from '@nestjs/common';
import { LeaderboardQueryDto } from './dto.js';
import { GamificationService } from './gamification.service.js';

/** Public leaderboard (OpenAPI getLeaderboard, security []). No auth guard. */
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly gamification: GamificationService) {}

  @Get()
  @HttpCode(200)
  getLeaderboard(@Query() query: LeaderboardQueryDto) {
    return this.gamification.getLeaderboard(query.limit, query.cursor);
  }
}

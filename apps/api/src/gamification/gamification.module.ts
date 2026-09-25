import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AchievementRepository } from './achievement.repository.js';
import { GamificationService } from './gamification.service.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { StatsRepository } from './stats.repository.js';
import { UsersMeGamificationController } from './users-me.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersMeGamificationController, LeaderboardController],
  providers: [
    GamificationService,
    StatsRepository,
    AchievementRepository,
    LeaderboardRepository,
    SessionRepository,
    SessionAuthGuard,
  ],
  exports: [GamificationService],
})
export class GamificationModule {}

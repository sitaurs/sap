import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AreasModule } from './areas/areas.module.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GamificationModule } from './gamification/gamification.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { DatabaseModule } from './infrastructure/database.module.js';
import { MediaModule } from './media/media.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ScansModule } from './scans/scans.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, MediaModule, ScansModule, GamificationModule, ReportsModule, AdminModule, AreasModule, AssistantModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

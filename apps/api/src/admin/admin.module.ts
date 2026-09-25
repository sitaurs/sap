import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { IdempotencyStore } from '../infrastructure/idempotency.store.js';
import { MediaRepository } from '../media/media.repository.js';
import { ReportRepository } from '../reports/report.repository.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AuditRepository } from './audit.repository.js';
import { ModerationRepository } from './moderation.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    ModerationRepository,
    AuditRepository,
    ReportRepository,
    IdempotencyStore,
    MediaRepository,
    SessionRepository,
    SessionAuthGuard,
    AdminGuard,
  ],
  exports: [AdminService],
})
export class AdminModule {}

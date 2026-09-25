import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { IdempotencyStore } from '../infrastructure/idempotency.store.js';
import { MediaRepository } from '../media/media.repository.js';
import { ScanRepository } from '../scans/scan.repository.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ReportRepository } from './report.repository.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportRepository,
    IdempotencyStore,
    MediaRepository,
    ScanRepository,
    SessionRepository,
    SessionAuthGuard,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}

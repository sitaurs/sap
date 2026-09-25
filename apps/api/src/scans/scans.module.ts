import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { IdempotencyStore } from '../infrastructure/idempotency.store.js';
import { MediaRepository } from '../media/media.repository.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ScanRepository } from './scan.repository.js';
import { ScanQueueService } from './scan-queue.service.js';
import { ScansController } from './scans.controller.js';
import { ScansService } from './scans.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ScansController],
  providers: [
    ScansService,
    ScanRepository,
    ScanQueueService,
    IdempotencyStore,
    MediaRepository,
    SessionRepository,
    SessionAuthGuard,
  ],
  exports: [ScansService],
})
export class ScansModule {}

import { Global, Module } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { SessionRepository } from '../session/session.repository.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { IdempotencyStore } from '../infrastructure/idempotency.store.js';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { ExtensionStore } from './extension.store.js';

@Global()
@Module({ providers: [ExtensionStore, IdempotencyStore, SessionRepository, SessionAuthGuard, AdminGuard, ObjectStorageService],
  exports: [ExtensionStore, SessionAuthGuard, AdminGuard, ObjectStorageService] })
export class ExtensionsModule {}

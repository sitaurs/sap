import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantProvider } from './assistant-provider.js';
import { AssistantService } from './assistant.service.js';
import { AssistantStore } from './assistant-store.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantProvider, AssistantStore, SessionAuthGuard, SessionRepository],
})
export class AssistantModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { GamificationModule } from '../gamification/gamification.module.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AssistantController } from './assistant.controller.js';
import { SapaCorpusRepository } from './assistant-corpus.repository.js';
import { AssistantEmbedder } from './assistant-embedding.js';
import { AssistantProvider } from './assistant-provider.js';
import { AssistantService } from './assistant.service.js';
import { AssistantStatsTool } from './assistant-stats-tool.js';
import { AssistantStore } from './assistant-store.js';
import { HybridRetriever } from './assistant-retrieval.js';

@Module({
  imports: [DatabaseModule, GamificationModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantProvider,
    AssistantStore,
    AssistantEmbedder,
    SapaCorpusRepository,
    HybridRetriever,
    AssistantStatsTool,
    SessionAuthGuard,
    SessionRepository,
  ],
})
export class AssistantModule {}

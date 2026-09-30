import { Module } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { GamificationModule } from '../gamification/gamification.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AreasModule } from '../areas/areas.module.js';
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
import { AssistantTools } from './assistant-tools.js';
import {
  AssistantAgent,
  ASSISTANT_AGENT_EXECUTOR,
  LangGraphAssistantExecutor,
  type AssistantAgentExecutor,
} from './assistant-agent.js';

@Module({
  // ScansModule/ReportsModule/AreasModule/GamificationModule export the read-only
  // domain services AssistantTools depends on. None of them import AssistantModule
  // back, so wiring them here introduces no dependency cycle (no forwardRef needed).
  imports: [DatabaseModule, GamificationModule, ScansModule, ReportsModule, AreasModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantProvider,
    AssistantStore,
    AssistantEmbedder,
    SapaCorpusRepository,
    HybridRetriever,
    AssistantStatsTool,
    AssistantTools,
    AssistantAgent,
    {
      // Build the real LangGraph executor (which constructs ChatOpenAI and opens
      // sockets lazily on invoke) only outside tests. Under NODE_ENV=test the
      // provider resolves to undefined, so AssistantAgent's @Optional executor is
      // absent and it fails closed with ProviderUnavailableError — no socket, no
      // ChatOpenAI, at test time.
      provide: ASSISTANT_AGENT_EXECUTOR,
      useFactory: (tools: AssistantTools): AssistantAgentExecutor | undefined =>
        getConfig().NODE_ENV === 'test' ? undefined : new LangGraphAssistantExecutor(tools),
      inject: [AssistantTools],
    },
    SessionAuthGuard,
    SessionRepository,
  ],
})
export class AssistantModule {}

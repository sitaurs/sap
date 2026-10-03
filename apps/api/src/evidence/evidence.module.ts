import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { CommunityModule } from '../community/community.module.js';
import { ExtensionsModule } from '../extensions/extensions.module.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { SessionRepository } from '../session/session.repository.js';
@Module({ imports: [CommunityModule, ExtensionsModule], controllers: [EvidenceController], providers: [EvidenceService, SessionAuthGuard, SessionRepository], exports: [EvidenceService] })
export class EvidenceModule {}

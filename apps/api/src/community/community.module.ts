import { Module } from '@nestjs/common';
import { CommunityService } from './community.service.js';
import { ReviewService } from './review.service.js';
import { CommunityAdminController, CommunityUpdatesController, IncidentsController, MyCommunityController } from './community.controller.js';
import { ExtensionsModule } from '../extensions/extensions.module.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { SessionRepository } from '../session/session.repository.js';

@Module({imports:[ExtensionsModule],controllers:[CommunityAdminController,CommunityUpdatesController,IncidentsController,MyCommunityController],providers:[CommunityService,ReviewService,SessionAuthGuard,SessionRepository,AdminGuard],exports:[CommunityService,ReviewService]})
export class CommunityModule {}

import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityResultsService } from './activity-results.service.js';
import { ImpactService } from './impact.service.js';
import { ActivitiesAdminController,ActivitiesController,ActivitiesEnabledGuard,ExtensionNoStoreInterceptor,ImpactController,MyActivitiesController } from './activities.controller.js';
import { ExtensionsModule } from '../extensions/extensions.module.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { SessionRepository } from '../session/session.repository.js';

@Module({imports:[CommunityModule,ExtensionsModule],controllers:[ActivitiesController,ActivitiesAdminController,MyActivitiesController,ImpactController],providers:[ActivitiesService,ActivityResultsService,ImpactService,ActivitiesEnabledGuard,ExtensionNoStoreInterceptor,SessionAuthGuard,SessionRepository,AdminGuard],exports:[ActivitiesService,ActivityResultsService,ImpactService]})
export class ActivitiesModule {}

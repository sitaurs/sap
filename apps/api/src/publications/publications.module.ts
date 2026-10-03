import {Module} from '@nestjs/common';
import {EvidenceModule} from '../evidence/evidence.module.js';
import {ExtensionsModule} from '../extensions/extensions.module.js';
import {SessionAuthGuard} from '../auth/session-auth.guard.js';
import {SessionRepository} from '../session/session.repository.js';
import {PublicationsService} from './publications.service.js';
import {PublicationsController,PublicationAssetsController,PublicationLifecycleController} from './publications.controller.js';
@Module({imports:[EvidenceModule,ExtensionsModule],providers:[PublicationsService,SessionAuthGuard,SessionRepository],controllers:[PublicationsController,PublicationAssetsController,PublicationLifecycleController],exports:[PublicationsService]})
export class PublicationsModule{}

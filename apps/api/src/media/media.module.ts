import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { SessionRepository } from '../session/session.repository.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ImageProcessorService } from './image-processor.service.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';
import { ObjectStorageService } from './object-storage.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    ImageProcessorService,
    ObjectStorageService,
    MediaRepository,
    SessionRepository,
    SessionAuthGuard,
  ],
  exports: [MediaService],
})
export class MediaModule {}

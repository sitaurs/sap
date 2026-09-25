import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { AreasController } from './areas.controller.js';
import { AreasRepository } from './areas.repository.js';
import { AreasService } from './areas.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AreasController],
  providers: [AreasService, AreasRepository, ObjectStorageService],
})
export class AreasModule {}

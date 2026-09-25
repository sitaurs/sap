import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { DatabaseModule } from './infrastructure/database.module.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

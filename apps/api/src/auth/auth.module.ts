import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionModule } from '../session/session.module.js';
import { CsrfController } from './csrf.controller.js';
import { CsrfGuard } from './csrf.guard.js';
import { CsrfService } from './csrf.service.js';

@Module({
  imports: [SessionModule],
  controllers: [CsrfController],
  providers: [CsrfService, { provide: APP_GUARD, useClass: CsrfGuard }],
  exports: [CsrfService],
})
export class AuthModule {}

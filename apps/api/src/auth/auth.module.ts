import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../infrastructure/database.module.js';
import { SessionModule } from '../session/session.module.js';
import { SessionRepository } from '../session/session.repository.js';
import { UsersRepository } from '../users/users.repository.js';
import { AccountDeletionController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthCryptoService } from './auth-crypto.js';
import { AuthService } from './auth.service.js';
import { ChallengeRepository } from './challenge.repository.js';
import { CsrfController } from './csrf.controller.js';
import { CsrfGuard } from './csrf.guard.js';
import { CsrfService } from './csrf.service.js';
import { DeletionRepository } from './deletion.repository.js';
import { MailerService } from './mailer.service.js';
import { OutboxRepository } from './outbox.repository.js';
import { PasswordService } from './password.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [DatabaseModule, SessionModule],
  controllers: [CsrfController, AuthController, UsersController, AccountDeletionController],
  providers: [
    CsrfService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    AuthService,
    AuthCryptoService,
    PasswordService,
    MailerService,
    SessionAuthGuard,
    UsersRepository,
    SessionRepository,
    ChallengeRepository,
    DeletionRepository,
    OutboxRepository,
  ],
  exports: [CsrfService],
})
export class AuthModule {}

import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@sap/config';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { EnvelopeInterceptor } from './envelope.interceptor.js';
import { RequestIdMiddleware } from './request-id.middleware.js';
import { SessionService } from '../../session/session.service.js';

export function bootstrapHttpApp(app: INestApplication, config: AppConfig = loadConfig()): AppConfig {
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const requestId = new RequestIdMiddleware();
  const sessions = app.get(SessionService);
  app.use(requestId.use.bind(requestId));
  app.use(sessions.attach.bind(sessions));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('X-Contract-Version', config.CONTRACT_VERSION);
    next();
  });
  return config;
}

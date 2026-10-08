import { Logger, ValidationPipe } from '@nestjs/common';
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
  app.use((request: { originalUrl?: string; url?: string }, response: { setHeader(name:string,value:string):void }, next:()=>void) => {
    const path=(request.originalUrl??request.url??'').split('?')[0]??'';
    if (/^\/api\/v1\/(?:admin(?:\/|$)|public\/incidents(?:\/|$)|activities(?:\/|$)|impact(?:\/|$)|publication-assets(?:\/|$)|community-updates(?:\/|$)|users\/me\/(?:followed-incidents|community-updates|activities|coordinator-assignments|notifications)(?:\/|$)|media\/[^/]+\/consents(?:\/|$))/.test(path)) {
      response.setHeader('Cache-Control','private, no-store');
      response.setHeader('Pragma','no-cache');
    }
    next();
  });
  app.use(sessions.attach.bind(sessions));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('X-Contract-Version', config.CONTRACT_VERSION);
    next();
  });
  // Surface the resolved public origin and internal API URL at startup. Both are
  // non-secret and misconfiguring APP_ORIGIN silently breaks CSRF Origin-locking,
  // so logging them makes deploy-time mismatches obvious in the logs.
  Logger.log(
    `HTTP ready: contract=${config.CONTRACT_VERSION} APP_ORIGIN=${config.APP_ORIGIN} APP_ORIGIN_ALIASES=${config.APP_ORIGIN_ALIASES.join(',')} API_INTERNAL_URL=${config.API_INTERNAL_URL}`,
    'Bootstrap',
  );
  return config;
}

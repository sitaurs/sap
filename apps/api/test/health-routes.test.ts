import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

let app: INestApplication;
let server: Server;
let dependencyState = {
  status: 'ok' as 'ok' | 'degraded',
  ready: true,
  dependencies: { database: 'ok' as 'ok' | 'unavailable', redis: 'ok' as 'ok' | 'unavailable', objectStorage: 'ok' as 'ok' | 'unavailable' },
  contractVersion: '1.1.0',
};

before(async () => {
  const [{ HealthController }, { HealthService }, { EnvelopeInterceptor }, { RequestIdMiddleware }] = await Promise.all([
    import('../src/health/health.controller.js'),
    import('../src/health/health.service.js'),
    import('../src/platform/http/envelope.interceptor.js'),
    import('../src/platform/http/request-id.middleware.js'),
  ]);
  const fakeHealth = {
    check: async () => ({
      status: dependencyState.status,
      dbOk: dependencyState.dependencies.database === 'ok',
      contractVersion: dependencyState.contractVersion,
    }),
    readiness: async () => dependencyState,
    liveness: () => ({ status: 'ok' as const, contractVersion: '1.1.0' }),
  };
  @Module({ controllers: [HealthController], providers: [{ provide: HealthService, useValue: fakeHealth }] })
  class HealthRoutesTestModule {}

  app = await NestFactory.create(HealthRoutesTestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('X-Contract-Version', '1.1.0');
    next();
  });
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  await app.init();
  server = app.getHttpServer() as Server;
});

after(async () => {
  await app.close();
});

test('liveness is process-only and does not expose dependency details', async () => {
  dependencyState = {
    status: 'degraded', ready: false,
    dependencies: { database: 'unavailable', redis: 'unavailable', objectStorage: 'unavailable' },
    contractVersion: '1.1.0',
  };
  const response = await request(server).get('/api/v1/health/live').expect(200);
  assert.deepEqual(response.body.data, { status: 'ok', contractVersion: '1.1.0' });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('readiness makes auxiliary degradation visible while preserving DB-backed read availability', async () => {
  dependencyState = {
    status: 'degraded', ready: true,
    dependencies: { database: 'ok', redis: 'unavailable', objectStorage: 'unavailable' },
    contractVersion: '1.1.0',
  };
  const response = await request(server).get('/api/v1/health/ready').expect(200);
  assert.deepEqual(response.body.data, dependencyState);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.doesNotMatch(JSON.stringify(response.body), /r2\.example|bucket-secret|access-key|password/i);
});

test('readiness fails with safe dependency states when DB is down', async () => {
  dependencyState = {
    status: 'degraded', ready: false,
    dependencies: { database: 'unavailable', redis: 'ok', objectStorage: 'ok' },
    contractVersion: '1.1.0',
  };
  const response = await request(server).get('/api/v1/health/ready').expect(503);
  assert.deepEqual(response.body.data, dependencyState);
  assert.doesNotMatch(JSON.stringify(response.body), /postgresql:|redis:|r2\.example|secret/i);
});

test('published health response shape remains unchanged', async () => {
  dependencyState = {
    status: 'degraded', ready: true,
    dependencies: { database: 'ok', redis: 'unavailable', objectStorage: 'ok' },
    contractVersion: '1.1.0',
  };
  const response = await request(server).get('/api/v1/health').expect(200);
  assert.deepEqual(response.body.data, { status: 'degraded', contractVersion: '1.1.0' });
});

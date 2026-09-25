import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

const environment = {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal', PORT: '3001',
  APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.0.0', DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'rediss://default:p@localhost:6379', SESSION_SECRET: 's'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32), SMTP_HOST: 'localhost', SMTP_PORT: '587',
  SMTP_USER: 'user', SMTP_PASSWORD: 'password', MAIL_FROM: 'SAP <sap@localhost>',
  S3_ENDPOINT: 'https://r2.invalid', S3_REGION: 'auto', S3_BUCKET: 'sap',
  S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret',
  ML_INFERENCE_URL: 'https://ml.invalid', ML_API_NAME: '/predict_gradio',
  ML_USERNAME: 'ecolens', ML_PASSWORD: 'password', ML_TIMEOUT_MS: '90000',
};
Object.assign(process.env, environment);

class InputDto {
  @IsString()
  @MinLength(3)
  name!: string;
}

@Controller('_test')
class TestController {
  @Get('error')
  error(): never {
    throw new Error('private database detail');
  }

  @Post('mutation')
  mutation(@Body() body: InputDto) {
    return body;
  }
}

let app: INestApplication;
let server: Server;

function header(response: request.Response, name: string): string {
  const value = response.headers[name];
  assert.ok(typeof value === 'string', `expected string header ${name}`);
  return value;
}

function firstSetCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'];
  assert.ok(Array.isArray(cookies) && typeof cookies[0] === 'string', 'expected a Set-Cookie header');
  return cookies[0];
}

before(async () => {
  const [{ AuthModule }, { SessionModule }, { HealthController }, { HealthService }, { bootstrapHttpApp }] = await Promise.all([
    import('../src/auth/auth.module.js'),
    import('../src/session/session.module.js'),
    import('../src/health/health.controller.js'),
    import('../src/health/health.service.js'),
    import('../src/platform/http/bootstrap-http-app.js'),
  ]);

  @Module({ imports: [AuthModule, SessionModule], controllers: [HealthController, TestController], providers: [HealthService] })
  class TestModule {}

  app = await NestFactory.create(TestModule, { logger: false });
  app.get(HealthService).check = async () => ({ status: 'ok', dbOk: true, contractVersion: '1.0.0' as const });
  bootstrapHttpApp(app, (await import('@sap/config')).getConfig(environment));
  await app.init();
  server = app.getHttpServer() as Server;
});

after(async () => {
  await app.close();
});

test('health uses the contract success envelope and request id', async () => {
  const response = await request(server).get('/api/v1/health').expect(200);
  const requestId = header(response, 'x-request-id');
  assert.equal(response.headers['x-contract-version'], '1.0.0');
  assert.match(requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(response.body, {
    data: { status: 'ok', contractVersion: '1.0.0' },
    meta: { requestId },
  });
});

test('unexpected errors are redacted into a stable error envelope', async () => {
  const response = await request(server).get('/api/v1/_test/error').expect(500);
  assert.equal(response.headers['x-contract-version'], '1.0.0');
  assert.deepEqual(response.body, {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    meta: { requestId: response.headers['x-request-id'] },
  });
  assert.doesNotMatch(JSON.stringify(response.body), /database detail/);
});

test('CSRF endpoint issues a signed double-submit token without a session', async () => {
  const response = await request(server).get('/api/v1/auth/csrf').expect(200);
  assert.equal(typeof response.body.data.csrfToken, 'string');
  assert.match(response.body.data.expiresAt, /Z$/);
  const cookie = firstSetCookie(response);
  assert.match(cookie, /^sap_csrf=/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test('mutations reject missing or mismatched CSRF and Origin', async () => {
  const missing = await request(server).post('/api/v1/_test/mutation').send({ name: 'valid' }).expect(403);
  assert.equal(missing.body.error.code, 'CSRF_INVALID');
  assert.equal(missing.headers['x-contract-version'], '1.0.0');

  const issued = await request(server).get('/api/v1/auth/csrf').expect(200);
  const cookie = firstSetCookie(issued).split(';')[0]!;
  await request(server)
    .post('/api/v1/_test/mutation')
    .set('Origin', environment.APP_ORIGIN)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', `${issued.body.data.csrfToken}tampered`)
    .send({ name: 'valid' })
    .expect(403);
});

test('valid CSRF reaches strict DTO validation and preserves the request id', async () => {
  const issued = await request(server).get('/api/v1/auth/csrf').expect(200);
  const cookie = firstSetCookie(issued).split(';')[0]!;
  const response = await request(server)
    .post('/api/v1/_test/mutation')
    .set('Origin', environment.APP_ORIGIN)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', issued.body.data.csrfToken)
    .send({ name: 'ok', role: 'admin' })
    .expect(400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(response.body.meta.requestId, response.headers['x-request-id']);
});

test('session skeleton creates opaque 256-bit tokens and only attaches their hash', async () => {
  const { SessionService } = await import('../src/session/session.service.js');
  const service = app.get(SessionService);
  const session = service.createToken();
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(session.tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(session.expiresAt.getTime() > Date.now());
  assert.match(service.cookie(session.token), /HttpOnly/);
  assert.doesNotMatch(session.tokenHash, new RegExp(session.token));
});

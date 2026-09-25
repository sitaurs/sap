import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@sap/config';
import { setDefaultResultOrder } from 'node:dns';
import { AppModule } from './app.module.js';

setDefaultResultOrder('ipv4first');
const config = loadConfig();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.setGlobalPrefix('api/v1');
app.enableShutdownHooks();
app.getHttpAdapter().getInstance().disable('x-powered-by');
app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
  response.setHeader('X-Contract-Version', config.CONTRACT_VERSION);
  next();
});
await app.listen(config.PORT, '0.0.0.0');

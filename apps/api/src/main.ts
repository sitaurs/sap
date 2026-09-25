import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@sap/config';
import { setDefaultResultOrder } from 'node:dns';
import { AppModule } from './app.module.js';
import { bootstrapHttpApp } from './platform/http/bootstrap-http-app.js';

setDefaultResultOrder('ipv4first');
const config = loadConfig();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
bootstrapHttpApp(app, config);
await app.listen(config.PORT, '0.0.0.0');

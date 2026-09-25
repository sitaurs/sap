import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { SapRequest } from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: SapRequest, response: Response, next: NextFunction): void {
    const supplied = request.header('x-request-id');
    request.requestId = supplied && UUID.test(supplied) ? supplied : randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    next();
  }
}

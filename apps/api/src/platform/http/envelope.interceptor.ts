import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { SapRequest } from './request-context.js';

export interface SuccessEnvelope<T> {
  data: T;
  meta: { requestId: string };
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessEnvelope<unknown>> {
    const request = context.switchToHttp().getRequest<SapRequest>();
    return next.handle().pipe(map((data: unknown) => ({ data, meta: { requestId: request.requestId } })));
  }
}

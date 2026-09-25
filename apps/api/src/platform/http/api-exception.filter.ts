import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { safeLogRecord } from '../logging/redact.js';
import type { SapRequest } from './request-context.js';

type ErrorFields = Record<string, string[]>;
type DomainErrorBody = { code?: unknown; message?: unknown; fields?: unknown };

const codes: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'REVISION_CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'IMAGE_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_IMAGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'REPORT_INVALID',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'DEPENDENCY_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<SapRequest>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalized = this.normalize(body, status);

    // Unexpected server errors are logged with a redaction-safe record (requestId
    // + route only) so operators get signal without leaking secrets/PII/coords.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        safeLogRecord('unhandled_exception', {
          requestId: request.requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          status,
          message: exception instanceof Error ? exception.message : 'unknown',
        }),
      );
    }

    // Rate-limit responses carry a Retry-After hint on the exception body; surface
    // it as the header without leaking it into the JSON envelope.
    if (status === HttpStatus.TOO_MANY_REQUESTS && typeof body === 'object' && body !== null) {
      const retryAfter = (body as { retryAfter?: unknown }).retryAfter;
      if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
      }
    }

    response.status(status).json({
      error: normalized,
      meta: { requestId: request.requestId },
    });
  }

  private normalize(body: string | object | undefined, status: number): {
    code: string;
    message: string;
    fields?: ErrorFields;
  } {
    if (typeof body === 'object' && body !== null) {
      const candidate = body as DomainErrorBody;
      const code = typeof candidate.code === 'string' ? candidate.code : codes[status];
      const message = this.message(candidate.message, status);
      const fields = this.fields(candidate.fields);
      return fields ? { code: code ?? 'INTERNAL_ERROR', message, fields } : { code: code ?? 'INTERNAL_ERROR', message };
    }
    return { code: codes[status] ?? 'INTERNAL_ERROR', message: typeof body === 'string' ? body : this.defaultMessage(status) };
  }

  private message(value: unknown, status: number): string {
    if (Array.isArray(value)) return 'Request validation failed.';
    return typeof value === 'string' ? value : this.defaultMessage(status);
  }

  private fields(value: unknown): ErrorFields | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as ErrorFields;
  }

  private defaultMessage(status: number): string {
    return status === 500 ? 'An unexpected error occurred.' : 'The request could not be completed.';
  }
}

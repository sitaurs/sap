import type { Request } from 'express';

export interface SapRequest extends Request {
  requestId: string;
  sessionTokenHash?: string;
}

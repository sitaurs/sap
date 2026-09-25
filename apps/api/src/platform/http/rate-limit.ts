import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Per-account rate limits (TECH_SPEC §: scan 10/jam, laporan 10/hari, dapat
 * dikonfigurasi). Windows are sliding: a slot frees when the oldest in-window
 * record ages out. Limits read from env once at load with safe defaults so
 * offline unit tests need no full config.
 */
export interface RateLimitWindow {
  readonly limit: number;
  readonly windowMs: number;
}

/** Current usage inside the window: how many records and the oldest one's time. */
export interface RateLimitState {
  readonly count: number;
  readonly oldestAt: Date | null;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the caller may retry (>=1); 0 when allowed. */
  readonly retryAfterSeconds: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const SCAN_RATE_LIMIT: RateLimitWindow = {
  limit: intFromEnv('SCAN_RATE_LIMIT_PER_HOUR', 10),
  windowMs: HOUR_MS,
};

export const REPORT_RATE_LIMIT: RateLimitWindow = {
  limit: intFromEnv('REPORT_RATE_LIMIT_PER_DAY', 10),
  windowMs: DAY_MS,
};

/** Pure decision: allowed while under limit; otherwise compute Retry-After. */
export function evaluateRateLimit(state: RateLimitState, window: RateLimitWindow, now: number): RateLimitDecision {
  if (state.count < window.limit) return { allowed: true, retryAfterSeconds: 0 };
  const oldest = state.oldestAt ? state.oldestAt.getTime() : now;
  const freesAt = oldest + window.windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((freesAt - now) / 1_000));
  return { allowed: false, retryAfterSeconds };
}

/**
 * 429 with a `retryAfter` hint. The `retryAfter` value is consumed by
 * ApiExceptionFilter to emit the `Retry-After` header and is never serialized
 * into the error envelope body (which is code/message/fields only).
 */
export class RateLimitException extends HttpException {
  constructor(retryAfterSeconds: number, message = 'Terlalu banyak permintaan. Coba lagi nanti.') {
    super({ code: 'RATE_LIMITED', message, retryAfter: retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

import type { AppConfig } from '@sap/config';
import { MlClient, type MlPrediction } from './ml-client.js';

export type ScanOutcome = 'classified' | 'unknown' | 'no_waste';
export type ScanErrorCode = 'ML_UNAVAILABLE' | 'ML_TIMEOUT' | 'ML_INVALID_RESPONSE' | 'MEDIA_INVALID';

export const CATEGORY_IDS = [
  'battery',
  'biological',
  'cardboard',
  'clothes',
  'glass',
  'metal',
  'paper',
  'plastic',
  'shoes',
  'trash',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
const CATEGORY_SET = new Set<string>(CATEGORY_IDS);

export interface AdapterResult {
  outcome: ScanOutcome;
  categoryId: CategoryId | null;
  predictions: Array<{ categoryId: CategoryId; score: number }>;
  providerRevision: string | null;
}

/** Error whose `code` is the domain scan error to persist. */
export class MlError extends Error {
  constructor(
    public readonly code: ScanErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'MlError';
  }
}

/**
 * Map the provider `LabelData` to a SAP scan outcome (ML_INTEGRATION §2).
 * A foreign label, `error`, or a structurally invalid payload is never coerced
 * into `no_waste` — it fails with ML_INVALID_RESPONSE.
 */
export function mapPrediction(pred: MlPrediction): Omit<AdapterResult, 'providerRevision'> {
  const label = typeof pred.label === 'string' ? pred.label.trim() : '';
  const predictions = [...pred.confidences]
    .filter((c) => CATEGORY_SET.has(c.label) && Number.isFinite(c.confidence) && c.confidence >= 0 && c.confidence <= 1)
    .map((c) => ({ categoryId: c.label as CategoryId, score: c.confidence }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (CATEGORY_SET.has(label)) {
    return { outcome: 'classified', categoryId: label as CategoryId, predictions };
  }
  if (label === 'no_waste') {
    return { outcome: 'no_waste', categoryId: null, predictions: [] };
  }
  // The provider emits the combined label `Unknown/Mixed` (ML_INTEGRATION.md §2
  // label table) for the ambiguous class; accept it and the standalone
  // `unknown`/`mixed` variants, all mapping to outcome=unknown.
  const normalized = label.toLowerCase();
  if (normalized === 'unknown' || normalized === 'mixed' || normalized === 'unknown/mixed') {
    return { outcome: 'unknown', categoryId: null, predictions };
  }
  throw new MlError('ML_INVALID_RESPONSE', `unrecognised label: ${label || '(empty)'}`);
}

/** Classify a raw thrown error (from MlClient / gradio / network) into a domain code. */
export function classifyError(error: unknown): ScanErrorCode {
  if (error instanceof MlError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ML_TIMEOUT')) return 'ML_TIMEOUT';
  if (message.includes('ML_INVALID_RESPONSE')) return 'ML_INVALID_RESPONSE';
  // 401/403 behind the reverse proxy are configuration failures, reported as unavailable.
  if (/\b(401|403)\b/.test(message)) return 'ML_UNAVAILABLE';
  return 'ML_UNAVAILABLE';
}

/** Errors that must not be retried: config (401/403) and non-guessable invalid responses. */
function isRetryable(code: ScanErrorCode, error: unknown): boolean {
  if (code === 'ML_INVALID_RESPONSE') return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b/.test(message)) return false;
  return code === 'ML_TIMEOUT' || code === 'ML_UNAVAILABLE';
}

/** Simple consecutive-failure circuit breaker (ML_INTEGRATION §5: "circuit breaker membatasi outage"). */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get isOpen(): boolean {
    if (this.failures < this.threshold) return false;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      // Half-open: allow one trial and reset the counter to probe recovery.
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}

/**
 * Fault-tolerant wrapper around {@link MlClient}: one automatic retry for
 * transient failures (never for 401/403 or invalid responses) and a shared
 * circuit breaker so a sustained outage fails fast with ML_UNAVAILABLE.
 */
export class MlAdapter {
  constructor(
    private readonly client: MlClient,
    private readonly config: AppConfig,
    private readonly breaker: CircuitBreaker = new CircuitBreaker(),
  ) {}

  async classify(image: Buffer): Promise<AdapterResult> {
    if (this.breaker.isOpen) {
      throw new MlError('ML_UNAVAILABLE', 'circuit breaker open');
    }

    const maxAttempts = 2; // one retry
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const prediction = await this.client.predict(image);
        this.breaker.recordSuccess();
        return { ...mapPrediction(prediction), providerRevision: null };
      } catch (error) {
        lastError = error;
        const code = classifyError(error);
        // Invalid responses are a hard failure and count against the breaker but never retry.
        this.breaker.recordFailure();
        if (attempt >= maxAttempts || !isRetryable(code, error)) {
          throw error instanceof MlError ? error : new MlError(code, (error as Error)?.message);
        }
      }
    }
    throw lastError instanceof MlError ? lastError : new MlError(classifyError(lastError));
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRateLimit,
  RateLimitException,
  type RateLimitWindow,
} from '../src/platform/http/rate-limit.js';
import { redact, safeLogRecord } from '../src/platform/logging/redact.js';

// --- Rate limit decision --------------------------------------------------------

const WINDOW: RateLimitWindow = { limit: 10, windowMs: 60 * 60 * 1_000 };
const NOW = Date.parse('2026-09-25T12:00:00.000Z');

test('evaluateRateLimit allows while under the limit', () => {
  const decision = evaluateRateLimit({ count: 9, oldestAt: new Date(NOW - 10_000) }, WINDOW, NOW);
  assert.equal(decision.allowed, true);
  assert.equal(decision.retryAfterSeconds, 0);
});

test('evaluateRateLimit blocks at the limit and computes Retry-After from the oldest record', () => {
  // Oldest request was 30 min ago -> frees in 30 min = 1800s.
  const oldestAt = new Date(NOW - 30 * 60 * 1_000);
  const decision = evaluateRateLimit({ count: 10, oldestAt }, WINDOW, NOW);
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterSeconds, 1_800);
});

test('evaluateRateLimit never returns a Retry-After below 1 second', () => {
  const oldestAt = new Date(NOW - WINDOW.windowMs); // already exactly aged out
  const decision = evaluateRateLimit({ count: 10, oldestAt }, WINDOW, NOW);
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterSeconds, 1);
});

test('RateLimitException carries the code and retryAfter hint', () => {
  const error = new RateLimitException(42);
  assert.equal(error.getStatus(), 429);
  const body = error.getResponse() as { code: string; retryAfter: number };
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(body.retryAfter, 42);
});

// --- Log redaction --------------------------------------------------------------

test('redact masks credentials, tokens, and session material', () => {
  const out = redact({
    requestId: 'req-1',
    authorization: 'Basic abc',
    password: 'hunter2',
    sessionToken: 'secret-token',
    csrfSecret: 'nope',
    sha256: 'deadbeef',
    nested: { apiKey: 'k', safe: 'value' },
  }) as Record<string, any>;
  assert.equal(out.requestId, 'req-1');
  assert.equal(out.authorization, '[redacted]');
  assert.equal(out.password, '[redacted]');
  assert.equal(out.sessionToken, '[redacted]');
  assert.equal(out.csrfSecret, '[redacted]');
  assert.equal(out.sha256, '[redacted]');
  assert.equal(out.nested.apiKey, '[redacted]');
  assert.equal(out.nested.safe, 'value');
});

test('redact masks exact coordinates and location', () => {
  const out = redact({ latitude: -6.2, longitude: 106.8, location: { latitude: 1, longitude: 2 } }) as Record<string, any>;
  assert.equal(out.latitude, '[redacted]');
  assert.equal(out.longitude, '[redacted]');
  assert.equal(out.location, '[redacted]');
});

test('redact strips raw image bytes', () => {
  const out = redact({ photo: 'base64...', imageBuffer: Buffer.from('x'), scanId: 's1' }) as Record<string, any>;
  assert.equal(out.photo, '[redacted]');
  // A Buffer under a binary-ish key is size-marked (never raw bytes).
  assert.match(String(out.imageBuffer), /^\[(redacted|binary)/);
  assert.equal(out.scanId, 's1');
});

test('safeLogRecord emits single-line JSON with the event name', () => {
  const line = safeLogRecord('unhandled_exception', { requestId: 'r1', password: 'x' });
  assert.doesNotMatch(line, /\n/);
  const parsed = JSON.parse(line);
  assert.equal(parsed.event, 'unhandled_exception');
  assert.equal(parsed.requestId, 'r1');
  assert.equal(parsed.password, '[redacted]');
});

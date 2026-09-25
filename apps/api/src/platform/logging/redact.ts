/**
 * Structured-log redaction (DEPLOYMENT.md §7: "Log memakai requestId/scanId/
 * reportId tanpa token, password, Authorization, foto atau koordinat tepat").
 * Deep-clones a value and masks anything sensitive so a log line can never carry
 * credentials, session material, exact coordinates, or raw image bytes.
 */
const REDACTED = '[redacted]';

/** Keys whose values are always masked, matched case-insensitively by substring. */
const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'otp',
  'passcode',
  'apikey',
  'api-key',
  'credential',
  'sha256',
];

/** Keys that reveal precise location; masked to protect reporters. */
const LOCATION_KEY_PATTERNS = ['latitude', 'longitude', 'lat', 'lng', 'lon', 'coordinate', 'coords', 'location'];

/** Keys that hold raw media/image bytes; replaced with a size marker, never logged. */
const BINARY_KEY_PATTERNS = ['buffer', 'bytes', 'image', 'photo', 'file'];

function matches(key: string, patterns: readonly string[]): boolean {
  const lower = key.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `[binary ${value.length}B]`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (matches(key, SENSITIVE_KEY_PATTERNS) || matches(key, LOCATION_KEY_PATTERNS)) {
      output[key] = REDACTED;
    } else if (matches(key, BINARY_KEY_PATTERNS) && (typeof entry === 'string' || Buffer.isBuffer(entry))) {
      output[key] = REDACTED;
    } else {
      output[key] = redact(entry, depth + 1);
    }
  }
  return output;
}

/** Build a single-line, redaction-safe JSON log record. */
export function safeLogRecord(event: string, context: Record<string, unknown>): string {
  return JSON.stringify({ event, ...(redact(context) as Record<string, unknown>) });
}

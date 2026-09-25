import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const nonPlaceholder = z.string().min(1).refine(
  (value) => !/replace-me|replace-with|example\.com|USER:PASSWORD|ACCOUNT_ID/i.test(value),
  'must not use the example placeholder',
);

const urlWithProtocols = (protocols: readonly string[]) =>
  nonPlaceholder.refine((value) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, `must be a valid ${protocols.join(' or ')} URL`);

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// SAPA_FEATURE_ENABLED and similar flags arrive as strings from the environment.
// z.coerce.boolean() treats any non-empty string (including "false") as true, so
// map the common truthy tokens explicitly and treat everything else as false.
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.string().url(),
  API_INTERNAL_URL: z.string().url(),
  CONTRACT_VERSION: z.literal('1.0.0'),
  DATABASE_URL: urlWithProtocols(['postgres:', 'postgresql:']),
  DATABASE_DIRECT_URL: z.preprocess(emptyToUndefined, urlWithProtocols(['postgres:', 'postgresql:']).optional()),
  REDIS_URL: urlWithProtocols(['redis:', 'rediss:']),
  SESSION_SECRET: nonPlaceholder.min(32),
  CSRF_SECRET: nonPlaceholder.min(32),
  SMTP_HOST: nonPlaceholder,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: nonPlaceholder,
  SMTP_PASSWORD: nonPlaceholder,
  MAIL_FROM: nonPlaceholder,
  S3_ENDPOINT: urlWithProtocols(['https:']),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: nonPlaceholder,
  S3_ACCESS_KEY_ID: nonPlaceholder,
  S3_SECRET_ACCESS_KEY: nonPlaceholder,
  ML_INFERENCE_URL: urlWithProtocols(['http:', 'https:']),
  ML_API_NAME: z.string().startsWith('/').default('/predict_gradio'),
  ML_USERNAME: nonPlaceholder,
  ML_PASSWORD: nonPlaceholder,
  ML_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(90000),
  // Cold-start budget for the DB readiness probe. Neon serverless can scale to
  // zero; the first query after idle must wait for the instance to wake, which
  // routinely exceeds a 3s fast probe. The health check probes fast first and
  // only spends this longer budget on a cold-start retry.
  DB_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  // SAPA virtual assistant (addendum v1.1, SAPA_ASSISTANT.md). Global kill switch;
  // when false the chat route returns 503 ASSISTANT_UNAVAILABLE and the UI hides
  // the pet. LLM settings are only required when the flag is on (see superRefine).
  SAPA_FEATURE_ENABLED: booleanFromEnv.default(false),
  SAPA_LLM_BASE_URL: z.preprocess(emptyToUndefined, urlWithProtocols(['http:', 'https:']).optional()),
  SAPA_LLM_API_KEY: z.preprocess(emptyToUndefined, nonPlaceholder.optional()),
  SAPA_LLM_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SAPA_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  SAPA_LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4000).default(500),
  SAPA_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  NEXT_PUBLIC_MAP_STYLE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
}).superRefine((value, context) => {
  if (value.SESSION_SECRET === value.CSRF_SECRET) {
    context.addIssue({ code: 'custom', path: ['CSRF_SECRET'], message: 'must differ from SESSION_SECRET' });
  }
  if (value.NODE_ENV === 'production') {
    for (const field of ['APP_ORIGIN', 'API_INTERNAL_URL'] as const) {
      if (new URL(value[field]).protocol !== 'https:') {
        context.addIssue({ code: 'custom', path: [field], message: 'must use HTTPS in production' });
      }
    }
  }
  // When SAPA is switched on, the OpenAI-compatible provider must be fully
  // configured, otherwise every chat call would fall straight through to 503.
  if (value.SAPA_FEATURE_ENABLED) {
    for (const field of ['SAPA_LLM_BASE_URL', 'SAPA_LLM_API_KEY', 'SAPA_LLM_MODEL'] as const) {
      if (!value[field]) {
        context.addIssue({ code: 'custom', path: [field], message: 'required when SAPA_FEATURE_ENABLED is true' });
      }
    }
  }
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env && cached) return cached;
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  if (env === process.env) cached = result.data;
  return result.data;
}

export function loadConfig(envFile = process.env.SAP_ENV_FILE ?? '.env'): AppConfig {
  loadDotenv({ path: envFile, quiet: true });
  return getConfig();
}

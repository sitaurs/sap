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
  NEXT_PUBLIC_MAP_STYLE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
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

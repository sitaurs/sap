import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  CONTRACT_VERSION: z.literal('1.1.0'),
  SAP_EXTENSION_ENABLED: booleanFromEnv.default(false),
  SAP_COMMUNITY_ENABLED: booleanFromEnv.default(false),
  SAP_ACTIVITIES_ENABLED: booleanFromEnv.default(false),
  SAP_INSTAGRAM_ENABLED: booleanFromEnv.default(false),
  SAP_INSTAGRAM_PUBLISH_ENABLED: booleanFromEnv.default(false),
  SAP_INSTAGRAM_RENDER_ENABLED: booleanFromEnv.default(false),
  POSTER_OVERPASS_URL: z.preprocess(emptyToUndefined, urlWithProtocols(['https:']).optional()),
  POSTER_MAP_CACHE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  POSTER_MAP_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  SAP_HERMES_ENABLED: booleanFromEnv.default(false),
  HERMES_REVIEW_URL: z.preprocess(emptyToUndefined, urlWithProtocols(['http:', 'https:']).optional()),
  HERMES_REVIEW_SECRET: z.preprocess(emptyToUndefined, nonPlaceholder.min(32).optional()),
  HERMES_MODEL_VERSION: z.string().default('unconfigured'),
  HERMES_POLICY_VERSION: z.string().default('sap-moderation-r1'),
  HERMES_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(90000),
  HERMES_MAX_ITERATIONS: z.coerce.number().int().min(1).max(6).default(6),
  HERMES_MAX_INPUT_TOKENS: z.coerce.number().int().min(1000).max(32000).default(16000),
  HERMES_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).default(2048),
  HERMES_RUN_BUDGET_USD: z.coerce.number().positive().max(100).default(0.25),
  HERMES_DAILY_BUDGET_USD: z.coerce.number().nonnegative().max(10000).default(5),
  META_APP_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
  META_APP_SECRET: z.preprocess(emptyToUndefined, nonPlaceholder.optional()),
  META_LOGIN_CONFIG_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
  META_PAGE_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
  META_GRAPH_VERSION: z.preprocess(emptyToUndefined, z.string().regex(/^v\d+\.\d+$/).optional()),
  META_REDIRECT_URI: z.preprocess(emptyToUndefined, urlWithProtocols(['https:']).optional()),
  META_MEDIA_DELIVERY_ORIGIN: z.preprocess(emptyToUndefined, urlWithProtocols(['https:']).optional()),
  META_CREDENTIAL_KEY: z.preprocess(emptyToUndefined, nonPlaceholder.regex(/^[a-fA-F0-9]{64}$/).optional()),
  META_DELETE_ENABLED: booleanFromEnv.default(false),
  EXTENSION_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  EXTENSION_JOB_LEASE_MS: z.coerce.number().int().min(30000).max(600000).default(180000),
  EXTENSION_JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_URL: urlWithProtocols(['postgres:', 'postgresql:']),
  DATABASE_DIRECT_URL: z.preprocess(emptyToUndefined, urlWithProtocols(['postgres:', 'postgresql:']).optional()),
  REDIS_URL: urlWithProtocols(['redis:', 'rediss:']),
  SESSION_SECRET: nonPlaceholder.min(32),
  CSRF_SECRET: nonPlaceholder.min(32),
  RESEND_API_KEY: nonPlaceholder,
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
  // SAPA hybrid retrieval (Step 4). When on, SAPA grounds on the `sapa_corpus`
  // Postgres table via pgvector dense search + full-text + trigram fused with RRF,
  // and enables the deterministic read-only account-stats tool. When off, SAPA
  // falls back to the in-memory KNOWLEDGE_BASE token-overlap retrieval (default),
  // so nothing changes until the 0009 migration + embedding backfill have run.
  SAPA_RETRIEVAL_HYBRID_ENABLED: booleanFromEnv.default(false),
  // Embeddings reuse the SAPA gateway (SAPA_LLM_BASE_URL / SAPA_LLM_API_KEY) via
  // its OpenAI-compatible /embeddings endpoint. The gateway only has working
  // credentials for Gemini; gemini-embedding-001 at 1536 dims is NOT unit-norm, so
  // the client L2-normalizes app-side. 1536 (not 3072) keeps under pgvector's HNSW
  // 2000-dim index limit. SAPA_EMBEDDING_DIM must match the vector(N) column.
  SAPA_EMBEDDING_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).default('gemini/gemini-embedding-001')),
  SAPA_EMBEDDING_DIM: z.coerce.number().int().min(64).max(2000).default(1536),
  SAPA_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // Optional TOTP MFA is disabled until explicitly enabled with a dedicated key.
  MFA_TOTP_ENABLED: booleanFromEnv.default(false),
  MFA_TOTP_ENCRYPTION_KEY: z.preprocess(
    emptyToUndefined,
    nonPlaceholder.regex(/^[a-fA-F0-9]{64}$/, "must be exactly 32 bytes encoded as 64 hexadecimal characters").optional(),
  ),
  // Hybrid scan detection (HYBRID_SCAN_DETECTION.md). These env vars only SEED the
  // `scan_settings` singleton row on an empty database; the live source of truth is
  // that row (admin-tunable at runtime). The vision LLM reuses the SAPA gateway
  // (SAPA_LLM_BASE_URL / SAPA_LLM_API_KEY) but with its own model id below.
  SCAN_LLM_VISION_ENABLED: booleanFromEnv.default(false),
  SCAN_HYBRID_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(['full_ml', 'unknown_only', 'unknown_plus_threshold', 'full_llm']).default('unknown_plus_threshold'),
  ),
  SCAN_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  SCAN_LLM_VISION_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).default('sapa')),
  SCAN_LLM_VISION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  NEXT_PUBLIC_MAP_STYLE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
}).superRefine((value, context) => {
  if (value.SAP_HERMES_ENABLED) {
    for (const field of ['HERMES_REVIEW_URL', 'HERMES_REVIEW_SECRET'] as const) {
      if (!value[field]) context.addIssue({ code:'custom',path:[field],message:'required when SAP_HERMES_ENABLED is true' });
    }
    if (value.HERMES_MODEL_VERSION === 'unconfigured') context.addIssue({code:'custom',path:['HERMES_MODEL_VERSION'],message:'a pinned model is required'});
  }
  if (value.SAP_INSTAGRAM_PUBLISH_ENABLED) {
    for (const field of ['META_APP_ID','META_APP_SECRET','META_LOGIN_CONFIG_ID','META_GRAPH_VERSION','META_REDIRECT_URI','META_MEDIA_DELIVERY_ORIGIN','META_CREDENTIAL_KEY'] as const) {
      if (!value[field]) context.addIssue({code:'custom',path:[field],message:'required when Instagram publishing is enabled'});
    }
    if (!value.SAP_EXTENSION_ENABLED || !value.SAP_INSTAGRAM_ENABLED) context.addIssue({code:'custom',path:['SAP_INSTAGRAM_PUBLISH_ENABLED'],message:'requires extension and Instagram modules'});
  }
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
  // Hybrid scan vision reuses the SAPA gateway endpoint + key. When the vision
  // seed flag is on, the gateway must be reachable or the worker could never call it.
  if (value.SCAN_LLM_VISION_ENABLED) {
    for (const field of ['SAPA_LLM_BASE_URL', 'SAPA_LLM_API_KEY'] as const) {
      if (!value[field]) {
        context.addIssue({ code: 'custom', path: [field], message: 'required when SCAN_LLM_VISION_ENABLED is true' });
      }
    }
  }
  // Hybrid retrieval extends SAPA and calls the gateway /embeddings endpoint, so
  // SAPA itself must be on and the gateway (base URL + key) configured.
  // Optional TOTP MFA must never run without its dedicated AES-256-GCM key: an
  // absent/placeholder key would silently disable encryption of the seed at rest.
  if (value.MFA_TOTP_ENABLED && !value.MFA_TOTP_ENCRYPTION_KEY) {
    context.addIssue({
      code: "custom",
      path: ["MFA_TOTP_ENCRYPTION_KEY"],
      message: "required when MFA_TOTP_ENABLED is true",
    });
  }
  if (value.SAPA_RETRIEVAL_HYBRID_ENABLED) {
    if (!value.SAPA_FEATURE_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['SAPA_FEATURE_ENABLED'],
        message: 'must be true when SAPA_RETRIEVAL_HYBRID_ENABLED is true',
      });
    }
    for (const field of ['SAPA_LLM_BASE_URL', 'SAPA_LLM_API_KEY'] as const) {
      if (!value[field]) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'required when SAPA_RETRIEVAL_HYBRID_ENABLED is true',
        });
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

function findEnvFile(): string {
  let directory = resolve(process.cwd());
  while (true) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return candidate;
    directory = parent;
  }
}

export function loadConfig(envFile = process.env.SAP_ENV_FILE ?? findEnvFile()): AppConfig {
  loadDotenv({ path: envFile, quiet: true });
  return getConfig();
}

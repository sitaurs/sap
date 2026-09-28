// Route ↔ contract cross-check (finding #6, Fase 2).
//
// Boots the Nest AppModule with a dummy in-memory environment (no live DB/Redis
// required) purely to register the Express route table, then compares the routes
// the API actually exposes against the paths declared in contracts/openapi.json.
// This catches drift a schema check cannot: a controller route that was never
// documented, or a documented path the API stopped serving.
//
// Runs against the built output (apps/api/dist), so `npm run build` must run first
// — the root `check` script sequences it that way.
import { readFile } from 'node:fs/promises';

// Hermetic config: satisfy the Zod env schema (packages/config) without touching
// the real .env. Values are syntactically valid but obviously non-production.
process.env.SAP_ENV_FILE = '/nonexistent/.env.route-check';
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.0.0',
  DATABASE_URL: 'postgres://route:check@localhost:5432/routecheck',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'route-check-session-secret-0000000000000000',
  CSRF_SECRET: 'route-check-csrf-secret-1111111111111111111',
  SMTP_HOST: 'smtp.local',
  SMTP_PORT: '587',
  SMTP_USER: 'route-check',
  SMTP_PASSWORD: 'route-check-password',
  MAIL_FROM: 'no-reply@sap.local',
  S3_ENDPOINT: 'https://s3.local',
  S3_BUCKET: 'route-check',
  S3_ACCESS_KEY_ID: 'route-check-key',
  S3_SECRET_ACCESS_KEY: 'route-check-secret',
  ML_INFERENCE_URL: 'http://ml.local',
  ML_USERNAME: 'route-check',
  ML_PASSWORD: 'route-check-password',
  SAPA_FEATURE_ENABLED: 'false',
});

const openapi = JSON.parse(await readFile(new URL('../contracts/openapi.json', import.meta.url)));

// Contract side: METHOD + path for every documented operation.
const contractRoutes = new Set();
for (const [path, item] of Object.entries(openapi.paths ?? {})) {
  for (const method of Object.keys(item)) {
    if (['get', 'post', 'patch', 'delete', 'put'].includes(method)) {
      contractRoutes.add(`${method.toUpperCase()} ${path}`);
    }
  }
}

// Boot Nest just far enough to register routes. No app.listen(), no global prefix,
// so Express paths line up with the contract's unprefixed paths.
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../apps/api/dist/app.module.js');

const app = await NestFactory.create(AppModule, { logger: false });
await app.init();

// Express 5 exposes the router as `instance.router`; older builds used `_router`.
const instance = app.getHttpAdapter().getInstance();
const router = instance.router ?? instance._router;

// Normalise Express params (`:id`) to the OpenAPI style (`{id}`).
const toContractPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const apiRoutes = new Set();
function walk(stack, prefix = '') {
  for (const layer of stack ?? []) {
    if (layer.route) {
      const path = toContractPath(prefix + layer.route.path);
      const methods = layer.route.methods ?? {};
      for (const method of Object.keys(methods)) {
        if (methods[method]) apiRoutes.add(`${method.toUpperCase()} ${path}`);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, prefix);
    }
  }
}
walk(router?.stack);

await app.close();

const missingInContract = [...apiRoutes].filter((route) => !contractRoutes.has(route)).sort();
const missingInApi = [...contractRoutes].filter((route) => !apiRoutes.has(route)).sort();

if (missingInContract.length || missingInApi.length) {
  console.error('Route/contract drift detected:');
  for (const route of missingInContract) console.error(`  - API serves "${route}" but the contract does not document it`);
  for (const route of missingInApi) console.error(`  - Contract documents "${route}" but the API does not serve it`);
  process.exit(1);
}

console.log(`Routes OK: ${apiRoutes.size} API routes match ${contractRoutes.size} documented operations`);
process.exit(0);

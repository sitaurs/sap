import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import type { HttpException } from '@nestjs/common';

// A valid, SAPA-enabled environment so getConfig() (read in AssistantService's
// constructor) parses cleanly. NODE_ENV=test also makes the real store a no-op,
// though these tests stub the store outright.
const environment = {
  NODE_ENV: 'test', LOG_LEVEL: 'fatal', PORT: '3001',
  APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
  CONTRACT_VERSION: '1.0.0', DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'rediss://default:p@localhost:6379', SESSION_SECRET: 's'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32), SMTP_HOST: 'localhost', SMTP_PORT: '587',
  SMTP_USER: 'user', SMTP_PASSWORD: 'password', MAIL_FROM: 'SAP <sap@localhost>',
  S3_ENDPOINT: 'https://r2.invalid', S3_REGION: 'auto', S3_BUCKET: 'sap',
  S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret',
  ML_INFERENCE_URL: 'https://ml.invalid', ML_API_NAME: '/predict_gradio',
  ML_USERNAME: 'ecolens', ML_PASSWORD: 'password', ML_TIMEOUT_MS: '90000',
  SAPA_FEATURE_ENABLED: 'true', SAPA_LLM_BASE_URL: 'https://llm.invalid/v1',
  SAPA_LLM_API_KEY: 'sk-test-key', SAPA_LLM_MODEL: 'test-model',
};
Object.assign(process.env, environment);

let AssistantService: typeof import('../src/assistant/assistant.service.js').AssistantService;
let AssistantProvider: typeof import('../src/assistant/assistant-provider.js').AssistantProvider;
let ProviderUnavailableError: typeof import('../src/assistant/assistant-provider.js').ProviderUnavailableError;
let retrieveKnowledge: typeof import('../src/assistant/assistant-knowledge.js').retrieveKnowledge;
let getConfig: typeof import('@sap/config').getConfig;

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

function httpStatus(error: unknown): number {
  return (error as HttpException).getStatus?.() ?? 0;
}

before(async () => {
  ({ AssistantService } = await import('../src/assistant/assistant.service.js'));
  ({ AssistantProvider, ProviderUnavailableError } = await import('../src/assistant/assistant-provider.js'));
  ({ retrieveKnowledge } = await import('../src/assistant/assistant-knowledge.js'));
  ({ getConfig } = await import('@sap/config'));
});

// __ASSISTANT_TESTS__

interface StoreState {
  rateAllowed: boolean;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }> | null;
  appended: number;
  deleted: boolean;
}

function makeStore(overrides: Partial<StoreState> = {}) {
  const state: StoreState = {
    rateAllowed: overrides.rateAllowed ?? true,
    conversation: overrides.conversation ?? null,
    appended: 0,
    deleted: overrides.deleted ?? true,
  };
  const store = {
    newConversationId: () => 'new-conv-id',
    getConversation: async () => state.conversation,
    checkRateLimit: async () => ({ allowed: state.rateAllowed, retryAfterSeconds: state.rateAllowed ? 0 : 30 }),
    appendTurn: async () => { state.appended += 1; },
    deleteConversation: async () => state.deleted,
  };
  return { store, state };
}

function makeProvider(reply: unknown | Error) {
  return {
    complete: async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

const OK_REPLY = { reply: 'Jawaban singkat.', suggestedActions: [{ label: 'Buka Bantuan', target: 'help' }] };
const ENABLED_CALLER = { id: 'u1', sapaEnabled: true };
const REQUEST = { message: 'Bagaimana cara scan?', pageContext: 'scan', conversationId: null };

test('chat returns 503 ASSISTANT_UNAVAILABLE when the feature flag is off', async () => {
  const { store } = makeStore();
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  // Override the constructor-cached config so the platform flag reads false.
  (service as unknown as { config: ReturnType<typeof getConfig> }).config = {
    ...getConfig(), SAPA_FEATURE_ENABLED: false,
  };
  await assert.rejects(
    service.chat(ENABLED_CALLER, REQUEST),
    (error) => errorCode(error) === 'ASSISTANT_UNAVAILABLE' && httpStatus(error) === 503,
  );
});

test('chat returns 403 ASSISTANT_DISABLED when the account opted out', async () => {
  const { store } = makeStore();
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  await assert.rejects(
    service.chat({ id: 'u1', sapaEnabled: false }, REQUEST),
    (error) => errorCode(error) === 'ASSISTANT_DISABLED' && httpStatus(error) === 403,
  );
});

test('chat returns 422 for an empty, oversized, or unknown-page message', async () => {
  const { store } = makeStore();
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  for (const bad of [
    { message: '   ', pageContext: 'scan', conversationId: null },
    { message: 'x'.repeat(2001), pageContext: 'scan', conversationId: null },
    { message: 'halo', pageContext: 'not_a_page', conversationId: null },
  ]) {
    await assert.rejects(
      service.chat(ENABLED_CALLER, bad),
      (error) => errorCode(error) === 'ASSISTANT_MESSAGE_INVALID' && httpStatus(error) === 422,
    );
  }
});

test('chat returns 429 RATE_LIMITED when the per-minute quota is exceeded', async () => {
  const { store } = makeStore({ rateAllowed: false });
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  await assert.rejects(
    service.chat(ENABLED_CALLER, REQUEST),
    (error) => errorCode(error) === 'RATE_LIMITED' && httpStatus(error) === 429,
  );
});

test('chat returns 404 when a supplied conversationId does not resolve', async () => {
  const { store } = makeStore({ conversation: null });
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  await assert.rejects(
    service.chat(ENABLED_CALLER, { message: 'halo', pageContext: 'scan', conversationId: 'missing-id' }),
    (error) => errorCode(error) === 'CONVERSATION_NOT_FOUND' && httpStatus(error) === 404,
  );
});

test('chat maps a provider failure to 503 ASSISTANT_UNAVAILABLE', async () => {
  const { store } = makeStore();
  const service = new AssistantService(makeProvider(new ProviderUnavailableError('timeout')) as never, store as never);
  await assert.rejects(
    service.chat(ENABLED_CALLER, REQUEST),
    (error) => errorCode(error) === 'ASSISTANT_UNAVAILABLE' && httpStatus(error) === 503,
  );
});

test('chat returns a fresh conversationId and persists the turn on success', async () => {
  const { store, state } = makeStore();
  const service = new AssistantService(makeProvider(OK_REPLY) as never, store as never);
  const result = await service.chat(ENABLED_CALLER, REQUEST);
  assert.equal(result.conversationId, 'new-conv-id');
  assert.equal(result.reply, 'Jawaban singkat.');
  assert.equal(result.suggestedActions.length, 1);
  assert.equal(state.appended, 1, 'the turn should be stored exactly once');
});

test('deleteConversation resolves when a transcript existed, else 404', async () => {
  const present = new AssistantService(makeProvider(OK_REPLY) as never, makeStore({ deleted: true }).store as never);
  await present.deleteConversation('u1', 'c1');

  const absent = new AssistantService(makeProvider(OK_REPLY) as never, makeStore({ deleted: false }).store as never);
  await assert.rejects(
    absent.deleteConversation('u1', 'c1'),
    (error) => errorCode(error) === 'CONVERSATION_NOT_FOUND' && httpStatus(error) === 404,
  );
});

test('retrieveKnowledge always includes the safety-net entries and boosts the active page', async () => {
  const entries = retrieveKnowledge('bagaimana cara membaca peta area', 'areas');
  const ids = entries.map((entry) => entry.id);
  assert.ok(ids.includes('fallback-unknown'), 'fallback entry must always be present');
  assert.ok(ids.includes('luar-lingkup'), 'refusal entry must always be present');
  assert.ok(ids.includes('map-baca'), 'the page-relevant entry should be retrieved');
  assert.ok(entries.length <= 6, 'context stays small to save tokens');
});

test('provider filters out disallowed targets and over-long labels', async () => {
  const provider = new AssistantProvider();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: 'ok',
              suggestedActions: [
                { label: 'Buka Scan', target: 'scan' },
                { label: 'x'.repeat(41), target: 'help' },
                { label: 'Bad', target: 'not_a_route' },
                { label: 'Peta', target: 'areas' },
                { label: 'Extra', target: 'help' },
              ],
            }),
          },
        }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  try {
    const reply = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(reply.reply, 'ok');
    // Kept: scan + areas + help(Extra); dropped long label + bad target; capped at 3.
    assert.equal(reply.suggestedActions.length, 3);
    assert.deepEqual(reply.suggestedActions.map((a) => a.target), ['scan', 'areas', 'help']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider raises ProviderUnavailableError on non-JSON model output', async () => {
  const provider = new AssistantProvider();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  try {
    await assert.rejects(
      provider.complete([{ role: 'user', content: 'hi' }]),
      (error) => error instanceof ProviderUnavailableError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider requests a non-streaming body and parses fenced JSON', async () => {
  const provider = new AssistantProvider();
  const originalFetch = globalThis.fetch;
  let sentBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(String(init.body));
    // A model that wraps its JSON in a ```json fence must still parse cleanly.
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '```json\n{"reply":"Halo","suggestedActions":[]}\n```' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    const reply = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(sentBody.stream, false, 'must force stream:false so SSE gateways return one JSON body');
    assert.equal(reply.reply, 'Halo');
    assert.equal(reply.suggestedActions.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

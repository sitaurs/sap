import assert from 'node:assert/strict';
import test from 'node:test';
import { CommunityService } from '../src/community/community.service.js';
import type { Actor, Executor } from '../src/extensions/extension.store.js';

const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-8222-222222222222';

function lifecycleFor(status: string) {
  Object.assign(process.env, {
    NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000', API_INTERNAL_URL: 'http://localhost:3001',
    CONTRACT_VERSION: '1.1.0', SAP_EXTENSION_ENABLED: 'true', SAP_INSTAGRAM_ENABLED: 'true',
    DATABASE_URL: 'postgres://test:test@127.0.0.1/sap_test', REDIS_URL: 'redis://127.0.0.1:6379',
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes',
    CSRF_SECRET: 'test-csrf-secret-that-is-at-least-32-bytes', RESEND_API_KEY: 'test-resend-key', MAIL_FROM: 'test@localhost',
    S3_ENDPOINT: 'https://objects.invalid', S3_BUCKET: 'sap-test', S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret', ML_INFERENCE_URL: 'https://ml.invalid',
    ML_USERNAME: 'test-user', ML_PASSWORD: 'test-password',
  });
  const report = {
    id: REPORT_ID, status: 'verified', public_visibility: 'public', public_ever: true,
    duplicate_of_id: null, revision: 3, public_summary: 'Ringkasan publik', instagram_allowed: true,
    occurred_at: new Date('2026-10-01T00:00:00.000Z'), created_at: new Date('2026-10-01T00:00:00.000Z'),
  };
  const db = (async (parts: TemplateStringsArray) => {
    const sql = parts.join(' ');
    if (sql.includes('FROM reports WHERE id=')) return [report];
    if (sql.includes('FROM instagram_posts p JOIN instagram_accounts')) return [{
      kind: 'initial', milestone_id: null, latest_post_id: POST_ID, generation: 2, status,
    }];
    return [];
  }) as unknown as Executor;
  const service = new CommunityService(
    { db } as never,
    {} as never,
    { latest: async () => null } as never,
  );
  return service.lifecycle(REPORT_ID, { id: 'admin', role: 'admin' } as Actor, db);
}

test('report lifecycle exposes whether the latest Instagram generation can be replaced', async () => {
  const active = await lifecycleFor('draft') as any;
  assert.deepEqual(active.instagramPublicationSeries, [{ kind: 'initial', milestoneId: null,
    latestPostId: POST_ID, generation: 2, status: 'draft', canCreate: false, reasonCode: 'INVALID_TRANSITION' }]);

  const cancelled = await lifecycleFor('cancelled') as any;
  assert.equal(cancelled.instagramPublicationSeries[0].canCreate, true);
  assert.equal(cancelled.instagramPublicationSeries[0].reasonCode, null);
});

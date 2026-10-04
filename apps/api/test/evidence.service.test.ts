import assert from 'node:assert/strict';
import test from 'node:test';
import { EvidenceService } from '../src/evidence/evidence.service.js';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-8222-222222222222';
const OP_ID = '33333333-3333-4333-8333-333333333333';

type OperationStatus = 'queued' | 'failed' | 'needs_action';

async function retractAfterConsentRevocation(status: OperationStatus, uncertainPublish = false) {
  const post = {
    id: POST_ID,
    account_id: '44444444-4444-4444-8444-444444444444',
    status: uncertainPublish ? 'needs_action' : 'published',
    published_at: uncertainPublish ? null : new Date('2026-10-04T00:00:00.000Z'),
    provider_media_id: uncertainPublish ? null : 'ig-media-123',
  };
  const existing = { id: OP_ID, status, stage: status === 'needs_action' ? 'delete_requested' : status,
    channels: { sap: 'unaffected', instagram: 'pending' } };
  const publish = uncertainPublish ? { id: '55555555-5555-4555-8555-555555555555', status: 'needs_action', stage: 'uncertain' } : null;
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?').replace(/\s+/g, ' ').trim();
    statements.push({ sql, values });
    if (sql.startsWith('SELECT p.* FROM instagram_posts')) return [post];
    if (sql.includes("kind='retract'")) return [existing];
    if (sql.includes("kind='publish'")) return publish ? [publish] : [];
    return [];
  }, { json: (value: unknown) => value });

  const service = new EvidenceService({} as never, {} as never, {} as never);
  const retract = Reflect.get(service, 'retractMediaUses') as (tx: unknown, mediaId: string) => Promise<void>;
  await retract.call(service, tx, MEDIA_ID);

  const postUpdate = statements.find(({ sql }) => sql.startsWith('UPDATE instagram_posts SET status='));
  assert.ok(postUpdate, 'consent withdrawal updates the associated publication');
  const operationUpdate = statements.find(({ sql }) => sql.startsWith("UPDATE instagram_operations SET status='needs_action'"));
  return { postStatus: postUpdate.values[0], operationStatus: operationUpdate ? 'needs_action' : status,
    operationUpdate, statements };
}

test('consent revocation keeps an already queued retract actionable without creating a second operation', async () => {
  const result = await retractAfterConsentRevocation('queued');

  assert.equal(result.postStatus, 'retracting');
  assert.equal(result.operationStatus, 'queued');
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO instagram_operations')), false);
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events')), false,
    'the existing queued operation is recovered by the worker operation recovery loop');
});

test('consent revocation preserves a failed retract for explicit operator retry', async () => {
  const result = await retractAfterConsentRevocation('failed');

  assert.equal(result.postStatus, 'failed');
  assert.equal(result.operationStatus, 'failed');
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO instagram_operations')), false);
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events')), false,
    'consent withdrawal does not silently retry a failed provider operation');
});

test('consent revocation preserves needs_action when the publish media ID is still uncertain', async () => {
  const result = await retractAfterConsentRevocation('needs_action', true);

  assert.equal(result.postStatus, 'needs_action');
  assert.equal(result.operationStatus, 'needs_action');
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO instagram_operations')), false);
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events')), false,
    'the uncertain operation must be reconciled or explicitly handled, never automatically retried');
});

test('consent revocation does not downgrade a failed retract when its publish operation is uncertain', async () => {
  const result = await retractAfterConsentRevocation('failed', true);

  assert.equal(result.postStatus, 'needs_action',
    'uncertain provider publication identity takes precedence over a stale failed status');
  assert.equal(result.operationStatus, 'needs_action');
  assert.deepEqual(result.operationUpdate?.values[0], { sap: 'unaffected', instagram: 'needs_action' });
  assert.equal(result.statements.some(({ sql }) => sql.startsWith('INSERT INTO outbox_events')), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ScanRepository, jakartaDay } from '../src/scan-repository.js';
import type { AdapterResult } from '../src/ml-adapter.js';

const classified: AdapterResult = {
  outcome: 'classified', categoryId: 'plastic',
  predictions: [{ categoryId: 'plastic', score: 0.9 }], providerRevision: 'test',
};

function harness(count = 0) {
  let active = true;
  let dedup = true;
  let conflict = false;
  let awards = count;
  let ledger = 0;
  let persisted = -1;
  const statements: string[] = [];
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?');
    statements.push(query);
    if (/SELECT status, processing_generation/.test(query)) return active ? [{ status: 'processing', processing_generation: 1 }] : [];
    if (/INSERT INTO scan_dedup_keys/.test(query)) return dedup ? [{ id: 'dedup' }] : [];
    if (/SELECT scan_award_count/.test(query)) return [{ scan_award_count: awards }];
    if (/INSERT INTO point_ledger/.test(query)) {
      if (conflict) return [];
      ledger += 10;
      return [{ delta: 10 }];
    }
    if (/UPDATE user_daily_activity/.test(query)) awards++;
    if (/UPDATE scans/.test(query)) { persisted = values[3] as number; active = false; }
    return [];
  }, { json: (value: unknown) => value });
  const sql = { begin: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx) };
  return {
    repo: new ScanRepository(sql as never), statements,
    duplicate: () => { dedup = false; }, conflict: () => { conflict = true; },
    totals: () => ({ awards, ledger, persisted }),
  };
}

test('fifth classified scan earns ten points, completion replay earns nothing', async () => {
  const h = harness(4);
  assert.deepEqual(await h.repo.completeSucceeded('scan', 1, 'user', 'hash', classified), { accepted: true, pointsAwarded: 10 });
  assert.deepEqual(await h.repo.completeSucceeded('scan', 1, 'user', 'hash', classified), { accepted: false, pointsAwarded: 0 });
  assert.deepEqual(h.totals(), { awards: 5, ledger: 10, persisted: 10 });
  assert.ok(h.statements.some(query => /FOR UPDATE/.test(query) && /SELECT scan_award_count/.test(query)));
});

test('daily cap completes classification without awarding or incrementing quota', async () => {
  const h = harness(5);
  assert.deepEqual(await h.repo.completeSucceeded('scan', 1, 'user', 'hash', classified), { accepted: true, pointsAwarded: 0 });
  assert.deepEqual(h.totals(), { awards: 5, ledger: 0, persisted: 0 });
});

test('duplicate image does not consume another daily award', async () => {
  const h = harness(2); h.duplicate();
  await h.repo.completeSucceeded('scan', 1, 'user', 'hash', classified);
  assert.deepEqual(h.totals(), { awards: 2, ledger: 0, persisted: 0 });
});

test('ledger idempotency conflict does not increment daily activity or claim an award', async () => {
  const h = harness(2); h.conflict();
  await h.repo.completeSucceeded('scan', 1, 'user', 'hash', classified);
  assert.deepEqual(h.totals(), { awards: 2, ledger: 0, persisted: 0 });
});

for (const outcome of ['unknown', 'no_waste'] as const) {
  test(`${outcome} succeeds without an award or a dedup reservation`, async () => {
    const h = harness();
    await h.repo.completeSucceeded('scan', 1, 'user', 'hash', { ...classified, outcome, categoryId: null });
    assert.deepEqual(h.totals(), { awards: 0, ledger: 0, persisted: 0 });
    assert.ok(!h.statements.some(query => /INSERT INTO scan_dedup_keys/.test(query)));
  });
}

test('daily scan quota rolls over at Jakarta midnight', () => {
  assert.equal(jakartaDay(Date.parse('2026-10-07T16:59:59Z')), '2026-10-07');
  assert.equal(jakartaDay(Date.parse('2026-10-07T17:00:00Z')), '2026-10-08');
});

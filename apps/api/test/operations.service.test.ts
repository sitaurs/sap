import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { csvCell, OperationsService } from '../src/admin/operations.service.js';

const admin = { id: '11111111-1111-4111-8111-111111111111', role: 'admin', emailVerified: true } as const;
const user = { ...admin, role: 'user' } as const;
const target = '22222222-2222-4222-8222-222222222222';
const session = { reauthenticatedAt: new Date() };
function code(error: unknown) {
  return ((error as HttpException).getResponse() as { code?: string }).code;
}

test('admin role changes require recent reauthentication and cannot target own account', async () => {
  const service = new OperationsService({} as never);
  await assert.rejects(service.role(admin as never, { reauthenticatedAt: null } as never, target, crypto.randomUUID(), { role: 'admin', expectedRole: 'user', reason: 'Perlu admin baru' }),
    error => code(error) === 'REAUTHENTICATION_REQUIRED');
  await assert.rejects(service.role(admin as never, session as never, admin.id, crypto.randomUUID(), { role: 'user', expectedRole: 'admin', reason: 'Turunkan peran' }),
    error => code(error) === 'SELF_ROLE_CHANGE');
});

test('non-admin cannot list users, export reports, or assign reports', async () => {
  const service = new OperationsService({} as never);
  await assert.rejects(service.users(user as never, {}), error => code(error) === 'FORBIDDEN');
  await assert.rejects(service.exportCsv(user as never, {}), error => code(error) === 'FORBIDDEN');
  await assert.rejects(service.assign(user as never, target, 1, crypto.randomUUID(), { assigneeId: null, dueAt: null, note: '' }), error => code(error) === 'FORBIDDEN');
});

test('pending admin map includes the H3 cell required by the locality editor', async () => {
  const rows = [{ id: target, status: 'submitted', description: 'Laporan sintetis', lat: -6.2, lon: 106.8, h3_cell: '8928308280fffff', created_at: new Date('2026-10-09T00:00:00Z') }];
  const db = async () => rows;
  const service = new OperationsService({ db } as never);
  const result = await service.pendingMap(admin as never);
  assert.deepEqual(result.items[0], {
    id: target, status: 'submitted', description: 'Laporan sintetis', lat: -6.2, lon: 106.8,
    cellId: '8928308280fffff', createdAt: '2026-10-09T00:00:00.000Z',
  });
});

test('CSV export neutralizes formula prefixes including whitespace and quotes', () => {
  assert.equal(csvCell('=HYPERLINK("https://bad.invalid")'), '"\'=HYPERLINK(""https://bad.invalid"")"');
  assert.equal(csvCell(' +1+1'), '"\' +1+1"');
  assert.equal(csvCell('Biasa'), '"Biasa"');
  assert.equal(csvCell(null), '""');
});

test('evidence request reaches only the report owner and leaves moderation status unchanged', async () => {
  const statements: string[] = [];
  const reports = [{ reporter_id: target, status: 'submitted', revision: 7 }];
  const tx = async (parts: TemplateStringsArray) => {
    const sql = parts.join(' ').replace(/\s+/g, ' ').trim(); statements.push(sql);
    if (sql.includes('FROM reports WHERE id=')) return reports;
    if (sql.includes('FROM users WHERE id=')) return [{ id: target }];
    return [];
  };
  const store = {
    db: {},
    mutate: async (...args: unknown[]) => (args[4] as (tx: never) => Promise<unknown>)(tx as never),
    audit: async (_tx: never, _actorId: string, _action: string, _type: string, _id: string, changes: { messageLength: number }) => assert.equal(changes.messageLength, 28),
  };
  const service = new OperationsService(store as never);
  const result = await service.requestEvidence(admin as never, target, crypto.randomUUID(), { message: 'Mohon tambahkan foto lokasi.' });
  assert.deepEqual(result, { reportId: target, notified: true });
  assert.ok(statements.some(sql => sql.includes("'evidence_requested'")));
  assert.equal(statements.some(sql => sql.startsWith('UPDATE reports')), false);
  assert.equal(reports[0]?.status, 'submitted');
});

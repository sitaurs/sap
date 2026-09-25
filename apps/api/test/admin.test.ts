import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionContext, HttpException } from '@nestjs/common';
import { AdminService } from '../src/admin/admin.service.js';
import { AdminGuard } from '../src/admin/admin.guard.js';
import {
  awardAction,
  isSameStatusPublish,
  isValidDuplicateTarget,
  isValidTransition,
  requiresInitialPublicSummary,
} from '../src/admin/moderation.types.js';
import type { DecideResult } from '../src/admin/moderation.repository.js';
import type { DecisionInputDto } from '../src/admin/dto.js';
import type { ReportRecord, ReportStatus, ReportView } from '../src/reports/report.types.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const REPORT = '33333333-3333-3333-3333-333333333333';
const TARGET = '44444444-4444-4444-4444-444444444444';
const MEDIA = '22222222-2222-2222-2222-222222222222';
const KEY = '11111111-1111-1111-1111-111111111111';

function makeService(opts: {
  decideResult?: DecideResult;
  ownedMedia?: boolean;
  mediaPurpose?: 'scan' | 'report' | 'resolution';
  candidates?: unknown[] | null;
  listRows?: ReportRecord[];
} = {}) {
  const decideArgs: unknown[] = [];
  const moderation = {
    decide: async (input: unknown) => {
      decideArgs.push(input);
      return opts.decideResult ?? ({ ok: true, view: { id: REPORT } as ReportView, replayed: false } as DecideResult);
    },
    listReports: async (limit: number) => (opts.listRows ?? []).slice(0, limit),
    listDuplicateCandidates: async () => (opts.candidates === undefined ? [] : opts.candidates),
    adminStats: async () => ({
      submittedReports: 1,
      verifiedReports: 0,
      inProgressReports: 0,
      resolvedReports: 0,
      oldestPendingAt: null,
    }),
  };
  const media = {
    findStoredForOwner: async (id: string) =>
      opts.ownedMedia === false ? null : { id, ownerId: 'admin', purpose: opts.mediaPurpose ?? 'resolution' },
  };
  const service = new AdminService(moderation as never, media as never);
  return { service, decideArgs };
}

function decision(over: Partial<DecisionInputDto> = {}): DecisionInputDto {
  return { nextStatus: 'verified', reason: 'looks valid', publicSummary: 'Public summary', ...over } as DecisionInputDto;
}

function record(id: string): ReportRecord {
  const now = new Date('2026-09-25T00:00:00.000Z');
  return {
    id,
    revision: 1,
    status: 'submitted',
    categoryId: null,
    scanId: null,
    description: 'x'.repeat(25),
    reportedSeverity: 'small',
    latitude: -6.2,
    longitude: 106.8,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    publicSummary: null,
    duplicateOfId: null,
    evidenceMediaIds: [],
    resolutionMediaIds: [],
    publishedMediaIds: [],
    timeline: [],
  };
}

// --- Pure transition + points logic -----------------------------------------

test('isValidTransition follows the DATABASE.md status graph', () => {
  assert.equal(isValidTransition('submitted', 'verified'), true);
  assert.equal(isValidTransition('submitted', 'in_progress'), false);
  assert.equal(isValidTransition('verified', 'in_progress'), true);
  assert.equal(isValidTransition('in_progress', 'resolved'), true);
  assert.equal(isValidTransition('resolved', 'verified'), true);
  assert.equal(isValidTransition('rejected', 'submitted'), true);
  assert.equal(isValidTransition('duplicate', 'submitted'), true);
  assert.equal(isValidTransition('submitted', 'resolved'), false);
  assert.equal(isValidTransition('rejected', 'verified'), false);
});

test('same-status decisions are valid only for publicly-eligible statuses', () => {
  assert.equal(isValidTransition('verified', 'verified'), true);
  assert.equal(isValidTransition('in_progress', 'in_progress'), true);
  assert.equal(isValidTransition('resolved', 'resolved'), true);
  assert.equal(isValidTransition('submitted', 'submitted'), false);
  assert.equal(isValidTransition('rejected', 'rejected'), false);
  assert.equal(isSameStatusPublish('verified', 'verified'), true);
  assert.equal(isSameStatusPublish('submitted', 'submitted'), false);
});

test('awardAction awards on entering and reverses on leaving the verified family', () => {
  assert.equal(awardAction('submitted', 'verified'), 'award');
  assert.equal(awardAction('verified', 'in_progress'), 'none');
  assert.equal(awardAction('in_progress', 'resolved'), 'none');
  assert.equal(awardAction('resolved', 'verified'), 'none');
  assert.equal(awardAction('verified', 'rejected'), 'reverse');
  assert.equal(awardAction('resolved', 'duplicate'), 'reverse');
  assert.equal(awardAction('verified', 'verified'), 'none');
  assert.equal(awardAction('submitted', 'rejected'), 'none');
});

test('requiresInitialPublicSummary only on a fresh entry into verified', () => {
  assert.equal(requiresInitialPublicSummary('submitted', 'verified'), true);
  assert.equal(requiresInitialPublicSummary('resolved', 'verified'), false, 're-verify from the family is not initial');
  assert.equal(requiresInitialPublicSummary('verified', 'verified'), false);
  assert.equal(requiresInitialPublicSummary('in_progress', 'resolved'), false);
});

test('isValidDuplicateTarget rejects self, chains, and non-canonical targets', () => {
  const ok = { id: TARGET, status: 'verified' as ReportStatus, duplicateOfId: null };
  assert.equal(isValidDuplicateTarget(ok, REPORT), true);
  assert.equal(isValidDuplicateTarget({ ...ok, id: REPORT }, REPORT), false, 'no self');
  assert.equal(isValidDuplicateTarget({ ...ok, duplicateOfId: 'x' }, REPORT), false, 'no chain');
  assert.equal(isValidDuplicateTarget({ ...ok, status: 'submitted' }, REPORT), false, 'must be canonical');
});

// --- AdminService orchestration + error mapping -----------------------------

test('decideReport rejects a duplicate decision without duplicateOfId', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.decideReport('admin', REPORT, 1, KEY, null, decision({ nextStatus: 'duplicate', duplicateOfId: null })),
    (e) => errorCode(e) === 'REPORT_INVALID',
  );
});

test('decideReport rejects a resolved decision without resolution media', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.decideReport('admin', REPORT, 1, KEY, null, decision({ nextStatus: 'resolved', resolutionMediaIds: [] })),
    (e) => errorCode(e) === 'REPORT_INVALID',
  );
});

test('decideReport rejects resolution media the admin does not own with NOT_FOUND', async () => {
  const { service } = makeService({ ownedMedia: false });
  await assert.rejects(
    service.decideReport('admin', REPORT, 1, KEY, null, decision({ nextStatus: 'resolved', resolutionMediaIds: [MEDIA] })),
    (e) => errorCode(e) === 'NOT_FOUND',
  );
});

test('decideReport rejects resolution media with the wrong purpose (MEDIA_INVALID)', async () => {
  const { service } = makeService({ mediaPurpose: 'scan' });
  await assert.rejects(
    service.decideReport('admin', REPORT, 1, KEY, null, decision({ nextStatus: 'resolved', resolutionMediaIds: [MEDIA] })),
    (e) => errorCode(e) === 'MEDIA_INVALID',
  );
});

const FAILURE_CASES: Array<[DecideResult, string]> = [
  [{ ok: false, reason: 'not_found' }, 'NOT_FOUND'],
  [{ ok: false, reason: 'conflict' }, 'REVISION_CONFLICT'],
  [{ ok: false, reason: 'invalid_transition' }, 'INVALID_TRANSITION'],
  [{ ok: false, reason: 'duplicate_target_invalid' }, 'REPORT_INVALID'],
  [{ ok: false, reason: 'summary_required' }, 'REPORT_INVALID'],
  [{ ok: false, reason: 'resolution_media_required' }, 'REPORT_INVALID'],
  [{ ok: false, reason: 'publish_media_invalid' }, 'MEDIA_INVALID'],
];

for (const [decideResult, code] of FAILURE_CASES) {
  test(`decideReport maps repo failure ${(decideResult as { reason: string }).reason} -> ${code}`, async () => {
    const { service } = makeService({ decideResult });
    await assert.rejects(
      service.decideReport('admin', REPORT, 1, KEY, null, decision()),
      (e) => errorCode(e) === code,
    );
  });
}

test('decideReport returns the updated report view on success', async () => {
  const { service, decideArgs } = makeService();
  const view = await service.decideReport('admin', REPORT, 3, KEY, 'req-1', decision());
  assert.equal(view.id, REPORT);
  assert.equal((decideArgs[0] as { ifMatchRevision: number }).ifMatchRevision, 3);
  assert.equal((decideArgs[0] as { requestId: string }).requestId, 'req-1');
});

test('listAdminReports reports nextCursor only when another page exists', async () => {
  const rows = [record('r0'), record('r1'), record('r2')];
  const more = makeService({ listRows: rows });
  const page = await more.service.listAdminReports(2, undefined, undefined);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, 'r1');

  const exact = makeService({ listRows: rows.slice(0, 2) });
  const page2 = await exact.service.listAdminReports(2, undefined, undefined);
  assert.equal(page2.nextCursor, null);
});

test('listDuplicateCandidates surfaces an unknown report as NOT_FOUND', async () => {
  const { service } = makeService({ candidates: null });
  await assert.rejects(service.listDuplicateCandidates(REPORT), (e) => errorCode(e) === 'NOT_FOUND');
});

// --- AdminGuard --------------------------------------------------------------

function context(role: string | undefined): ExecutionContext {
  const req = role === undefined ? {} : { user: { role } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

test('AdminGuard allows admins and rejects everyone else with FORBIDDEN', () => {
  const guard = new AdminGuard();
  assert.equal(guard.canActivate(context('admin')), true);
  assert.throws(() => guard.canActivate(context('user')), (e) => errorCode(e) === 'FORBIDDEN');
  assert.throws(() => guard.canActivate(context(undefined)), (e) => errorCode(e) === 'FORBIDDEN');
});

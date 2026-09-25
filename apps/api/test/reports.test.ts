import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { ReportsService } from '../src/reports/reports.service.js';
import { isOccurredAtValid, type ReportRecord } from '../src/reports/report.types.js';
import { toH3Cell } from '../src/reports/geo.js';
import type { ReportInputDto, ReportUpdateInputDto } from '../src/reports/dto.js';
import type { UpdateReportResult } from '../src/reports/report.repository.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const KEY = '11111111-1111-1111-1111-111111111111';
const MEDIA = '22222222-2222-2222-2222-222222222222';
const REPORT = '33333333-3333-3333-3333-333333333333';

function record(over: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: REPORT,
    revision: 1,
    status: 'submitted',
    categoryId: null,
    scanId: null,
    description: 'x'.repeat(25),
    reportedSeverity: 'small',
    latitude: -6.2,
    longitude: 106.8,
    occurredAt: new Date('2026-09-25T00:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
    publicSummary: null,
    duplicateOfId: null,
    evidenceMediaIds: [MEDIA],
    resolutionMediaIds: [],
    publishedMediaIds: [],
    timeline: [
      { id: 'e1', toStatus: 'submitted', reason: null, occurredAt: new Date('2026-09-25T00:00:00.000Z') },
    ],
    ...over,
  };
}

interface Stub {
  service: ReportsService;
  state: { created: number };
  updateArgs: Array<{ reportId: string; revision: number }>;
}

function makeService(opts: {
  ownedMedia?: boolean;
  ownedScan?: boolean;
  createReplayed?: boolean;
  found?: ReportRecord | null;
  listRows?: ReportRecord[];
  updateResult?: UpdateReportResult;
} = {}): Stub {
  const state = { created: 0 };
  const updateArgs: Array<{ reportId: string; revision: number }> = [];
  const media = {
    findStoredForOwner: async (id: string) => (opts.ownedMedia === false ? null : { id, ownerId: 'u1' }),
  };
  const scans = {
    findByIdForOwner: async (id: string) => (opts.ownedScan === false ? null : { id }),
  };
  const reports = {
    createIdempotent: async (input: { userId: string }) => {
      state.created += 1;
      void input;
      return { view: {} as never, replayed: opts.createReplayed ?? false };
    },
    findForViewer: async () => opts.found ?? null,
    listByOwner: async (_u: string, limit: number) => (opts.listRows ?? []).slice(0, limit),
    updateOwnedSubmitted: async (reportId: string, _u: string, revision: number) => {
      updateArgs.push({ reportId, revision });
      return opts.updateResult ?? ({ ok: true, record: record() } as UpdateReportResult);
    },
  };
  const service = new ReportsService(reports as never, media as never, scans as never);
  return { service, state, updateArgs };
}

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function input(over: Partial<ReportInputDto> = {}): ReportInputDto {
  return {
    mediaIds: [MEDIA],
    description: 'Tumpukan sampah di pinggir sungai dekat pasar.',
    location: { latitude: -6.2, longitude: 106.8 },
    occurredAt: nowIso(-60_000),
    reportedSeverity: 'small',
    ...over,
  } as ReportInputDto;
}

test('toH3Cell yields a res-9 cell id (15 hex chars)', () => {
  const cell = toH3Cell(-6.2, 106.8);
  assert.match(cell, /^[0-9a-f]{15}$/);
});

test('isOccurredAtValid rejects the future and anything older than 30 days', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  assert.equal(isOccurredAtValid(new Date(now - 1000), now), true);
  assert.equal(isOccurredAtValid(new Date(now + 60_000), now), false, 'future is invalid');
  assert.equal(isOccurredAtValid(new Date(now - 31 * 24 * 3600 * 1000), now), false, '>30 days is invalid');
  assert.equal(isOccurredAtValid(new Date('nope'), now), false);
});

test('createReport rejects an occurredAt in the future with REPORT_INVALID', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.createReport('u1', input({ occurredAt: nowIso(60_000) }), KEY),
    (e) => errorCode(e) === 'REPORT_INVALID',
  );
});

test('createReport rejects media the caller does not own with NOT_FOUND', async () => {
  const { service } = makeService({ ownedMedia: false });
  await assert.rejects(service.createReport('u1', input(), KEY), (e) => errorCode(e) === 'NOT_FOUND');
});

test('createReport rejects a scanId the caller does not own with NOT_FOUND', async () => {
  const { service } = makeService({ ownedScan: false });
  await assert.rejects(
    service.createReport('u1', input({ scanId: '44444444-4444-4444-4444-444444444444' }), KEY),
    (e) => errorCode(e) === 'NOT_FOUND',
  );
});

test('createReport creates a report for valid, owned input', async () => {
  const stub = makeService();
  await stub.service.createReport('u1', input(), KEY);
  assert.equal(stub.state.created, 1);
});

test('getReport returns NOT_FOUND when the viewer cannot see it', async () => {
  const { service } = makeService({ found: null });
  await assert.rejects(service.getReport('u1', false, REPORT), (e) => errorCode(e) === 'NOT_FOUND');
});

test('getReport maps a visible report to the contract view', async () => {
  const { service } = makeService({ found: record({ categoryId: 'plastic' }) });
  const view = await service.getReport('u1', false, REPORT);
  assert.equal(view.id, REPORT);
  assert.equal(view.status, 'submitted');
  assert.equal(view.categoryId, 'plastic');
  assert.deepEqual(view.location, { latitude: -6.2, longitude: 106.8 });
  assert.deepEqual(view.mediaIds, [MEDIA]);
  assert.deepEqual(view.resolutionMediaIds, []);
  assert.equal(view.publicSummary, null);
  assert.equal(view.timeline.length, 1);
  assert.equal(view.timeline[0]!.status, 'submitted');
  assert.equal(view.timeline[0]!.note, '');
});

test('listMyReports reports nextCursor only when another page exists', async () => {
  const rows = [record({ id: 'r0' }), record({ id: 'r1' }), record({ id: 'r2' })];
  const withMore = makeService({ listRows: rows });
  const page = await withMore.service.listMyReports('u1', 2, undefined, undefined);
  assert.equal(page.items.length, 2);
  assert.equal(page.nextCursor, 'r1');

  const exact = makeService({ listRows: rows.slice(0, 2) });
  const page2 = await exact.service.listMyReports('u1', 2, undefined, undefined);
  assert.equal(page2.nextCursor, null);
});

test('updateReport rejects an empty change set with VALIDATION_ERROR', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.updateReport('u1', REPORT, 1, {} as ReportUpdateInputDto),
    (e) => errorCode(e) === 'VALIDATION_ERROR',
  );
});

test('updateReport surfaces a stale revision as REVISION_CONFLICT', async () => {
  const { service } = makeService({ updateResult: { ok: false, reason: 'conflict' } });
  await assert.rejects(
    service.updateReport('u1', REPORT, 1, { description: 'y'.repeat(25) } as ReportUpdateInputDto),
    (e) => errorCode(e) === 'REVISION_CONFLICT',
  );
});

test('updateReport surfaces a non-submitted report as FORBIDDEN', async () => {
  const { service } = makeService({ updateResult: { ok: false, reason: 'not_editable' } });
  await assert.rejects(
    service.updateReport('u1', REPORT, 1, { description: 'y'.repeat(25) } as ReportUpdateInputDto),
    (e) => errorCode(e) === 'FORBIDDEN',
  );
});

test('updateReport surfaces an unknown/foreign report as NOT_FOUND', async () => {
  const { service } = makeService({ updateResult: { ok: false, reason: 'not_found' } });
  await assert.rejects(
    service.updateReport('u1', REPORT, 1, { description: 'y'.repeat(25) } as ReportUpdateInputDto),
    (e) => errorCode(e) === 'NOT_FOUND',
  );
});

test('updateReport passes the If-Match revision through and validates new media', async () => {
  const stub = makeService();
  await stub.service.updateReport('u1', REPORT, 7, { mediaIds: [MEDIA] } as ReportUpdateInputDto);
  assert.deepEqual(stub.updateArgs, [{ reportId: REPORT, revision: 7 }]);
});

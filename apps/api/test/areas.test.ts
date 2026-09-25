import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpException } from '@nestjs/common';
import { toH3Cell } from '../src/reports/geo.js';
import { AreasService } from '../src/areas/areas.service.js';
import {
  aggregateByCell,
  computeRisk,
  parseBbox,
  resolveRange,
  MAX_AREA_CELLS,
  type EligibleIncident,
  type PublicStatus,
} from '../src/areas/areas.types.js';
import type { PublicReportRow, SnapshotRow } from '../src/areas/areas.repository.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const CELL = toH3Cell(-6.2, 106.8);
const BBOX = '106.7,-6.3,106.9,-6.1';

function incident(status: PublicStatus, day: string, cellId = CELL): EligibleIncident {
  return { cellId, status, occurredAt: new Date(`${day}T05:00:00.000Z`) };
}

function makeService(opts: {
  cells?: string[];
  byCells?: EligibleIncident[];
  forCell?: EligibleIncident[];
  reports?: PublicReportRow[];
  snapshot?: SnapshotRow | null;
  failLive?: boolean;
} = {}) {
  const areas = {
    findCandidateCells: async () => {
      if (opts.failLive) throw new Error('db down');
      return opts.cells ?? [CELL];
    },
    loadIncidentsByCells: async () => opts.byCells ?? [],
    loadIncidentsForCell: async () => {
      if (opts.failLive) throw new Error('db down');
      return opts.forCell ?? [];
    },
    listCellReports: async (_cell: string, _r: unknown, _c: unknown, limit: number) =>
      (opts.reports ?? []).slice(0, limit),
    readSnapshot: async () => (opts.snapshot === undefined ? null : opts.snapshot),
    writeSnapshot: async () => undefined,
  };
  const storage = {
    createSignedGetUrl: async (key: string) => ({ url: `https://signed.example/${key}`, expiresAt: new Date() }),
  };
  return new AreasService(areas as never, storage as never);
}

// --- Pure aggregation (HOTSPOT_RULES §4 + §7 acceptance examples) ------------

test('computeRisk applies the two-distinct-days thresholds', () => {
  assert.equal(computeRisk(5, 2), 'high');
  assert.equal(computeRisk(5, 1), 'low', 'five on one day is still low');
  assert.equal(computeRisk(3, 2), 'medium');
  assert.equal(computeRisk(3, 1), 'low');
  assert.equal(computeRisk(2, 2), 'low');
  assert.equal(computeRisk(1, 1), 'low');
});

test('example B: 5 canonical on 3 days, 2 resolved -> high, open 3 resolved 2', () => {
  const incidents = [
    incident('verified', '2026-09-20'),
    incident('verified', '2026-09-20'),
    incident('verified', '2026-09-21'),
    incident('resolved', '2026-09-22'),
    incident('resolved', '2026-09-22'),
  ];
  const [agg] = aggregateByCell(incidents);
  assert.equal(agg!.incidentCount, 5);
  assert.equal(agg!.openIncidentCount, 3);
  assert.equal(agg!.resolvedIncidentCount, 2);
  assert.equal(agg!.distinctDays, 3);
  assert.equal(agg!.riskLevel, 'high');
});

test('example C: 5 canonical on a single day -> low', () => {
  const [agg] = aggregateByCell(Array.from({ length: 5 }, () => incident('verified', '2026-09-20')));
  assert.equal(agg!.incidentCount, 5);
  assert.equal(agg!.distinctDays, 1);
  assert.equal(agg!.riskLevel, 'low');
});

test('example D: 3 on 2 days -> medium; dropping to 2 -> low', () => {
  const medium = aggregateByCell([
    incident('verified', '2026-09-20'),
    incident('verified', '2026-09-21'),
    incident('in_progress', '2026-09-21'),
  ])[0];
  assert.equal(medium!.riskLevel, 'medium');
  const low = aggregateByCell([incident('verified', '2026-09-20'), incident('verified', '2026-09-21')])[0];
  assert.equal(low!.incidentCount, 2);
  assert.equal(low!.riskLevel, 'low');
});

test('example A: a lone canonical (duplicates already excluded) -> count 1, low', () => {
  const [agg] = aggregateByCell([incident('verified', '2026-09-20')]);
  assert.equal(agg!.incidentCount, 1);
  assert.equal(agg!.riskLevel, 'low');
});

test('distinctDays uses Asia/Jakarta calendar days', () => {
  // 2026-09-20T18:00Z is 2026-09-21 01:00 in Jakarta (UTC+7) -> a different day.
  const incidents: EligibleIncident[] = [
    { cellId: CELL, status: 'verified', occurredAt: new Date('2026-09-20T05:00:00Z') },
    { cellId: CELL, status: 'verified', occurredAt: new Date('2026-09-20T18:00:00Z') },
  ];
  assert.equal(aggregateByCell(incidents)[0]!.distinctDays, 2);
});

// --- Range + bbox parsing ----------------------------------------------------

test('resolveRange defaults to 30 days and rejects >90-day or inverted windows', () => {
  const now = Date.parse('2026-09-25T00:00:00Z');
  const def = resolveRange(undefined, undefined, now)!;
  assert.equal(def.to.getTime(), now);
  assert.equal(def.to.getTime() - def.from.getTime(), 30 * 24 * 60 * 60 * 1_000);
  assert.equal(resolveRange('2026-01-01T00:00:00Z', '2026-09-25T00:00:00Z', now), null, 'over 90 days');
  assert.equal(resolveRange('2026-09-25T00:00:00Z', '2026-09-20T00:00:00Z', now), null, 'from >= to');
  assert.equal(resolveRange('not-a-date', undefined, now), null);
});

test('parseBbox validates order and ranges', () => {
  assert.deepEqual(parseBbox('106.7,-6.3,106.9,-6.1'), { minLng: 106.7, minLat: -6.3, maxLng: 106.9, maxLat: -6.1 });
  assert.equal(parseBbox('106.9,-6.3,106.7,-6.1'), null, 'minLng >= maxLng');
  assert.equal(parseBbox('1,2,3'), null, 'needs 4 parts');
  assert.equal(parseBbox('200,-6.3,206.9,-6.1'), null, 'lng out of range');
});

// --- Service orchestration ---------------------------------------------------

test('listAreas rejects a malformed bbox with VALIDATION_ERROR', async () => {
  const service = makeService();
  await assert.rejects(service.listAreas('bad', undefined, undefined, null), (e) => errorCode(e) === 'VALIDATION_ERROR');
});

test('listAreas rejects an over-90-day window with VALIDATION_ERROR', async () => {
  const service = makeService();
  await assert.rejects(
    service.listAreas(BBOX, '2026-01-01T00:00:00Z', '2026-09-25T00:00:00Z', null),
    (e) => errorCode(e) === 'VALIDATION_ERROR',
  );
});

test('listAreas rejects a bbox spanning too many cells with MAP_BOUNDS_TOO_LARGE', async () => {
  const service = makeService({ cells: Array.from({ length: MAX_AREA_CELLS + 1 }, (_, i) => `cell${i}`) });
  await assert.rejects(service.listAreas(BBOX, undefined, undefined, null), (e) => errorCode(e) === 'MAP_BOUNDS_TOO_LARGE');
});

test('listAreas returns a FeatureCollection with full-cell counts', async () => {
  const service = makeService({
    byCells: [incident('verified', '2026-09-20'), incident('resolved', '2026-09-21')],
  });
  const view = await service.listAreas(BBOX, undefined, undefined, null);
  assert.equal(view.type, 'FeatureCollection');
  assert.equal(view.methodVersion, 'reports-h3-v1');
  assert.equal(view.isStale, false);
  assert.equal(view.features.length, 1);
  assert.equal(view.features[0]!.properties.incidentCount, 2);
  assert.equal(view.features[0]!.geometry.type, 'Polygon');
});

test('listAreas falls back to a stale snapshot when the live read fails', async () => {
  const feature = { type: 'Feature', id: CELL, geometry: { type: 'Polygon', coordinates: [] }, properties: {} };
  const service = makeService({ failLive: true, snapshot: { asOf: new Date('2026-09-24T00:00:00Z'), payload: { features: [feature] } } });
  const view = await service.listAreas(BBOX, undefined, undefined, null);
  assert.equal(view.isStale, true);
  assert.equal(view.asOf, '2026-09-24T00:00:00.000Z');
  assert.equal(view.features.length, 1);
});

test('listAreas surfaces 503 when the live read fails and no snapshot exists', async () => {
  const service = makeService({ failLive: true, snapshot: null });
  await assert.rejects(service.listAreas(BBOX, undefined, undefined, null), (e) => errorCode(e) === 'DEPENDENCY_UNAVAILABLE');
});

test('getArea rejects a non-res9 cell with VALIDATION_ERROR', async () => {
  const service = makeService();
  await assert.rejects(service.getArea('not-a-cell', undefined, undefined, null), (e) => errorCode(e) === 'VALIDATION_ERROR');
});

test('getArea returns AREA_NO_DATA when the cell has no eligible incidents', async () => {
  const service = makeService({ forCell: [] });
  await assert.rejects(service.getArea(CELL, undefined, undefined, null), (e) => errorCode(e) === 'AREA_NO_DATA');
});

test('getArea returns a single-cell detail feature', async () => {
  const service = makeService({ forCell: [incident('verified', '2026-09-20'), incident('verified', '2026-09-20')] });
  const detail = await service.getArea(CELL, undefined, undefined, null);
  assert.equal(detail.feature.id, CELL);
  assert.equal(detail.feature.properties.incidentCount, 2);
  assert.equal(detail.isStale, false);
});

test('listAreaReports redacts rows, signs published media, and pages by id', async () => {
  const rows: PublicReportRow[] = [
    { id: 'r1', status: 'verified', categoryId: 'plastic', occurredAt: new Date('2026-09-21T00:00:00Z'), publicSummary: 'Tumpukan sampah', derivativeKey: 'pub/r1.jpg' },
    { id: 'r2', status: 'resolved', categoryId: null, occurredAt: new Date('2026-09-20T00:00:00Z'), publicSummary: null, derivativeKey: null },
  ];
  const service = makeService({ reports: rows });
  const page = await service.listAreaReports(CELL, undefined, undefined, null, 1, undefined);
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, 'r1', 'more rows than the page size -> cursor is last returned id');
  assert.equal(page.items[0]!.summary, 'Tumpukan sampah');
  assert.equal(page.items[0]!.publicMediaUrl, 'https://signed.example/pub/r1.jpg');

  const full = await service.listAreaReports(CELL, undefined, undefined, null, 20, undefined);
  assert.equal(full.nextCursor, null);
  assert.equal(full.items[1]!.summary, '', 'missing publicSummary becomes empty string');
  assert.equal(full.items[1]!.publicMediaUrl, null, 'no derivative -> null media url');
});

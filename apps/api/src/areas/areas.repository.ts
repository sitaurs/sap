import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { CategoryId } from '../scans/scan.types.js';
import type { DateRange, EligibleIncident, PublicStatus } from './areas.types.js';
import type { Bbox } from './areas.types.js';

/** A public report row for the area detail listing (no reporter, no exact coords). */
export interface PublicReportRow {
  id: string;
  status: PublicStatus;
  categoryId: CategoryId | null;
  occurredAt: Date;
  publicSummary: string | null;
  /** Reviewed public derivative object key, or null when nothing has been published. */
  derivativeKey: string | null;
}

export interface SnapshotRow {
  asOf: Date;
  payload: unknown;
}

@Injectable()
export class AreasRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /**
   * Eligible-incident predicate shared by every area query so the map, list, and
   * detail endpoints count exactly the same reports (HOTSPOT_RULES §3): a canonical
   * (non-duplicate) report in the verified family whose occurredAt falls in [from,to).
   */
  private eligible(range: DateRange, categoryId: CategoryId | null) {
    return this.sql`
      status IN ('verified', 'in_progress', 'resolved')
      AND duplicate_of_id IS NULL
      AND occurred_at >= ${range.from} AND occurred_at < ${range.to}
      ${categoryId ? this.sql`AND category_id = ${categoryId}` : this.sql``}`;
  }

  /**
   * Distinct H3 cells that intersect the bbox and hold at least one eligible
   * incident. The bbox only selects which cells to show; counts are computed over
   * each cell's full contents (below) so numbers do not shift with pan/zoom.
   */
  async findCandidateCells(bbox: Bbox, range: DateRange, categoryId: CategoryId | null): Promise<string[]> {
    const rows = await this.sql<{ h3_cell: string }[]>`
      SELECT DISTINCT h3_cell FROM reports
      WHERE ${this.eligible(range, categoryId)}
        AND ST_Within(
          location::geometry,
          ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326))`;
    return rows.map((r) => r.h3_cell);
  }

  /** All eligible incidents inside the given cells (full-cell counts, ignores bbox). */
  async loadIncidentsByCells(
    cells: string[],
    range: DateRange,
    categoryId: CategoryId | null,
  ): Promise<EligibleIncident[]> {
    if (cells.length === 0) return [];
    const rows = await this.sql<{ h3_cell: string; status: PublicStatus; occurred_at: Date }[]>`
      SELECT h3_cell, status, occurred_at FROM reports
      WHERE ${this.eligible(range, categoryId)}
        AND h3_cell = ANY(${cells}::text[])`;
    return rows.map((r) => ({ cellId: r.h3_cell, status: r.status, occurredAt: r.occurred_at }));
  }

  /** All eligible incidents in a single cell (backs the detail endpoint). */
  async loadIncidentsForCell(
    cellId: string,
    range: DateRange,
    categoryId: CategoryId | null,
  ): Promise<EligibleIncident[]> {
    const rows = await this.sql<{ status: PublicStatus; occurred_at: Date }[]>`
      SELECT status, occurred_at FROM reports
      WHERE ${this.eligible(range, categoryId)} AND h3_cell = ${cellId}`;
    return rows.map((r) => ({ cellId, status: r.status, occurredAt: r.occurred_at }));
  }

  /**
   * Keyset page of public (redacted) reports in a cell, newest first. Each row
   * carries at most one reviewed public derivative key; the service turns it into
   * a short-lived signed URL. Reporter identity, address, and exact coordinates
   * are never selected.
   */
  async listCellReports(
    cellId: string,
    range: DateRange,
    categoryId: CategoryId | null,
    limit: number,
    cursor: string | null,
  ): Promise<PublicReportRow[]> {
    const rows = await this.sql<
      {
        id: string;
        status: PublicStatus;
        category_id: CategoryId | null;
        occurred_at: Date;
        public_summary: string | null;
        derivative_key: string | null;
      }[]
    >`
      SELECT r.id, r.status, r.category_id, r.occurred_at, r.public_summary,
        (SELECT m.public_derivative_key FROM report_media rm
           JOIN media m ON m.id = rm.media_id
           WHERE rm.report_id = r.id AND m.public_derivative_key IS NOT NULL
           ORDER BY rm.sort_order ASC, rm.created_at ASC
           LIMIT 1) AS derivative_key
      FROM reports r
      WHERE r.status IN ('verified', 'in_progress', 'resolved')
        AND r.duplicate_of_id IS NULL
        AND r.occurred_at >= ${range.from} AND r.occurred_at < ${range.to}
        ${categoryId ? this.sql`AND r.category_id = ${categoryId}` : this.sql``}
        AND r.h3_cell = ${cellId}
        ${cursor ? this.sql`AND (r.occurred_at, r.id) < (SELECT occurred_at, id FROM reports WHERE id = ${cursor})` : this.sql``}
      ORDER BY r.occurred_at DESC, r.id DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      categoryId: r.category_id,
      occurredAt: r.occurred_at,
      publicSummary: r.public_summary,
      derivativeKey: r.derivative_key,
    }));
  }

  /** Read the newest still-valid cached snapshot for a cache key, if any. */
  async readSnapshot(cacheKey: string): Promise<SnapshotRow | null> {
    const rows = await this.sql<{ as_of: Date; payload: unknown }[]>`
      SELECT as_of, payload FROM area_snapshots
      WHERE cache_key = ${cacheKey}
      ORDER BY as_of DESC LIMIT 1`;
    const row = rows[0];
    return row ? { asOf: row.as_of, payload: row.payload } : null;
  }

  /** Upsert a snapshot for a cache key (best-effort cache; always rebuildable). */
  async writeSnapshot(input: {
    cacheKey: string;
    methodVersion: string;
    from: Date;
    to: Date;
    categoryId: CategoryId | null;
    asOf: Date;
    payload: unknown;
    expiresAt: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO area_snapshots (cache_key, method_version, from_at, to_at, category_id, as_of, payload, expires_at)
      VALUES (${input.cacheKey}, ${input.methodVersion}, ${input.from}, ${input.to}, ${input.categoryId},
              ${input.asOf}, ${this.sql.json(input.payload as never)}, ${input.expiresAt})
      ON CONFLICT (cache_key) DO UPDATE SET
        method_version = EXCLUDED.method_version,
        from_at = EXCLUDED.from_at,
        to_at = EXCLUDED.to_at,
        category_id = EXCLUDED.category_id,
        as_of = EXCLUDED.as_of,
        payload = EXCLUDED.payload,
        expires_at = EXCLUDED.expires_at`;
  }
}

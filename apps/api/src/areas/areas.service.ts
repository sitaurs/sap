import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { CategoryId } from '../scans/scan.types.js';
import { cellToPolygon, isReportCell } from '../reports/geo.js';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { AreasRepository, type PublicReportRow } from './areas.repository.js';
import {
  aggregateByCell,
  parseBbox,
  resolveRange,
  MAX_AREA_CELLS,
  METHOD_VERSION,
  type AreaAggregate,
  type AreaDetailView,
  type AreaFeatureView,
  type AreasView,
  type DateRange,
  type PublicReportPageView,
  type PublicReportView,
} from './areas.types.js';

/** TTL for a best-effort cached snapshot (refresh cadence is ~5 min, HOTSPOT_RULES §7). */
const SNAPSHOT_TTL_MS = 10 * 60 * 1_000;
export const DEFAULT_AREA_REPORTS_PAGE = 20;

@Injectable()
export class AreasService {
  constructor(
    private readonly areas: AreasRepository,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Build the hotspot FeatureCollection for a bbox. The bbox chooses which cells
   * are shown; every shown cell is counted over its full contents so numbers stay
   * stable across pan/zoom. Rejects a bbox spanning more than {@link MAX_AREA_CELLS}
   * cells. On a live-read failure, falls back to the last snapshot (isStale=true);
   * with no snapshot, surfaces 503.
   */
  async listAreas(
    bboxRaw: string,
    fromRaw: string | undefined,
    toRaw: string | undefined,
    categoryId: CategoryId | null,
  ): Promise<AreasView> {
    const bbox = parseBbox(bboxRaw);
    if (!bbox) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'bbox tidak valid (west,south,east,north).' });
    const range = this.range(fromRaw, toRaw);
    const asOf = new Date();
    const cacheKey = `map:${METHOD_VERSION}:${range.from.toISOString()}:${range.to.toISOString()}:${categoryId ?? '*'}:${bboxRaw}`;

    try {
      const cells = await this.areas.findCandidateCells(bbox, range, categoryId);
      if (cells.length > MAX_AREA_CELLS) {
        throw new UnprocessableEntityException({
          code: 'MAP_BOUNDS_TOO_LARGE',
          message: `Area terlalu luas (>${MAX_AREA_CELLS} sel). Perkecil bbox.`,
        });
      }
      const incidents = await this.areas.loadIncidentsByCells(cells, range, categoryId);
      const features = aggregateByCell(incidents).map(toFeature);
      await this.saveSnapshot(cacheKey, range, categoryId, asOf, features);
      return this.areasView(features, range, asOf, false);
    } catch (error) {
      if (isHttpError(error)) throw error;
      const snapshot = await this.readSnapshotFeatures(cacheKey);
      if (!snapshot) {
        throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Agregasi area tidak tersedia.' });
      }
      return this.areasView(snapshot.features, range, snapshot.asOf, true);
    }
  }

  /** Single-cell summary with the same filters. 400 for a non-res9 cell, 404 when the cell has no eligible incidents. */
  async getArea(
    cellId: string,
    fromRaw: string | undefined,
    toRaw: string | undefined,
    categoryId: CategoryId | null,
  ): Promise<AreaDetailView> {
    if (!isReportCell(cellId)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'cellId bukan sel H3 resolusi 9 yang valid.' });
    }
    const range = this.range(fromRaw, toRaw);
    const asOf = new Date();
    const cacheKey = `cell:${METHOD_VERSION}:${range.from.toISOString()}:${range.to.toISOString()}:${categoryId ?? '*'}:${cellId}`;

    let feature: AreaFeatureView | null;
    try {
      const incidents = await this.areas.loadIncidentsForCell(cellId, range, categoryId);
      const aggregates = aggregateByCell(incidents);
      feature = aggregates.length > 0 ? toFeature(aggregates[0]!) : null;
      if (feature) await this.saveSnapshot(cacheKey, range, categoryId, asOf, [feature]);
      if (!feature) throw new NotFoundException({ code: 'AREA_NO_DATA', message: 'Sel belum memiliki data.' });
      return { feature, from: range.from.toISOString(), to: range.to.toISOString(), asOf: asOf.toISOString(), methodVersion: METHOD_VERSION, isStale: false };
    } catch (error) {
      if (isHttpError(error)) throw error;
      const snapshot = await this.readSnapshotFeatures(cacheKey);
      if (!snapshot || snapshot.features.length === 0) {
        throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Agregasi area tidak tersedia.' });
      }
      return {
        feature: snapshot.features[0]!,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        asOf: snapshot.asOf.toISOString(),
        methodVersion: METHOD_VERSION,
        isStale: true,
      };
    }
  }

  /**
   * Public, redacted reports in a cell (keyset paged). Summaries are the moderator's
   * publicSummary; a media URL is a short-lived signed link to an approved public
   * derivative, or null. Reporter, address, and exact coordinates are never exposed.
   */
  async listAreaReports(
    cellId: string,
    fromRaw: string | undefined,
    toRaw: string | undefined,
    categoryId: CategoryId | null,
    limit: number | undefined,
    cursor: string | undefined,
  ): Promise<PublicReportPageView> {
    if (!isReportCell(cellId)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'cellId bukan sel H3 resolusi 9 yang valid.' });
    }
    const range = this.range(fromRaw, toRaw);
    const pageSize = limit ?? DEFAULT_AREA_REPORTS_PAGE;
    const rows = await this.areas.listCellReports(cellId, range, categoryId, pageSize + 1, cursor ?? null);
    const page = rows.slice(0, pageSize);
    const nextCursor = rows.length > pageSize ? page[page.length - 1]!.id : null;
    const items = await Promise.all(page.map((row) => this.toPublicReport(row)));
    return { items, nextCursor };
  }

  private range(fromRaw: string | undefined, toRaw: string | undefined): DateRange {
    const range = resolveRange(fromRaw, toRaw);
    if (!range) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Rentang tanggal tidak valid: from < to dan maksimal 90 hari.',
      });
    }
    return range;
  }

  private async toPublicReport(row: PublicReportRow): Promise<PublicReportView> {
    let publicMediaUrl: string | null = null;
    if (row.derivativeKey) {
      const signed = await this.storage.createSignedGetUrl(row.derivativeKey);
      publicMediaUrl = signed.url;
    }
    return {
      id: row.id,
      status: row.status,
      categoryId: row.categoryId,
      occurredAt: row.occurredAt.toISOString(),
      summary: row.publicSummary ?? '',
      publicMediaUrl,
    };
  }

  private areasView(features: AreaFeatureView[], range: DateRange, asOf: Date, isStale: boolean): AreasView {
    return {
      type: 'FeatureCollection',
      features,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      asOf: asOf.toISOString(),
      methodVersion: METHOD_VERSION,
      isStale,
    };
  }

  private async saveSnapshot(
    cacheKey: string,
    range: DateRange,
    categoryId: CategoryId | null,
    asOf: Date,
    features: AreaFeatureView[],
  ): Promise<void> {
    try {
      await this.areas.writeSnapshot({
        cacheKey,
        methodVersion: METHOD_VERSION,
        from: range.from,
        to: range.to,
        categoryId,
        asOf,
        payload: { features },
        expiresAt: new Date(asOf.getTime() + SNAPSHOT_TTL_MS),
      });
    } catch {
      // Best-effort cache: a snapshot write failure must not fail the request.
    }
  }

  private async readSnapshotFeatures(cacheKey: string): Promise<{ features: AreaFeatureView[]; asOf: Date } | null> {
    const snapshot = await this.areas.readSnapshot(cacheKey);
    if (!snapshot) return null;
    const payload = snapshot.payload as { features?: AreaFeatureView[] } | null;
    return { features: payload?.features ?? [], asOf: snapshot.asOf };
  }
}

function toFeature(aggregate: AreaAggregate): AreaFeatureView {
  return {
    type: 'Feature',
    id: aggregate.cellId,
    geometry: cellToPolygon(aggregate.cellId),
    properties: {
      cellId: aggregate.cellId,
      riskLevel: aggregate.riskLevel,
      incidentCount: aggregate.incidentCount,
      openIncidentCount: aggregate.openIncidentCount,
      resolvedIncidentCount: aggregate.resolvedIncidentCount,
      distinctDays: aggregate.distinctDays,
    },
  };
}

function isHttpError(error: unknown): boolean {
  return typeof (error as { getStatus?: () => number })?.getStatus === 'function';
}

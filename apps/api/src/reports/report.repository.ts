import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { IdempotencyStore, type Tx } from '../infrastructure/idempotency.store.js';
import type { CategoryId } from '../scans/scan.types.js';
import {
  toReportView,
  type ReportRecord,
  type ReportSeverity,
  type ReportStatus,
  type ReportStatusEventRecord,
  type ReportView,
} from './report.types.js';

interface ReportRow {
  id: string;
  revision: number;
  status: ReportStatus;
  category_id: CategoryId | null;
  scan_id: string | null;
  description: string;
  reported_severity: ReportSeverity;
  latitude: number;
  longitude: number;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
  public_summary: string | null;
  duplicate_of_id: string | null;
}

const REPORT_COLUMNS = (sql: Database | Tx) => sql`
  id, revision, status, category_id, scan_id, description, reported_severity,
  ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
  occurred_at, created_at, updated_at, public_summary, duplicate_of_id`;

export interface CreateReportInput {
  userId: string;
  mediaIds: string[];
  description: string;
  latitude: number;
  longitude: number;
  h3Cell: string;
  occurredAt: Date;
  reportedSeverity: ReportSeverity;
  categoryId: CategoryId | null;
  scanId: string | null;
  actorScope: string;
  route: string;
  key: string;
  requestHash: string;
}

export interface UpdateReportChanges {
  mediaIds?: string[];
  description?: string;
  latitude?: number;
  longitude?: number;
  h3Cell?: string;
  occurredAt?: Date;
  reportedSeverity?: ReportSeverity;
  categoryId?: CategoryId | null;
}

export type UpdateReportResult =
  | { ok: true; record: ReportRecord }
  | { ok: false; reason: 'not_found' | 'not_editable' | 'conflict' };

@Injectable()
export class ReportRepository {
  constructor(
    @Inject(DATABASE) private readonly sql: Database,
    private readonly idempotency: IdempotencyStore,
  ) {}

  /**
   * Create a submitted report under an idempotency reservation. The reservation,
   * the report row, its evidence media links, and the initial status event all
   * commit in one transaction so a duplicate `Idempotency-Key` replays the
   * original 201 body without ever creating a second report.
   */
  async createIdempotent(input: CreateReportInput): Promise<{ view: ReportView; replayed: boolean }> {
    return this.sql.begin(async (tx) => {
      const replay = await this.idempotency.reserve(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        requestHash: input.requestHash,
      });
      if (replay) return { view: replay.body as ReportView, replayed: true };

      const rows = await tx<ReportRow[]>`
        INSERT INTO reports (
          reporter_id, scan_id, category_id, description, reported_severity,
          occurred_at, location, h3_cell, status
        ) VALUES (
          ${input.userId}, ${input.scanId}, ${input.categoryId}, ${input.description}, ${input.reportedSeverity},
          ${input.occurredAt}, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326), ${input.h3Cell}, 'submitted'
        )
        RETURNING ${REPORT_COLUMNS(tx)}`;
      const row = rows[0]!;

      await this.insertEvidence(tx, row.id, input.mediaIds);
      const eventRows = await tx<{ id: string; occurred_at: Date }[]>`
        INSERT INTO report_status_events (report_id, actor_id, from_status, to_status)
        VALUES (${row.id}, ${input.userId}, NULL, 'submitted')
        RETURNING id, occurred_at`;

      const record: ReportRecord = {
        ...mapReportRow(row),
        evidenceMediaIds: input.mediaIds,
        resolutionMediaIds: [],
        publishedMediaIds: [],
        timeline: [{ id: eventRows[0]!.id, toStatus: 'submitted', reason: null, occurredAt: eventRows[0]!.occurred_at }],
      };
      const view = toReportView(record);
      await this.idempotency.storeResponse(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        statusCode: 201,
        body: view,
      });
      return { view, replayed: false };
    });
  }

  private async insertEvidence(tx: Tx, reportId: string, mediaIds: string[]): Promise<void> {
    for (let i = 0; i < mediaIds.length; i += 1) {
      await tx`
        INSERT INTO report_media (report_id, media_id, sort_order, kind)
        VALUES (${reportId}, ${mediaIds[i]!}, ${i}, 'evidence')`;
    }
  }

  /**
   * Load a report for a viewer. Returns null when the report does not exist or
   * the viewer is neither its owner nor an admin (indistinguishable -> 404).
   */
  async findForViewer(reportId: string, viewerId: string, isAdmin: boolean): Promise<ReportRecord | null> {
    const rows = await this.sql<(ReportRow & { reporter_id: string | null })[]>`
      SELECT ${REPORT_COLUMNS(this.sql)}, reporter_id FROM reports WHERE id = ${reportId} LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    if (!isAdmin && row.reporter_id !== viewerId) return null;
    const [media, timeline] = await Promise.all([
      this.loadMedia([reportId]),
      this.loadTimeline([reportId]),
    ]);
    return this.assemble(row, media, timeline);
  }

  /** Keyset pagination over (created_at, id) descending, optional status filter. */
  async listByOwner(
    userId: string,
    limit: number,
    cursor: string | null,
    status: ReportStatus | null,
  ): Promise<ReportRecord[]> {
    const rows = await this.sql<ReportRow[]>`
      SELECT ${REPORT_COLUMNS(this.sql)} FROM reports
      WHERE reporter_id = ${userId}
        ${status ? this.sql`AND status = ${status}` : this.sql``}
        ${cursor ? this.sql`AND (created_at, id) < (SELECT created_at, id FROM reports WHERE id = ${cursor})` : this.sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [media, timeline] = await Promise.all([this.loadMedia(ids), this.loadTimeline(ids)]);
    return rows.map((row) => this.assemble(row, media, timeline));
  }

  /**
   * Apply an owner edit to a still-submitted report with optimistic concurrency.
   * Locks the row, then enforces ownership, editable status, and the If-Match
   * revision before writing. Bumps the revision on success.
   */
  async updateOwnedSubmitted(
    reportId: string,
    userId: string,
    ifMatchRevision: number,
    changes: UpdateReportChanges,
  ): Promise<UpdateReportResult> {
    return this.sql.begin(async (tx) => {
      const current = await tx<{ reporter_id: string | null; status: ReportStatus; revision: number }[]>`
        SELECT reporter_id, status, revision FROM reports WHERE id = ${reportId} FOR UPDATE`;
      const row = current[0];
      if (!row || row.reporter_id !== userId) return { ok: false, reason: 'not_found' } as const;
      if (row.status !== 'submitted') return { ok: false, reason: 'not_editable' } as const;
      if (row.revision !== ifMatchRevision) return { ok: false, reason: 'conflict' } as const;

      await tx`
        UPDATE reports SET
          description = ${changes.description ?? tx`description`},
          reported_severity = ${changes.reportedSeverity ?? tx`reported_severity`},
          occurred_at = ${changes.occurredAt ?? tx`occurred_at`},
          category_id = ${changes.categoryId !== undefined ? changes.categoryId : tx`category_id`},
          location = ${
            changes.latitude !== undefined && changes.longitude !== undefined
              ? tx`ST_SetSRID(ST_MakePoint(${changes.longitude}, ${changes.latitude}), 4326)`
              : tx`location`
          },
          h3_cell = ${changes.h3Cell ?? tx`h3_cell`},
          revision = revision + 1,
          updated_at = now()
        WHERE id = ${reportId}`;

      if (changes.mediaIds) {
        await tx`DELETE FROM report_media WHERE report_id = ${reportId} AND kind = 'evidence'`;
        await this.insertEvidence(tx, reportId, changes.mediaIds);
      }

      const rows = await tx<ReportRow[]>`SELECT ${REPORT_COLUMNS(tx)} FROM reports WHERE id = ${reportId} LIMIT 1`;
      const [media, timeline] = await Promise.all([
        this.loadMedia([reportId], tx),
        this.loadTimeline([reportId], tx),
      ]);
      return { ok: true, record: this.assemble(rows[0]!, media, timeline) } as const;
    });
  }

  /** Assemble a full report record (row + media + timeline) using any executor. */
  async readRecord(reportId: string, exec: Database | Tx = this.sql): Promise<ReportRecord | null> {
    const rows = await exec<ReportRow[]>`SELECT ${REPORT_COLUMNS(exec)} FROM reports WHERE id = ${reportId} LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    const [media, timeline] = await Promise.all([this.loadMedia([reportId], exec), this.loadTimeline([reportId], exec)]);
    return this.assemble(row, media, timeline);
  }

  private async loadMedia(
    reportIds: string[],
    exec: Database | Tx = this.sql,
  ): Promise<Map<string, { evidence: string[]; resolution: string[]; published: string[] }>> {
    const rows = await exec<
      { report_id: string; media_id: string; kind: 'evidence' | 'resolution'; public_derivative_key: string | null }[]
    >`
      SELECT rm.report_id, rm.media_id, rm.kind, m.public_derivative_key
      FROM report_media rm
      JOIN media m ON m.id = rm.media_id
      WHERE rm.report_id = ANY(${reportIds}::uuid[])
      ORDER BY rm.sort_order ASC, rm.created_at ASC`;
    const map = new Map<string, { evidence: string[]; resolution: string[]; published: string[] }>();
    for (const row of rows) {
      let entry = map.get(row.report_id);
      if (!entry) {
        entry = { evidence: [], resolution: [], published: [] };
        map.set(row.report_id, entry);
      }
      if (row.kind === 'resolution') entry.resolution.push(row.media_id);
      else entry.evidence.push(row.media_id);
      // publishedMediaIds are only media with a reviewed public derivative.
      if (row.public_derivative_key !== null) entry.published.push(row.media_id);
    }
    return map;
  }

  private async loadTimeline(
    reportIds: string[],
    exec: Database | Tx = this.sql,
  ): Promise<Map<string, ReportStatusEventRecord[]>> {
    const rows = await exec<{ id: string; report_id: string; to_status: ReportStatus; reason: string | null; occurred_at: Date }[]>`
      SELECT id, report_id, to_status, reason, occurred_at
      FROM report_status_events
      WHERE report_id = ANY(${reportIds}::uuid[])
      ORDER BY occurred_at ASC, id ASC`;
    const map = new Map<string, ReportStatusEventRecord[]>();
    for (const row of rows) {
      const entry = map.get(row.report_id) ?? [];
      entry.push({ id: row.id, toStatus: row.to_status, reason: row.reason, occurredAt: row.occurred_at });
      map.set(row.report_id, entry);
    }
    return map;
  }

  private assemble(
    row: ReportRow,
    media: Map<string, { evidence: string[]; resolution: string[]; published: string[] }>,
    timeline: Map<string, ReportStatusEventRecord[]>,
  ): ReportRecord {
    const m = media.get(row.id) ?? { evidence: [], resolution: [], published: [] };
    return {
      ...mapReportRow(row),
      evidenceMediaIds: m.evidence,
      resolutionMediaIds: m.resolution,
      publishedMediaIds: m.published,
      timeline: timeline.get(row.id) ?? [],
    };
  }
}

function mapReportRow(
  row: ReportRow,
): Omit<ReportRecord, 'evidenceMediaIds' | 'resolutionMediaIds' | 'publishedMediaIds' | 'timeline'> {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    categoryId: row.category_id,
    scanId: row.scan_id,
    description: row.description,
    reportedSeverity: row.reported_severity,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publicSummary: row.public_summary,
    duplicateOfId: row.duplicate_of_id,
  };
}


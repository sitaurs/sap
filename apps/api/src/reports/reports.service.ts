import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MediaRepository } from '../media/media.repository.js';
import { ScanRepository } from '../scans/scan.repository.js';
import type { CategoryId } from '../scans/scan.types.js';
import { toH3Cell } from './geo.js';
import { isOccurredAtValid, toReportView, type ReportStatus, type ReportView } from './report.types.js';
import { ReportRepository, type UpdateReportChanges } from './report.repository.js';
import type { ReportInputDto, ReportUpdateInputDto } from './dto.js';

export const REPORTS_ROUTE = 'POST /reports';
export const DEFAULT_REPORTS_PAGE = 20;

export interface ReportPageView {
  items: ReportView[];
  nextCursor: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly media: MediaRepository,
    private readonly scans: ScanRepository,
  ) {}

  async createReport(userId: string, dto: ReportInputDto, idempotencyKey: string): Promise<ReportView> {
    const occurredAt = new Date(dto.occurredAt);
    if (!isOccurredAtValid(occurredAt)) {
      throw new UnprocessableEntityException({
        code: 'REPORT_INVALID',
        message: 'occurredAt tidak boleh di masa depan dan maksimal 30 hari sebelum sekarang.',
      });
    }

    await this.assertOwnedStoredMedia(userId, dto.mediaIds);
    const scanId = dto.scanId ?? null;
    if (scanId) await this.assertOwnedScan(userId, scanId);

    const categoryId = (dto.categoryId ?? null) as CategoryId | null;
    const requestHash = canonicalHash({
      mediaIds: dto.mediaIds,
      description: dto.description,
      location: dto.location,
      occurredAt: dto.occurredAt,
      reportedSeverity: dto.reportedSeverity,
      categoryId,
      scanId,
    });

    const { view } = await this.reports.createIdempotent({
      userId,
      mediaIds: dto.mediaIds,
      description: dto.description,
      latitude: dto.location.latitude,
      longitude: dto.location.longitude,
      h3Cell: toH3Cell(dto.location.latitude, dto.location.longitude),
      occurredAt,
      reportedSeverity: dto.reportedSeverity,
      categoryId,
      scanId,
      actorScope: `user:${userId}`,
      route: REPORTS_ROUTE,
      key: idempotencyKey,
      requestHash,
    });
    return view;
  }

  async getReport(userId: string, isAdmin: boolean, reportId: string): Promise<ReportView> {
    const record = await this.reports.findForViewer(reportId, userId, isAdmin);
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Laporan tidak ditemukan.' });
    return toReportView(record);
  }

  async listMyReports(
    userId: string,
    limit: number | undefined,
    cursor: string | undefined,
    status: ReportStatus | undefined,
  ): Promise<ReportPageView> {
    const pageSize = limit ?? DEFAULT_REPORTS_PAGE;
    const records = await this.reports.listByOwner(userId, pageSize + 1, cursor ?? null, status ?? null);
    const page = records.slice(0, pageSize);
    const nextCursor = records.length > pageSize ? page[page.length - 1]!.id : null;
    return { items: page.map(toReportView), nextCursor };
  }

  async updateReport(
    userId: string,
    reportId: string,
    ifMatchRevision: number,
    dto: ReportUpdateInputDto,
  ): Promise<ReportView> {
    const changes: UpdateReportChanges = {};
    let count = 0;

    if (dto.mediaIds !== undefined) {
      await this.assertOwnedStoredMedia(userId, dto.mediaIds);
      changes.mediaIds = dto.mediaIds;
      count += 1;
    }
    if (dto.description !== undefined) {
      changes.description = dto.description;
      count += 1;
    }
    if (dto.reportedSeverity !== undefined) {
      changes.reportedSeverity = dto.reportedSeverity;
      count += 1;
    }
    if (dto.occurredAt !== undefined) {
      const occurredAt = new Date(dto.occurredAt);
      if (!isOccurredAtValid(occurredAt)) {
        throw new UnprocessableEntityException({
          code: 'REPORT_INVALID',
          message: 'occurredAt tidak boleh di masa depan dan maksimal 30 hari sebelum sekarang.',
        });
      }
      changes.occurredAt = occurredAt;
      count += 1;
    }
    if (dto.location !== undefined) {
      changes.latitude = dto.location.latitude;
      changes.longitude = dto.location.longitude;
      changes.h3Cell = toH3Cell(dto.location.latitude, dto.location.longitude);
      count += 1;
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'categoryId')) {
      changes.categoryId = (dto.categoryId ?? null) as CategoryId | null;
      count += 1;
    }

    if (count === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Minimal satu properti wajib diubah.' });
    }

    const result = await this.reports.updateOwnedSubmitted(reportId, userId, ifMatchRevision, changes);
    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Laporan tidak ditemukan.' });
        case 'not_editable':
          throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Hanya laporan submitted yang dapat diedit.' });
        case 'conflict':
          throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'Revisi laporan sudah berubah.' });
      }
    }
    return toReportView(result.record);
  }

  private async assertOwnedStoredMedia(userId: string, mediaIds: string[]): Promise<void> {
    const found = await Promise.all(mediaIds.map((id) => this.media.findStoredForOwner(id, userId)));
    if (found.some((m) => m === null)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media tidak ditemukan.' });
    }
  }

  private async assertOwnedScan(userId: string, scanId: string): Promise<void> {
    const scan = await this.scans.findByIdForOwner(scanId, userId);
    if (!scan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scan tidak ditemukan.' });
  }
}

/** Stable hash of the canonical create payload for idempotent replay matching. */
function canonicalHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

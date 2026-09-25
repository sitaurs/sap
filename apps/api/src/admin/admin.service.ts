import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MediaRepository } from '../media/media.repository.js';
import { DEFAULT_REPORTS_PAGE, type ReportPageView } from '../reports/reports.service.js';
import { toReportView, type ReportStatus, type ReportView } from '../reports/report.types.js';
import { ModerationRepository } from './moderation.repository.js';
import { AuditRepository, type AuditEventView } from './audit.repository.js';
import type { DecisionInputDto } from './dto.js';
import type { AdminStatsView, DuplicateCandidateView } from './moderation.types.js';

export const DECISIONS_ROUTE = 'POST /admin/reports/decisions';
export const DEFAULT_AUDIT_PAGE = 20;

export interface DuplicateCandidatePageView {
  items: DuplicateCandidateView[];
  nextCursor: string | null;
}

export interface AuditEventPageView {
  items: AuditEventView[];
  nextCursor: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly moderation: ModerationRepository,
    private readonly media: MediaRepository,
    private readonly audit: AuditRepository,
  ) {}

  async decideReport(
    actorId: string,
    reportId: string,
    ifMatchRevision: number,
    idempotencyKey: string,
    requestId: string | null,
    dto: DecisionInputDto,
  ): Promise<ReportView> {
    const nextStatus = dto.nextStatus as ReportStatus;
    const duplicateOfId = dto.duplicateOfId ?? null;
    const resolutionMediaIds = dto.resolutionMediaIds ?? [];
    const publishMediaIds = dto.publishMediaIds ?? [];

    if (nextStatus === 'duplicate' && !duplicateOfId) {
      throw new UnprocessableEntityException({
        code: 'REPORT_INVALID',
        message: 'Keputusan duplicate memerlukan duplicateOfId.',
      });
    }
    if (nextStatus === 'resolved' && (resolutionMediaIds.length < 1 || resolutionMediaIds.length > 3)) {
      throw new UnprocessableEntityException({
        code: 'REPORT_INVALID',
        message: 'Keputusan resolved memerlukan 1–3 resolutionMediaIds.',
      });
    }
    if (resolutionMediaIds.length > 0) await this.assertOwnedResolutionMedia(actorId, resolutionMediaIds);

    const requestHash = canonicalHash({
      nextStatus,
      reason: dto.reason,
      duplicateOfId,
      resolutionMediaIds,
      publicSummary: dto.publicSummary ?? null,
      publishMediaIds,
    });

    const result = await this.moderation.decide({
      reportId,
      actorId,
      actorScope: `user:${actorId}`,
      route: DECISIONS_ROUTE,
      key: idempotencyKey,
      requestHash,
      requestId,
      ifMatchRevision,
      nextStatus,
      reason: dto.reason,
      duplicateOfId,
      resolutionMediaIds,
      publicSummary: dto.publicSummary,
      publishMediaIds,
    });

    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Laporan tidak ditemukan.' });
        case 'conflict':
          throw new ConflictException({ code: 'REVISION_CONFLICT', message: 'Revisi laporan sudah berubah.' });
        case 'invalid_transition':
          throw new UnprocessableEntityException({
            code: 'INVALID_TRANSITION',
            message: 'Transisi status tidak diizinkan.',
          });
        case 'duplicate_target_invalid':
          throw new UnprocessableEntityException({
            code: 'REPORT_INVALID',
            message: 'duplicateOfId harus menunjuk laporan canonical yang verified/in_progress/resolved.',
          });
        case 'summary_required':
          throw new UnprocessableEntityException({
            code: 'REPORT_INVALID',
            message: 'Verifikasi awal memerlukan publicSummary.',
          });
        case 'resolution_media_required':
          throw new UnprocessableEntityException({
            code: 'REPORT_INVALID',
            message: 'Keputusan resolved memerlukan 1–3 resolutionMediaIds.',
          });
        case 'publish_media_invalid':
          throw new UnprocessableEntityException({
            code: 'MEDIA_INVALID',
            message: 'publishMediaIds harus media yang sudah terlampir pada laporan.',
          });
      }
    }
    return result.view;
  }

  async listAdminReports(
    limit: number | undefined,
    cursor: string | undefined,
    status: ReportStatus | undefined,
  ): Promise<ReportPageView> {
    const pageSize = limit ?? DEFAULT_REPORTS_PAGE;
    const records = await this.moderation.listReports(pageSize + 1, cursor ?? null, status ?? null);
    const page = records.slice(0, pageSize);
    const nextCursor = records.length > pageSize ? page[page.length - 1]!.id : null;
    return { items: page.map(toReportView), nextCursor };
  }

  async listDuplicateCandidates(reportId: string): Promise<DuplicateCandidatePageView> {
    const items = await this.moderation.listDuplicateCandidates(reportId);
    if (items === null) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Laporan tidak ditemukan.' });
    return { items, nextCursor: null };
  }

  getAdminStats(): Promise<AdminStatsView> {
    return this.moderation.adminStats();
  }

  async listAuditEvents(limit: number | undefined, cursor: string | undefined): Promise<AuditEventPageView> {
    const pageSize = limit ?? DEFAULT_AUDIT_PAGE;
    const rows = await this.audit.listAuditEvents(pageSize + 1, cursor ?? null);
    const page = rows.slice(0, pageSize);
    const nextCursor = rows.length > pageSize ? page[page.length - 1]!.id : null;
    return { items: page, nextCursor };
  }

  private async assertOwnedResolutionMedia(actorId: string, mediaIds: string[]): Promise<void> {
    const found = await Promise.all(mediaIds.map((id) => this.media.findStoredForOwner(id, actorId)));
    if (found.some((m) => m === null)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media resolusi tidak ditemukan.' });
    }
    if (found.some((m) => m!.purpose !== 'resolution')) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_INVALID',
        message: 'resolutionMediaIds harus media dengan purpose resolution.',
      });
    }
  }
}

/** Stable hash of the canonical decision payload for idempotent replay matching. */
function canonicalHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

import type { CategoryId } from '../scans/scan.types.js';

export type ReportStatus = 'submitted' | 'verified' | 'in_progress' | 'resolved' | 'rejected' | 'duplicate';
export type ReportSeverity = 'small' | 'medium' | 'large';

export interface LocationView {
  latitude: number;
  longitude: number;
}

/** OpenAPI `ReportEvent`. */
export interface ReportEventView {
  id: string;
  status: ReportStatus;
  note: string;
  createdAt: string;
}

export interface ReportStatusEventRecord {
  id: string;
  toStatus: ReportStatus;
  reason: string | null;
  occurredAt: Date;
}

/** A report row joined with its media + timeline, as read from the database. */
export interface ReportRecord {
  id: string;
  revision: number;
  status: ReportStatus;
  categoryId: CategoryId | null;
  scanId: string | null;
  description: string;
  reportedSeverity: ReportSeverity;
  latitude: number;
  longitude: number;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  publicSummary: string | null;
  duplicateOfId: string | null;
  evidenceMediaIds: string[];
  resolutionMediaIds: string[];
  publishedMediaIds: string[];
  timeline: ReportStatusEventRecord[];
}

/** OpenAPI `Report`. */
export interface ReportView {
  id: string;
  revision: number;
  status: ReportStatus;
  categoryId: CategoryId | null;
  scanId: string | null;
  description: string;
  reportedSeverity: ReportSeverity;
  location: LocationView;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  mediaIds: string[];
  resolutionMediaIds: string[];
  publicSummary: string | null;
  publishedMediaIds: string[];
  duplicateOfId: string | null;
  timeline: ReportEventView[];
}

export function toReportView(record: ReportRecord): ReportView {
  return {
    id: record.id,
    revision: record.revision,
    status: record.status,
    categoryId: record.categoryId,
    scanId: record.scanId,
    description: record.description,
    reportedSeverity: record.reportedSeverity,
    location: { latitude: record.latitude, longitude: record.longitude },
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    mediaIds: record.evidenceMediaIds,
    resolutionMediaIds: record.resolutionMediaIds,
    publicSummary: record.publicSummary,
    publishedMediaIds: record.publishedMediaIds,
    duplicateOfId: record.duplicateOfId,
    timeline: record.timeline.map((event) => ({
      id: event.id,
      status: event.toStatus,
      note: event.reason ?? '',
      createdAt: event.occurredAt.toISOString(),
    })),
  };
}

/** Maximum age of an incident that may be reported (API_SPEC §: "≤ 30 hari"). */
export const MAX_REPORT_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

/** Validate occurredAt: must not be in the future nor older than 30 days. */
export function isOccurredAtValid(occurredAt: Date, now: number = Date.now()): boolean {
  const ts = occurredAt.getTime();
  if (Number.isNaN(ts)) return false;
  return ts <= now && ts >= now - MAX_REPORT_AGE_MS;
}

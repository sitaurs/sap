import type { ReportStatus } from '../reports/report.types.js';

/** Statuses whose reports are publicly eligible and point-earning (PRD §7). */
export const VERIFIED_FAMILY: readonly ReportStatus[] = ['verified', 'in_progress', 'resolved'];

/** +20 per canonical report the first time it is verified (PRD §7). */
export const REPORT_AWARD_DELTA = 20;
/** Maximum report awards per Asia/Jakarta calendar day (PRD §7). */
export const MAX_REPORT_AWARDS_PER_DAY = 3;

/**
 * Allowed status transitions (DATABASE.md §6). A same-status decision is only
 * permitted for publicly-eligible statuses (metadata/public-media updates) and
 * is handled by {@link isValidTransition} via the `from === to` branch.
 */
const TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  submitted: ['verified', 'rejected', 'duplicate'],
  verified: ['in_progress', 'rejected', 'duplicate'],
  in_progress: ['resolved', 'verified', 'rejected', 'duplicate'],
  resolved: ['verified', 'rejected', 'duplicate'],
  rejected: ['submitted'],
  duplicate: ['submitted'],
};

/**
 * Whether a moderation decision may move a report from `from` to `to`.
 * Same-status decisions are valid only for verified/in_progress/resolved, where
 * they update public metadata/media without changing eligibility.
 */
export function isValidTransition(from: ReportStatus, to: ReportStatus): boolean {
  if (from === to) return VERIFIED_FAMILY.includes(from);
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** A same-status, publish-only decision (metadata/public media, no eligibility change). */
export function isSameStatusPublish(from: ReportStatus, to: ReportStatus): boolean {
  return from === to && VERIFIED_FAMILY.includes(from);
}

/**
 * Points side-effect of a status change:
 * - `award`   when the report enters the verified family (first verify),
 * - `reverse` when it leaves the verified family (verification cancelled),
 * - `none`    otherwise (including same-status publish decisions).
 */
export function awardAction(from: ReportStatus, to: ReportStatus): 'award' | 'reverse' | 'none' {
  const wasEligible = VERIFIED_FAMILY.includes(from);
  const nowEligible = VERIFIED_FAMILY.includes(to);
  if (!wasEligible && nowEligible) return 'award';
  if (wasEligible && !nowEligible) return 'reverse';
  return 'none';
}

/** Initial verification (a fresh entry into the verified family) requires a publicSummary. */
export function requiresInitialPublicSummary(from: ReportStatus, to: ReportStatus): boolean {
  return to === 'verified' && !VERIFIED_FAMILY.includes(from);
}

/** A canonical report a duplicate may point at: itself not a duplicate, and publicly eligible. */
export function isValidDuplicateTarget(target: {
  id: string;
  status: ReportStatus;
  duplicateOfId: string | null;
}, reportId: string): boolean {
  if (target.id === reportId) return false; // no self
  if (target.duplicateOfId !== null) return false; // no chains/cycles
  return VERIFIED_FAMILY.includes(target.status);
}

/** OpenAPI `DuplicateCandidate`. */
export interface DuplicateCandidateView {
  reportId: string;
  status: ReportStatus;
  distanceMeters: number;
  occurredAt: string;
  reasonCodes: string[];
}

/** OpenAPI `AdminStats`. */
export interface AdminStatsView {
  submittedReports: number;
  verifiedReports: number;
  inProgressReports: number;
  resolvedReports: number;
  oldestPendingAt: string | null;
}

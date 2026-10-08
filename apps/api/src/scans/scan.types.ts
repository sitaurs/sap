export type ScanStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type ScanOutcome = 'classified' | 'unknown' | 'no_waste';
export type ScanErrorCode = 'ML_UNAVAILABLE' | 'ML_TIMEOUT' | 'ML_INVALID_RESPONSE' | 'MEDIA_INVALID';
export type ScanPointsReason = 'awarded' | 'daily_limit' | 'duplicate_image' | 'not_classified' | 'pending' | 'failed' | 'unknown';

export const CATEGORY_IDS = [
  'battery',
  'biological',
  'cardboard',
  'clothes',
  'glass',
  'metal',
  'paper',
  'shoes',
  'plastic',
  'trash',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface ScanPrediction {
  categoryId: CategoryId;
  score: number;
}

/** Domain record mirrored from the `scans` table. */
export interface ScanRecord {
  id: string;
  mediaId?: string;
  status: ScanStatus;
  outcome: ScanOutcome | null;
  categoryId: CategoryId | null;
  predictions: ScanPrediction[] | null;
  errorCode: ScanErrorCode | null;
  pointsAwarded: number;
  pointsReason?: ScanPointsReason;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Contract `Scan` shape (OpenAPI). */
export interface ScanView {
  id: string;
  mediaId?: string;
  status: ScanStatus;
  outcome: ScanOutcome | null;
  categoryId: CategoryId | null;
  predictions: ScanPrediction[];
  errorCode: ScanErrorCode | null;
  pointsAwarded: number;
  pointsReason?: ScanPointsReason;
  createdAt: string;
  completedAt: string | null;
}

export function toScanView(record: ScanRecord): ScanView {
  return {
    id: record.id,
    ...(record.mediaId ? { mediaId: record.mediaId } : {}),
    status: record.status,
    outcome: record.outcome,
    categoryId: record.categoryId,
    predictions: (record.predictions ?? []).slice(0, 3),
    errorCode: record.errorCode,
    pointsAwarded: record.pointsAwarded,
    pointsReason: record.status === 'queued' || record.status === 'processing' ? 'pending'
      : record.status === 'failed' ? 'failed'
      : record.pointsAwarded > 0 ? 'awarded'
      : record.outcome === 'unknown' || record.outcome === 'no_waste' ? 'not_classified'
      : record.pointsReason ?? 'unknown',
    createdAt: record.createdAt.toISOString(),
    completedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
  };
}

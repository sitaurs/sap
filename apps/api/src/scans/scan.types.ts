export type ScanStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type ScanOutcome = 'classified' | 'unknown' | 'no_waste';
export type ScanErrorCode = 'ML_UNAVAILABLE' | 'ML_TIMEOUT' | 'ML_INVALID_RESPONSE' | 'MEDIA_INVALID';

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
  status: ScanStatus;
  outcome: ScanOutcome | null;
  categoryId: CategoryId | null;
  predictions: ScanPrediction[] | null;
  errorCode: ScanErrorCode | null;
  pointsAwarded: number;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Contract `Scan` shape (OpenAPI). */
export interface ScanView {
  id: string;
  status: ScanStatus;
  outcome: ScanOutcome | null;
  categoryId: CategoryId | null;
  predictions: ScanPrediction[];
  errorCode: ScanErrorCode | null;
  pointsAwarded: number;
  createdAt: string;
  completedAt: string | null;
}

export function toScanView(record: ScanRecord): ScanView {
  return {
    id: record.id,
    status: record.status,
    outcome: record.outcome,
    categoryId: record.categoryId,
    predictions: (record.predictions ?? []).slice(0, 3),
    errorCode: record.errorCode,
    pointsAwarded: record.pointsAwarded,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
  };
}

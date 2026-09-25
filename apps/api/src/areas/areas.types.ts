import { jakartaToday } from '../gamification/gamification.types.js';
import type { CategoryId } from '../scans/scan.types.js';

/** Only these statuses are eligible incidents (HOTSPOT_RULES §3). */
export type PublicStatus = 'verified' | 'in_progress' | 'resolved';
export type RiskLevel = 'low' | 'medium' | 'high';

export const METHOD_VERSION = 'reports-h3-v1';
export const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1_000;
export const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;
/** A map query touching more than this many cells is rejected (HOTSPOT_RULES §2). */
export const MAX_AREA_CELLS = 2000;

export interface EligibleIncident {
  cellId: string;
  status: PublicStatus;
  occurredAt: Date;
}

export interface AreaAggregate {
  cellId: string;
  riskLevel: RiskLevel;
  incidentCount: number;
  openIncidentCount: number;
  resolvedIncidentCount: number;
  distinctDays: number;
}

/**
 * riskLevel per HOTSPOT_RULES §4: high = ≥5 incidents on ≥2 distinct days;
 * medium = ≥3 on ≥2 days (not high); otherwise low (1–2 incidents, or all on a
 * single day). Zero-incident cells produce no feature and never reach here.
 */
export function computeRisk(incidentCount: number, distinctDays: number): RiskLevel {
  if (incidentCount >= 5 && distinctDays >= 2) return 'high';
  if (incidentCount >= 3 && distinctDays >= 2) return 'medium';
  return 'low';
}

/**
 * Aggregate eligible incidents into per-cell counts. distinctDays counts unique
 * Asia/Jakarta calendar days of occurrence, so several reports on one day do not
 * inflate a repeated-incident signal. The same function backs the map, list, and
 * detail endpoints so their numbers are identical.
 */
export function aggregateByCell(incidents: readonly EligibleIncident[]): AreaAggregate[] {
  const cells = new Map<string, { statuses: PublicStatus[]; days: Set<string> }>();
  for (const inc of incidents) {
    let entry = cells.get(inc.cellId);
    if (!entry) {
      entry = { statuses: [], days: new Set() };
      cells.set(inc.cellId, entry);
    }
    entry.statuses.push(inc.status);
    entry.days.add(jakartaToday(inc.occurredAt.getTime()));
  }
  const out: AreaAggregate[] = [];
  for (const [cellId, entry] of cells) {
    const incidentCount = entry.statuses.length;
    const resolvedIncidentCount = entry.statuses.filter((s) => s === 'resolved').length;
    const openIncidentCount = incidentCount - resolvedIncidentCount;
    const distinctDays = entry.days.size;
    out.push({
      cellId,
      riskLevel: computeRisk(incidentCount, distinctDays),
      incidentCount,
      openIncidentCount,
      resolvedIncidentCount,
      distinctDays,
    });
  }
  return out;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Resolve the [from,to) window: defaults to the 30 days ending now, capped at a
 * 90-day span. Returns null for unparseable dates or an out-of-range window.
 */
export function resolveRange(fromRaw: string | undefined, toRaw: string | undefined, now = Date.now()): DateRange | null {
  const to = toRaw === undefined ? now : Date.parse(toRaw);
  if (Number.isNaN(to)) return null;
  const from = fromRaw === undefined ? to - DEFAULT_RANGE_MS : Date.parse(fromRaw);
  if (Number.isNaN(from)) return null;
  if (from >= to) return null;
  if (to - from > MAX_RANGE_MS) return null;
  return { from: new Date(from), to: new Date(to) };
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Parse a `minLng,minLat,maxLng,maxLat` bbox string; null when malformed or inverted. */
export function parseBbox(raw: string): Bbox | null {
  const parts = raw.split(',').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  return { minLng, minLat, maxLng, maxLat };
}

// --- Contract view types (GeoJSON) ------------------------------------------

export interface AreaProperties {
  cellId: string;
  riskLevel: RiskLevel;
  incidentCount: number;
  openIncidentCount: number;
  resolvedIncidentCount: number;
  distinctDays: number;
}

export interface AreaFeatureView {
  type: 'Feature';
  id: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: AreaProperties;
}

export interface AreasView {
  type: 'FeatureCollection';
  features: AreaFeatureView[];
  from: string;
  to: string;
  asOf: string;
  methodVersion: typeof METHOD_VERSION;
  isStale: boolean;
}

export interface AreaDetailView {
  feature: AreaFeatureView;
  from: string;
  to: string;
  asOf: string;
  methodVersion: typeof METHOD_VERSION;
  isStale: boolean;
}

/** OpenAPI `PublicReport` — never exposes reporter, exact coordinates, or private media. */
export interface PublicReportView {
  id: string;
  status: PublicStatus;
  categoryId: CategoryId | null;
  occurredAt: string;
  summary: string;
  publicMediaUrl: string | null;
}

export interface PublicReportPageView {
  items: PublicReportView[];
  nextCursor: string | null;
}

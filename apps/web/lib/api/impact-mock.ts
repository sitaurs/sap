import type { ImpactQuery, ImpactSummary } from "./impact";

// Synthetic September 2026 records; never read or write production data.
// Aggregating records makes date/scope filters honest rather than scaling totals.
export const impactExampleAreas = [
  { cellId: "8928308280fffff", label: "Area contoh 1" },
  { cellId: "8928308280bffff", label: "Area contoh 2" },
] as const;
const collected = [76, 81, 54.5, 95, 64, 88, 73, 67, 86];
const handedOver = [60, 67, 41, 72, 51, 69, 56, 48, 48];
const activities = Array.from({ length: 12 }, (_, i) => ({
  approvedAt: `2026-09-${String(2 + i * 2).padStart(2, "0")}T05:00:00.000Z`,
  cellId: impactExampleAreas[i < 6 ? 0 : 1].cellId,
  volunteers: Array.from({ length: i < 8 ? 10 : 11 }, (_, n) => (i * 7 + n) % 86),
  collected: collected[i] ?? null,
  handedOver: handedOver[i] ?? null,
}));
const durations = [18, 24, 30, 32, 34, 35, 35, 36, 36, 36, 36, 37, 40, 42, 48, 52, 60, 72];
const reports = durations.map((hours, i) => ({
  resolvedAt: `2026-09-${String(1 + Math.floor(i * 1.5)).padStart(2, "0")}T08:00:00.000Z`,
  cellId: impactExampleAreas[i % 2].cellId, hours,
}));

export async function mockImpactSummary(query: ImpactQuery, signal?: AbortSignal): Promise<ImpactSummary> {
  signal?.throwIfAborted();
  const inside = (at: string, cellId: string) => at >= query.from && at < query.to && (!query.cellId || cellId === query.cellId);
  const eligible = activities.filter(a => inside(a.approvedAt, a.cellId));
  const resolved = reports.filter(r => inside(r.resolvedAt, r.cellId));
  const hours = resolved.map(r => r.hours).sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  const sum = (key: "collected" | "handedOver") => {
    const values = eligible.map(a => a[key]).filter((v): v is number => v !== null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  };
  return {
    ...query, cellId: query.cellId || null, asOf: "2026-09-30T16:59:00.000Z",
    resolvedIncidents: resolved.length, approvedActivities: eligible.length,
    volunteerAttendances: eligible.reduce((n, a) => n + a.volunteers.length, 0),
    uniqueVolunteers: new Set(eligible.flatMap(a => a.volunteers)).size,
    medianResolutionHours: hours.length ? (hours.length % 2 ? hours[middle] : (hours[middle - 1] + hours[middle]) / 2) : null,
    verifiedKg: { collected: sum("collected"), handedOver: sum("handedOver"), recycled: null },
    measurementCoverage: { approvedResults: eligible.length, resultsWithVerifiedWeight: eligible.filter(a => a.collected !== null).length },
    scope: "approved_public_sources", methodologyVersion: "sap-local-impact-v1",
  };
}

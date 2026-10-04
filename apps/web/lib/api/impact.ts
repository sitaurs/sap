import { ApiError, apiGet } from "./client";
import type { components } from "./r1-schema";

export type ImpactSummary = components["schemas"]["ImpactSummary"];
export type ImpactQuery = { from: string; to: string; cellId?: string };

// Separate opt-in for this read-only screen. Never enabled in production.
export const impactMockEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_SAP_IMPACT_MOCK === "1";

export function validateImpactQuery(query: ImpactQuery): string | null {
  const from = Date.parse(query.from), to = Date.parse(query.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    return "Tanggal akhir harus sama atau setelah tanggal mulai.";
  if (to - from > 366 * 86_400_000)
    return "Pilih periode paling lama 366 hari.";
  if (query.cellId && !/^[0-9a-f]{15}$/i.test(query.cellId))
    return "Masukkan ID sel H3 yang valid dari peta area SAP.";
  return null;
}

export async function getImpactSummary(query: ImpactQuery, signal?: AbortSignal): Promise<ImpactSummary> {
  const message = validateImpactQuery(query);
  if (message) throw new ApiError(400, "VALIDATION_ERROR", message);
  if (impactMockEnabled)
    return (await import("./impact-mock")).mockImpactSummary(query, signal);
  return apiGet<ImpactSummary>(`/impact/summary?${new URLSearchParams({
    from: query.from, to: query.to, ...(query.cellId ? { cellId: query.cellId } : {}),
  })}`, signal);
}

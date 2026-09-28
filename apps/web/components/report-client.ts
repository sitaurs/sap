/** Report form adapter using the generated SAP v1 contract types. */
import { createReport as createSapReport, getCsrfToken, getMe, uploadMedia, type ReportInput } from "../lib/api/client";

export async function getReportCsrf(): Promise<string> {
  await getMe();
  return getCsrfToken();
}

export async function uploadReportPhoto(file: File, _csrfToken: string): Promise<string> {
  const media = await uploadMedia(file, "report");
  return media.id;
}

export type ReportPayload = ReportInput;

export async function createReport(payload: ReportPayload, _csrfToken: string, idempotencyKey: string) {
  return createSapReport(payload, idempotencyKey);
}

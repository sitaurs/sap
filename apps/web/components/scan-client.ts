import { createScan, getMe, getScan, uploadMedia, type SapScan } from "../lib/api/client";

export type ScanResponse = SapScan;
export type ScanOperation = { file: File; mediaId?: string; idempotencyKey: string };

export async function createBackendScan(operation: ScanOperation, signal: AbortSignal): Promise<ScanResponse> {
  await getMe(signal);
  if (!operation.mediaId) {
    const media = await uploadMedia(operation.file, "scan", signal);
    operation.mediaId = media.id;
  }
  return createScan(operation.mediaId, operation.idempotencyKey, signal);
}

export async function waitForBackendScan(initial: ScanResponse, signal: AbortSignal): Promise<ScanResponse> {
  let result = initial;
  for (const delay of [2000, 4000, 8000, 8000, 8000, 8000]) {
    if (result.status === "succeeded" || result.status === "failed") return result;
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, delay);
      signal.addEventListener("abort", cancel, { once: true });
    });
    result = await getScan(result.id, signal);
  }
  return result;
}

import type { components } from "./schema";

type Schema = components["schemas"];
export type SapUser = Schema["User"];
export type SapStats = Schema["Stats"];
export type SapScan = Schema["Scan"];
export type SapReport = Schema["Report"];
export type SapCategory = Schema["Category"];
export type SapAchievement = Schema["Achievement"];
export type SapAreas = Schema["Areas"];
export type SapAreaFeature = Schema["AreaFeature"];
export type SapAreaDetail = Schema["AreaDetail"];
export type SapPublicReport = Schema["PublicReport"];
export type SapChallenge = Schema["Challenge"];
export type SapMediaUrl = Schema["MediaUrl"];

type Envelope<T> = { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string[]> } };

// The contract version this client was generated against (schema.d.ts). The API
// echoes X-Contract-Version on every response; a mismatch means the backend moved
// to a contract this build was not generated for, so surface it once for drift
// detection instead of failing silently.
const EXPECTED_CONTRACT_VERSION = "1.0.0";
let contractDriftWarned = false;

function checkContractVersion(response: Response) {
  if (contractDriftWarned) return;
  const seen = response.headers.get("x-contract-version");
  if (seen && seen !== EXPECTED_CONTRACT_VERSION) {
    contractDriftWarned = true;
    console.warn(`SAP contract drift: UI expects ${EXPECTED_CONTRACT_VERSION}, API responded with ${seen}. Regenerate lib/api/schema.d.ts.`);
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fields?: Record<string, string[]>, public readonly retryAfter?: number) {
    super(message);
  }
}

let csrf: { token: string; expiresAt: number } | null = null;

export function clearApiSession() { csrf = null; }

async function readEnvelope<T>(response: Response): Promise<T> {
  checkContractVersion(response);
  let envelope: Envelope<T> | null = null;
  try { envelope = await response.json() as Envelope<T>; } catch { /* A proxy failure may not be JSON. */ }
  if (!response.ok) {
    const code = envelope?.error?.code || (response.status === 503 ? "BACKEND_UNAVAILABLE" : "REQUEST_FAILED");
    const message = envelope?.error?.message || "Permintaan belum berhasil. Coba lagi.";
    throw new ApiError(response.status, code, message, envelope?.error?.fields, Number(response.headers.get("retry-after")) || undefined);
  }
  if (!envelope || !("data" in envelope)) throw new ApiError(response.status, "INVALID_RESPONSE", "Respons API SAP tidak lengkap.");
  return envelope.data as T;
}

export async function getCsrfToken(): Promise<string> {
  if (csrf && csrf.expiresAt > Date.now() + 30_000) return csrf.token;
  const data = await readEnvelope<Schema["Csrf"]>(await fetch("/api/v1/auth/csrf", { credentials: "include", cache: "no-store" }));
  csrf = { token: data.csrfToken, expiresAt: new Date(data.expiresAt).getTime() };
  return data.csrfToken;
}

type RequestOptions = { body?: unknown; signal?: AbortSignal; headers?: Record<string, string>; mutation?: boolean };

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return readEnvelope<T>(await fetch(`/api/v1${path}`, { credentials: "include", cache: "no-store", signal }));
}

export async function apiMutate<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getCsrfToken();
  const headers = new Headers(options.headers);
  headers.set("x-csrf-token", token);
  if (!(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const body = options.body instanceof FormData ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body);
  return readEnvelope<T>(await fetch(`/api/v1${path}`, { method, body, headers, credentials: "include", cache: "no-store", signal: options.signal }));
}

export const getMe = (signal?: AbortSignal) => apiGet<SapUser>("/auth/me", signal);
export async function login(email: string, password: string): Promise<SapUser> {
  const user = await apiMutate<SapUser>("POST", "/auth/login", { body: { email, password } });
  clearApiSession();
  return user;
}
export const register = (displayName: string, email: string, password: string) => apiMutate<SapChallenge>("POST", "/auth/register", { body: { displayName, email, password } });
export async function verifyEmail(challengeId: string, code: string): Promise<SapUser> {
  const user = await apiMutate<SapUser>("POST", "/auth/verify-email", { body: { challengeId, code } });
  clearApiSession();
  return user;
}
export const resendVerification = (email: string) => apiMutate<SapChallenge>("POST", "/auth/resend-verification", { body: { email } });
export const forgotPassword = (email: string) => apiMutate<SapChallenge>("POST", "/auth/forgot-password", { body: { email } });
export const resetPassword = (challengeId: string, code: string, newPassword: string) => apiMutate<Schema["Ack"]>("POST", "/auth/reset-password", { body: { challengeId, code, newPassword } });
export async function logout() {
  await apiMutate<Schema["Ack"]>("POST", "/auth/logout");
  clearApiSession();
}
export const updateProfile = (displayName: string) => apiMutate<SapUser>("PATCH", "/users/me", { body: { displayName } });
export const updateSapaPreference = (sapaEnabled: boolean) => apiMutate<Schema["UserPreferences"]>("PATCH", "/users/me/preferences", { body: { sapaEnabled } });
export const reauthenticate = (password: string) => apiMutate<Schema["Ack"]>("POST", "/auth/reauthenticate", { body: { password } });
export async function deleteAccount(): Promise<Schema["Deletion"]> {
  const result = await apiMutate<Schema["Deletion"]>("DELETE", "/users/me", { body: { confirmation: "DELETE_MY_ACCOUNT" }, headers: { "idempotency-key": crypto.randomUUID() } });
  clearApiSession();
  return result;
}

export const listCategories = (signal?: AbortSignal) => apiGet<Schema["CategoryPage"]>("/categories", signal);
export const getStats = (signal?: AbortSignal) => apiGet<SapStats>("/users/me/stats", signal);
export const getAchievements = (signal?: AbortSignal) => apiGet<Schema["AchievementPage"]>("/users/me/achievements", signal);
async function collectPages<T>(path: string, signal?: AbortSignal): Promise<{ items: T[]; nextCursor: null }> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page: { items: T[]; nextCursor: string | null } = await apiGet(`${path}?${params}`, signal);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items, nextCursor: null };
}
export const listScans = (signal?: AbortSignal) => collectPages<SapScan>("/scans", signal);
export const getScan = (id: string, signal?: AbortSignal) => apiGet<SapScan>(`/scans/${encodeURIComponent(id)}`, signal);
export const listReports = (signal?: AbortSignal) => collectPages<SapReport>("/reports/mine", signal);
export const getReport = (id: string, signal?: AbortSignal) => apiGet<SapReport>(`/reports/${encodeURIComponent(id)}`, signal);
export const updateReport = (id: string, revision: number, body: Schema["ReportUpdateInput"]) => apiMutate<SapReport>("PATCH", `/reports/${encodeURIComponent(id)}`, { body, headers: { "if-match": String(revision) } });
export const mediaUrl = (id: string, signal?: AbortSignal) => apiGet<SapMediaUrl>(`/media/${encodeURIComponent(id)}/url`, signal);

export async function uploadMedia(file: File, purpose: "scan" | "report", signal?: AbortSignal): Promise<Schema["Media"]> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  return apiMutate<Schema["Media"]>("POST", "/media", { body: form, signal });
}

export async function createScan(mediaId: string, idempotencyKey: string, signal?: AbortSignal): Promise<SapScan> {
  return apiMutate<SapScan>("POST", "/scans", { body: { mediaId }, headers: { "idempotency-key": idempotencyKey }, signal });
}

export type ReportInput = Schema["ReportInput"];
export async function createReport(input: ReportInput, idempotencyKey: string): Promise<SapReport> {
  return apiMutate<SapReport>("POST", "/reports", { body: input, headers: { "idempotency-key": idempotencyKey } });
}

export async function listAreas(bbox: string, from: string, to: string, categoryId?: string, signal?: AbortSignal): Promise<SapAreas> {
  const params = new URLSearchParams({ bbox, from, to });
  if (categoryId) params.set("categoryId", categoryId);
  return apiGet<SapAreas>(`/areas?${params}`, signal);
}
export async function getArea(cellId: string, from: string, to: string, categoryId?: string, signal?: AbortSignal): Promise<SapAreaDetail> {
  const params = new URLSearchParams({ from, to });
  if (categoryId) params.set("categoryId", categoryId);
  return apiGet<SapAreaDetail>(`/areas/${encodeURIComponent(cellId)}?${params}`, signal);
}

// --- Admin (role-gated; API also enforces admin via SessionAuthGuard + AdminGuard). ---
export type SapReportStatus = SapReport["status"];
export type SapAdminStats = Schema["AdminStats"];
export type SapAuditEvent = Schema["AuditEvent"];
export type SapDuplicateCandidate = Schema["DuplicateCandidate"];
export type SapScanSettings = Schema["ScanSettings"];
export type ScanSettingsUpdate = Schema["ScanSettingsUpdateInput"];
export type DecisionInput = Schema["DecisionInput"];

export async function listAdminReports(status?: SapReportStatus, cursor?: string, signal?: AbortSignal): Promise<Schema["ReportPage"]> {
  const params = new URLSearchParams({ limit: "50" });
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  return apiGet<Schema["ReportPage"]>(`/admin/reports?${params}`, signal);
}
export const getReportDuplicates = (reportId: string, signal?: AbortSignal) =>
  apiGet<Schema["DuplicateCandidatePage"]>(`/admin/reports/${encodeURIComponent(reportId)}/duplicates`, signal);
export const decideReport = (reportId: string, revision: number, input: DecisionInput) =>
  apiMutate<SapReport>("POST", `/admin/reports/${encodeURIComponent(reportId)}/decisions`, {
    body: input,
    headers: { "idempotency-key": crypto.randomUUID(), "if-match": String(revision) },
  });
export const getAdminStats = (signal?: AbortSignal) => apiGet<SapAdminStats>("/admin/stats", signal);
export async function listAuditEvents(cursor?: string, signal?: AbortSignal): Promise<Schema["AuditEventPage"]> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return apiGet<Schema["AuditEventPage"]>(`/admin/audit?${params}`, signal);
}
export const getScanSettings = (signal?: AbortSignal) => apiGet<SapScanSettings>("/admin/scan-settings", signal);
export const updateScanSettings = (patch: ScanSettingsUpdate) =>
  apiMutate<SapScanSettings>("PUT", "/admin/scan-settings", { body: patch });

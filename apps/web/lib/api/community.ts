import { ApiError, apiGet, apiMutate } from "./client";
import type { components } from "./r1-schema";

type R1 = components["schemas"];
export type PublicIncidentResult = R1["PublicIncidentResult"];
export type PublicIncident = R1["PublicIncident"];
export type PublicIncidentTimelinePage = R1["PublicIncidentTimelinePage"];
export type IncidentViewer = R1["IncidentViewer"];
export type CommunityUpdateInput = R1["CommunityUpdateInput"];
export type CommunityUpdate = R1["CommunityUpdate"];
export type AdminCommunityUpdate = R1["AdminCommunityUpdate"];
export type ReviewQueueItem = R1["ReviewQueueItem"];
export type ReviewRun = R1["ReviewRun"];
export type EvidenceRendition = R1["EvidenceRendition"];
export type EvidencePublicationInput = R1["EvidencePublicationInput"];
export type ReviewRecommendation = NonNullable<ReviewRun["result"]>;
export type CursorPage<T> = { items: T[]; nextCursor: string | null };

const enc = encodeURIComponent;

function invalid(): never {
  throw new ApiError(
    502,
    "INVALID_COMMUNITY_RESPONSE",
    "Respons komunitas belum lengkap. Muat ulang halaman atau hubungi pengelola SAP.",
  );
}

function checkPage<T>(value: CursorPage<T>): CursorPage<T> {
  if (
    !value ||
    !Array.isArray(value.items) ||
    !(value.nextCursor === null || typeof value.nextCursor === "string")
  ) invalid();
  return value;
}

export async function getPublicIncident(id: string, signal?: AbortSignal) {
  const result = await apiGet<PublicIncidentResult>(`/public/incidents/${enc(id)}`, signal);
  if (!result || !(result.kind === "incident" || result.kind === "redirect")) invalid();
  return result;
}

export async function getIncidentTimeline(id: string, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
  return checkPage(
    await apiGet<PublicIncidentTimelinePage>(
      `/public/incidents/${enc(id)}/timeline?${query}`,
      signal,
    ),
  );
}

export const getIncidentViewer = (id: string, signal?: AbortSignal) =>
  apiGet<IncidentViewer>(`/public/incidents/${enc(id)}/viewer`, signal);

export const setIncidentSupport = (id: string, supported: boolean) =>
  apiMutate<R1["SupportState"]>("PUT", `/public/incidents/${enc(id)}/support`, {
    body: { supported },
  });

export const setIncidentFollowing = (id: string, following: boolean) =>
  apiMutate<R1["FollowState"]>("PUT", `/public/incidents/${enc(id)}/follow`, {
    body: { following },
  });

export const submitCommunityUpdate = (id: string, body: CommunityUpdateInput, key: string) =>
  apiMutate<CommunityUpdate>("POST", `/public/incidents/${enc(id)}/updates`, {
    body,
    headers: { "idempotency-key": key },
  });

export async function listMyCommunityUpdates(
  query: { status?: CommunityUpdate["status"]; cursor?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  return checkPage(
    await apiGet<CursorPage<CommunityUpdate>>(`/users/me/community-updates?${params}`, signal),
  );
}

export const patchMyCommunityUpdate = (
  current: CommunityUpdate,
  body: CommunityUpdateInput,
) =>
  apiMutate<CommunityUpdate>("PATCH", `/community-updates/${enc(current.id)}`, {
    body,
    headers: { "if-match": String(current.revision) },
  });

export async function listCommunityReviewQueue(cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ type: "community_update", limit: "20", ...(cursor ? { cursor } : {}) });
  return checkPage(
    await apiGet<CursorPage<ReviewQueueItem>>(`/admin/review-queue?${params}`, signal),
  );
}

export const getAdminCommunityUpdate = (id: string, signal?: AbortSignal) =>
  apiGet<AdminCommunityUpdate>(`/admin/community-updates/${enc(id)}`, signal);

export const getCommunityUpdatePhotoUrl = (updateId: string, mediaId: string, signal?: AbortSignal) =>
  apiGet<R1["MediaUrl"]>(
    `/admin/community-updates/${enc(updateId)}/media/${enc(mediaId)}/url`,
    signal,
  );

export async function listEvidenceRenditions(
  mediaId: string,
  subjectId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    subjectType: "community_update",
    subjectId,
    limit: "20",
    ...(cursor ? { cursor } : {}),
  });
  return checkPage(
    await apiGet<CursorPage<EvidenceRendition>>(
      `/admin/media/${enc(mediaId)}/renditions?${params}`,
      signal,
    ),
  );
}

export const requestEvidenceRendition = (
  update: AdminCommunityUpdate,
  mediaId: string,
  key: string,
) =>
  apiMutate<EvidenceRendition>("POST", `/admin/media/${enc(mediaId)}/renditions`, {
    body: { subjectType: "community_update", subjectId: update.id, redactions: [] },
    headers: { "if-match": String(update.revision), "idempotency-key": key },
  });

export type CommunityUpdateDecisionInput = R1["CommunityUpdateDecision"];
export const decideCommunityUpdate = (
  update: AdminCommunityUpdate,
  body: CommunityUpdateDecisionInput,
  key: string,
) =>
  apiMutate<CommunityUpdate>(
    "POST",
    `/admin/community-updates/${enc(update.id)}/decisions`,
    {
      body,
      headers: { "if-match": String(update.revision), "idempotency-key": key },
    },
  );

export const requestHermesReview = (subjectId: string, subjectRevision: number, key: string) =>
  apiMutate<ReviewRun>("POST", "/admin/reviews", {
    body: { subjectType: "community_update", subjectId, subjectRevision },
    headers: { "idempotency-key": key },
  });

export const getHermesReview = (id: string, signal?: AbortSignal) =>
  apiGet<ReviewRun>(`/admin/reviews/${enc(id)}`, signal);

export const getMediaConsents = (mediaId: string, signal?: AbortSignal) =>
  apiGet<R1["MediaConsents"]>(`/media/${enc(mediaId)}/consents`, signal);

export const setMediaConsents = (
  current: R1["MediaConsents"],
  channels: R1["MediaConsents"]["channels"],
) =>
  apiMutate<R1["MediaConsents"]>("PUT", `/media/${enc(current.mediaId)}/consents`, {
    body: { channels },
    headers: { "if-match": String(current.revision) },
  });

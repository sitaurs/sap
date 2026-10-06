import { ApiError } from "./client";
import { enc, query, r1Get, r1Mutate, type R1 } from "./r1";
import type {
  InstagramOverview,
  InstagramPost,
  PublicationPage,
  PublicationQuery,
  PublicationSettings,
  PublicationOperation,
} from "../../components/instagram/types";
export type InstagramReportSourcePage = R1["InstagramReportSourcePage"];

const BASE = "/admin/instagram";
const statuses = [
  "draft",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "retracting",
  "retracted",
  "needs_action",
] as const;
function invalid(): never {
  throw new ApiError(
    502,
    "INVALID_INSTAGRAM_RESPONSE",
    "Respons publikasi tidak sesuai kontrak R1. Hubungi pengelola SAP.",
  );
}
function validatePost(p: InstagramPost) {
  if (
    !p ||
    !Number.isInteger(p.revision) ||
    !Number.isInteger(p.contentRevision) ||
    !p.source ||
    !p.actions ||
    !p.rendition ||
    !p.approval ||
    !statuses.includes(p.status) ||
    !(p.publishedAt === null || Number.isFinite(Date.parse(p.publishedAt)))
  )
    invalid();
  return p;
}
function validateOperation(p: PublicationOperation) {
  if (
    !p ||
    typeof p.id !== "string" ||
    ![
      "queued",
      "running",
      "succeeded",
      "failed",
      "needs_action",
      "cancelled",
    ].includes(p.status) ||
    !p.channels ||
    !(p.postId === null || typeof p.postId === "string")
  )
    invalid();
  return p;
}
export async function getInstagramOverview(
  signal?: AbortSignal,
): Promise<InstagramOverview> {
  const v = await r1Get<InstagramOverview>(BASE, signal);
  if (
    !v?.account ||
    !["connected", "disconnected", "expired", "needs_action"].includes(
      v.account.status,
    ) ||
    !v.capabilities ||
    !v.capabilityReasons ||
    v.settings?.source !== "reports" ||
    v.settings?.publishMode !== "approval_required" ||
    !["manual", "automatic"].includes(v.settings.draftGeneration) ||
    !v.stats?.byStatus ||
    !statuses.every(
      (s) => Number.isInteger(v.stats.byStatus[s]) && v.stats.byStatus[s] >= 0,
    ) ||
    statuses.reduce((n, s) => n + v.stats.byStatus[s], 0) !== v.stats.total
  )
    invalid();
  return v;
}
export async function searchInstagramReportSources(search: string, cursor?: string, signal?: AbortSignal): Promise<InstagramReportSourcePage> {
  const params = new URLSearchParams({ limit: "20" });
  if (search.trim()) params.set("search", search.trim());
  if (cursor) params.set("cursor", cursor);
  const page = await r1Get<InstagramReportSourcePage>(`${BASE}/reports?${params}`, signal);
  if (!page || !Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === "string")) invalid();
  return page;
}

export async function listInstagramPosts(
  filters: PublicationQuery,
  signal?: AbortSignal,
): Promise<PublicationPage> {
  const p = await r1Get<PublicationPage>(
    `${BASE}/posts?${query({ limit: 12, ...filters })}`,
    signal,
  );
  if (
    !p ||
    !Array.isArray(p.items) ||
    !Number.isInteger(p.total) ||
    (p.nextCursor !== null && typeof p.nextCursor !== "string")
  )
    invalid();
  p.items.forEach(validatePost);
  return p;
}
export async function getInstagramPost(id: string, signal?: AbortSignal) {
  return validatePost(
    await r1Get<InstagramPost>(`${BASE}/posts/${enc(id)}`, signal),
  );
}
export const getPublicationPreview = (id: string, signal?: AbortSignal) =>
  r1Get<R1["PublicationPreview"]>(`${BASE}/posts/${enc(id)}/preview`, signal);
export const createInstagramDraft = (
  body: R1["InstagramCreateInput"],
  key: string,
) =>
  r1Mutate<InstagramPost>("POST", `${BASE}/posts`, body, undefined, key).then(
    validatePost,
  );
export const updateInstagramDraft = (
  post: InstagramPost,
  caption: string,
  altText: string,
) =>
  r1Mutate<InstagramPost>(
    "PATCH",
    `${BASE}/posts/${enc(post.id)}`,
    { caption, altText },
    post.revision,
  ).then(validatePost);
export const approveInstagramPost = (
  post: InstagramPost,
  preview: R1["PublicationPreview"],
  key: string,
) =>
  r1Mutate<InstagramPost>(
    "POST",
    `${BASE}/posts/${enc(post.id)}/approve`,
    {
      contentRevision: preview.contentRevision,
      sourceRevision: preview.sourceRevision,
      renditionId: preview.rendition.id,
    },
    post.revision,
    key,
  ).then(validatePost);
export const publishInstagramPost = (post: InstagramPost, key: string) =>
  r1Mutate<PublicationOperation>(
    "POST",
    `${BASE}/posts/${enc(post.id)}/publish`,
    {},
    post.revision,
    key,
  ).then(validateOperation);
export const cancelInstagramPost = (
  post: InstagramPost,
  reason: string,
  key: string,
) =>
  r1Mutate<InstagramPost>(
    "POST",
    `${BASE}/posts/${enc(post.id)}/cancel`,
    { reason },
    post.revision,
    key,
  ).then(validatePost);
export const retractInstagramPost = (
  post: InstagramPost,
  reason: string,
  key: string,
) =>
  r1Mutate<PublicationOperation>(
    "POST",
    `${BASE}/posts/${enc(post.id)}/retract`,
    { reason },
    post.revision,
    key,
  ).then(validateOperation);
export const getPublicationOperation = (id: string, signal?: AbortSignal) =>
  r1Get<PublicationOperation>(`${BASE}/operations/${enc(id)}`, signal).then(
    validateOperation,
  );
export const retryPublicationOperation = (id: string, key: string) =>
  r1Mutate<PublicationOperation>(
    "POST",
    `${BASE}/operations/${enc(id)}/retry`,
    {},
    undefined,
    key,
  ).then(validateOperation);
export const confirmManualRetraction = (
  id: string,
  evidenceMediaIds: string[],
  explanation: string,
  key: string,
) =>
  r1Mutate<PublicationOperation>(
    "POST",
    `${BASE}/operations/${enc(id)}/manual-confirmation`,
    { evidenceMediaIds, explanation },
    undefined,
    key,
  ).then(validateOperation);
export const disconnectInstagram = (
  acknowledgePendingRetractions: boolean,
  key: string,
) =>
  r1Mutate<PublicationOperation>(
    "POST",
    `${BASE}/account/disconnect`,
    { acknowledgePendingRetractions },
    undefined,
    key,
  ).then(validateOperation);
export const saveInstagramSettings = (settings: PublicationSettings) => {
  const { revision, ...body } = settings;
  return r1Mutate<PublicationSettings>(
    "PUT",
    `${BASE}/settings`,
    body,
    revision,
  );
};
export const getInstagramAuthorization = () =>
  r1Get<R1["AuthorizationResponseData"]>(`${BASE}/account/authorization`);
export const publicationPhotoUrl = (
  reportId: string,
  mediaId: string,
  signal?: AbortSignal,
) =>
  r1Get<R1["MediaUrl"]>(
    `${BASE}/reports/${enc(reportId)}/media/${enc(mediaId)}/url`,
    signal,
  );
export const reportLifecycle = (id: string, signal?: AbortSignal) =>
  r1Get<R1["ReportLifecycle"]>(`/admin/reports/${enc(id)}/lifecycle`, signal);
export const reportPublications = (
  id: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  r1Get<PublicationPage>(
    `/admin/reports/${enc(id)}/publications?${query({ limit: 20, cursor })}`,
    signal,
  );

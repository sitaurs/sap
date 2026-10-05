import { ApiError, apiGet, apiMutate } from "./client";
import type { components } from "./r1-schema";

type Schemas = components["schemas"];
export type InstagramOverview = Schemas["InstagramOverview"];
export type InstagramPost = Schemas["InstagramPost"];
export type PublicationPage = Schemas["PublicationPage"];
export type PublicationSettings = Schemas["PublicationSettings"];
export type PublicationOperation = Schemas["PublicationOperation"];
export type PublicationPreview = Schemas["PublicationPreview"];
export type ManualConfirmationInput = Schemas["ManualConfirmationInput"];
export type PublicationQuery = {
  status: "all" | "draft" | "published";
  search: string;
  period: "all" | "7d" | "30d";
  cursor?: string;
};

const BASE = "/admin/instagram";
const iso = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function invalid(): never {
  throw new ApiError(
    502,
    "INVALID_INSTAGRAM_RESPONSE",
    "Informasi publikasi belum lengkap. Muat ulang atau hubungi pengelola SAP.",
  );
}

function validateOverview(value: InstagramOverview): InstagramOverview {
  if (
    !value?.account ||
    !["connected", "disconnected", "expired", "needs_action"].includes(
      value.account.status,
    ) ||
    !(value.account.username === null || typeof value.account.username === "string") ||
    !value.capabilities ||
    Object.values(value.capabilities).some((item) => typeof item !== "boolean") ||
    !value.capabilityReasons ||
    Object.values(value.capabilityReasons).some(
      (item) => !(item === null || typeof item === "string"),
    ) ||
    !value.settings ||
    !Number.isInteger(value.settings.revision) ||
    value.settings.revision < 1 ||
    value.settings.source !== "reports" ||
    value.settings.onlyVerified !== true ||
    value.settings.format !== "feed" ||
    value.settings.timezone !== "Asia/Jakarta" ||
    !["automatic", "manual"].includes(value.settings.draftGeneration) ||
    value.settings.publishMode !== "approval_required" ||
    typeof value.settings.captionTemplate !== "string" ||
    typeof value.settings.hashtags !== "string" ||
    !value.stats ||
    !Number.isInteger(value.stats.total) ||
    value.stats.total < 0 ||
    !value.stats.byStatus ||
    Object.values(value.stats.byStatus).some(
      (item) => !Number.isInteger(item) || item < 0,
    )
  ) {
    invalid();
  }
  return value;
}

function validatePost(post: InstagramPost): InstagramPost {
  if (
    !post ||
    typeof post.id !== "string" ||
    !Number.isInteger(post.revision) ||
    post.revision < 1 ||
    !Number.isInteger(post.contentRevision) ||
    !post.source ||
    typeof post.source.mediaId !== "string" ||
    typeof post.source.reportId !== "string" ||
    typeof post.source.title !== "string" ||
    typeof post.source.categoryName !== "string" ||
    typeof post.source.publicSummary !== "string" ||
    typeof post.caption !== "string" ||
    typeof post.altText !== "string" ||
    ![
      "draft",
      "publishing",
      "published",
      "failed",
      "cancelled",
      "retracting",
      "retracted",
      "needs_action",
    ].includes(post.status) ||
    !iso(post.createdAt) ||
    !iso(post.updatedAt) ||
    !(post.permalink === null || typeof post.permalink === "string") ||
    !(post.publishError === null || typeof post.publishError === "string") ||
    !(post.publishedAt === null || iso(post.publishedAt)) ||
    !(post.retractedAt === null || iso(post.retractedAt)) ||
    !post.rendition ||
    !["queued", "ready", "failed"].includes(post.rendition.status) ||
    !post.approval ||
    !["unapproved", "approved", "invalidated"].includes(post.approval.status) ||
    !post.actions ||
    Object.values(post.actions).some(
      (permission) => typeof permission?.allowed !== "boolean",
    )
  ) {
    invalid();
  }
  return post;
}

function validateOperation(value: PublicationOperation): PublicationOperation {
  if (
    !value ||
    typeof value.id !== "string" ||
    !["publish", "retract", "disconnect"].includes(value.kind) ||
    !["queued", "running", "succeeded", "failed", "needs_action", "cancelled"].includes(value.status) ||
    typeof value.message !== "string" ||
    !Number.isInteger(value.attemptCount) ||
    !iso(value.createdAt) ||
    !iso(value.updatedAt)
  ) invalid();
  return value;
}

export async function getInstagramOverview(signal?: AbortSignal) {
  return validateOverview(await apiGet<InstagramOverview>(BASE, signal));
}

export async function listInstagramPosts(query: PublicationQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    limit: "12",
    status: query.status,
    period: query.period,
  });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.cursor) params.set("cursor", query.cursor);
  const page = await apiGet<PublicationPage>(`${BASE}/posts?${params}`, signal);
  if (
    !page ||
    !Array.isArray(page.items) ||
    !Number.isInteger(page.total) ||
    page.total < 0 ||
    !(page.nextCursor === null || typeof page.nextCursor === "string")
  ) invalid();
  page.items.forEach(validatePost);
  return page;
}

export async function getInstagramPost(id: string, signal?: AbortSignal) {
  return validatePost(
    await apiGet<InstagramPost>(`${BASE}/posts/${encodeURIComponent(id)}`, signal),
  );
}

export async function getInstagramPreview(id: string, signal?: AbortSignal) {
  const value = await apiGet<PublicationPreview>(
    `${BASE}/posts/${encodeURIComponent(id)}/preview`,
    signal,
  );
  if (
    !value ||
    value.postId !== id ||
    !Number.isInteger(value.revision) ||
    !Number.isInteger(value.contentRevision) ||
    !Number.isInteger(value.sourceRevision) ||
    typeof value.caption !== "string" ||
    typeof value.altText !== "string" ||
    !value.rendition ||
    !["queued", "ready", "failed"].includes(value.rendition.status)
  ) invalid();
  return value;
}

export async function createInstagramDraft(
  body: {
    reportId: string;
    mediaId: string;
    caption: string;
    altText: string;
    kind: "initial" | "resolution";
    milestoneId: string | null;
    replacesPostId: string | null;
  },
  key: string,
) {
  return validatePost(
    await apiMutate<InstagramPost>("POST", `${BASE}/posts`, {
      body,
      headers: { "idempotency-key": key },
    }),
  );
}

export async function updateInstagramDraft(
  post: InstagramPost,
  input: { caption: string; altText: string },
) {
  return validatePost(
    await apiMutate<InstagramPost>(
      "PATCH",
      `${BASE}/posts/${encodeURIComponent(post.id)}`,
      { body: input, headers: { "if-match": String(post.revision) } },
    ),
  );
}

export async function approveInstagramPost(post: InstagramPost, key: string) {
  if (!post.rendition.id) invalid();
  return validatePost(
    await apiMutate<InstagramPost>(
      "POST",
      `${BASE}/posts/${encodeURIComponent(post.id)}/approve`,
      {
        body: {
          contentRevision: post.contentRevision,
          sourceRevision: post.source.sourceRevision,
          renditionId: post.rendition.id,
        },
        headers: {
          "if-match": String(post.revision),
          "idempotency-key": key,
        },
      },
    ),
  );
}

export async function publishInstagramPost(post: InstagramPost, key: string) {
  return validateOperation(
    await apiMutate<PublicationOperation>(
      "POST",
      `${BASE}/posts/${encodeURIComponent(post.id)}/publish`,
      { body: {}, headers: { "if-match": String(post.revision), "idempotency-key": key } },
    ),
  );
}

export async function cancelInstagramPost(post: InstagramPost, reason: string, key: string) {
  return validatePost(
    await apiMutate<InstagramPost>(
      "POST",
      `${BASE}/posts/${encodeURIComponent(post.id)}/cancel`,
      {
        body: { reason },
        headers: { "if-match": String(post.revision), "idempotency-key": key },
      },
    ),
  );
}

export async function retractInstagramPost(post: InstagramPost, reason: string, key: string) {
  return validateOperation(
    await apiMutate<PublicationOperation>(
      "POST",
      `${BASE}/posts/${encodeURIComponent(post.id)}/retract`,
      {
        body: { reason },
        headers: { "if-match": String(post.revision), "idempotency-key": key },
      },
    ),
  );
}

export async function getInstagramOperation(id: string, signal?: AbortSignal) {
  return validateOperation(
    await apiGet<PublicationOperation>(
      `${BASE}/operations/${encodeURIComponent(id)}`,
      signal,
    ),
  );
}

export async function retryInstagramOperation(id: string, key: string) {
  return validateOperation(
    await apiMutate<PublicationOperation>(
      "POST",
      `${BASE}/operations/${encodeURIComponent(id)}/retry`,
      { body: {}, headers: { "idempotency-key": key } },
    ),
  );
}

export async function manuallyConfirmInstagramRetraction(
  id: string,
  body: ManualConfirmationInput,
  key: string,
) {
  return validateOperation(
    await apiMutate<PublicationOperation>(
      "POST",
      `${BASE}/operations/${encodeURIComponent(id)}/manual-confirmation`,
      { body, headers: { "idempotency-key": key } },
    ),
  );
}

export async function saveInstagramSettings(settings: PublicationSettings) {
  return validateSettings(
    await apiMutate<PublicationSettings>("PUT", `${BASE}/settings`, {
      body: {
        source: settings.source,
        onlyVerified: settings.onlyVerified,
        format: settings.format,
        timezone: settings.timezone,
        draftGeneration: settings.draftGeneration,
        publishMode: settings.publishMode,
        captionTemplate: settings.captionTemplate,
        hashtags: settings.hashtags,
      },
      headers: { "if-match": String(settings.revision) },
    }),
  );
}

function validateSettings(value: PublicationSettings): PublicationSettings {
  if (
    !value ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    !["automatic", "manual"].includes(value.draftGeneration) ||
    value.source !== "reports" ||
    value.onlyVerified !== true ||
    value.format !== "feed" ||
    value.timezone !== "Asia/Jakarta" ||
    value.publishMode !== "approval_required" ||
    typeof value.captionTemplate !== "string" ||
    value.captionTemplate.length > 1800 ||
    typeof value.hashtags !== "string" ||
    value.hashtags.length > 400
  ) invalid();
  return value;
}

export const getInstagramAuthorization = () =>
  apiGet<{ authorizationUrl: string; expiresAt: string }>(
    `${BASE}/account/authorization`,
  );

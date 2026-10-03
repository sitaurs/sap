import { ApiError, apiGet, apiMutate } from "./client";
import type { InstagramOverview, InstagramPost, PublicationPage, PublicationQuery, PublicationSettings } from "../../components/instagram/types";

// R1 routes are proposed in docs/CONTRACT_ZAKA_ZAMANI.md; this adapter still uses the legacy DTOs.
// A missing module is handled explicitly by the UI; there is no mock-data fallback.
const BASE = "/admin/instagram";
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function invalid(): never { throw new ApiError(502, "INVALID_INSTAGRAM_RESPONSE", "Informasi publikasi belum lengkap. Muat ulang atau hubungi pengelola SAP."); }
function validateSettings(value: PublicationSettings): PublicationSettings {
  if (!value || !Number.isInteger(value.revision) || value.revision < 1
    || !["draft", "automatic"].includes(value.mode) || value.onlyVerified !== true
    || value.source !== "scan_reports" || value.format !== "feed" || value.timezone !== "Asia/Jakarta"
    || typeof value.captionTemplate !== "string" || !value.captionTemplate.trim() || value.captionTemplate.length > 1800
    || typeof value.hashtags !== "string" || value.hashtags.length > 400) invalid();
  return value;
}
function validatePost(post: InstagramPost): InstagramPost {
  if (!post || typeof post.id !== "string" || !Number.isInteger(post.revision) || post.revision < 1 || !post.source
    || typeof post.source.mediaId !== "string" || typeof post.source.reportId !== "string"
    || !(post.source.scanId === null || typeof post.source.scanId === "string")
    || typeof post.source.title !== "string" || typeof post.source.categoryName !== "string"
    || typeof post.source.publicSummary !== "string" || typeof post.caption !== "string"
    || !["draft", "publishing", "published", "failed"].includes(post.status)
    || !iso(post.createdAt) || !iso(post.updatedAt)
    || !(post.permalink === null || typeof post.permalink === "string")
    || !(post.publishError === null || typeof post.publishError === "string")
    || (post.status === "published" ? !iso(post.publishedAt) : post.publishedAt !== null)) invalid();
  return post;
}
export async function getInstagramOverview(signal?: AbortSignal): Promise<InstagramOverview> {
  const value = await apiGet<InstagramOverview>(BASE, signal);
  if (!value?.account || !["connected", "disconnected", "expired"].includes(value.account.status)
    || !(value.account.username === null || typeof value.account.username === "string")
    || !value.capabilities || [value.capabilities.canPublish, value.capabilities.canAutomate, value.capabilities.canConnect].some(item => typeof item !== "boolean")
    || !value.stats || [value.stats.total, value.stats.draft, value.stats.published].some(item => !Number.isInteger(item) || item < 0)
    || value.stats.total !== value.stats.draft + value.stats.published) invalid();
  validateSettings(value.settings);
  return value;
}
export async function listInstagramPosts(query: PublicationQuery, signal?: AbortSignal): Promise<PublicationPage> {
  const params = new URLSearchParams({ limit: "12", status: query.status, period: query.period });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.cursor) params.set("cursor", query.cursor);
  const page = await apiGet<PublicationPage>(`${BASE}/posts?${params}`, signal);
  if (!page || !Array.isArray(page.items) || !Number.isInteger(page.total) || page.total < 0
    || !(page.nextCursor === null || typeof page.nextCursor === "string")) invalid();
  page.items.forEach(validatePost);
  return page;
}
export async function getInstagramPost(id: string, signal?: AbortSignal) {
  return validatePost(await apiGet<InstagramPost>(`${BASE}/posts/${encodeURIComponent(id)}`, signal));
}
export async function createInstagramDraft(body: { reportId: string; mediaId: string; caption: string }, key: string) {
  return validatePost(await apiMutate<InstagramPost>("POST", `${BASE}/posts`, { body, headers: { "idempotency-key": key } }));
}
export async function updateInstagramDraft(post: InstagramPost, caption: string) {
  return validatePost(await apiMutate<InstagramPost>("PATCH", `${BASE}/posts/${encodeURIComponent(post.id)}`, {
    body: { caption }, headers: { "if-match": String(post.revision) },
  }));
}
export async function publishInstagramPost(post: InstagramPost, key: string) {
  return validatePost(await apiMutate<InstagramPost>("POST", `${BASE}/posts/${encodeURIComponent(post.id)}/publish`, {
    headers: { "if-match": String(post.revision), "idempotency-key": key },
  }));
}
export async function saveInstagramSettings(settings: PublicationSettings) {
  return validateSettings(await apiMutate<PublicationSettings>("PUT", `${BASE}/settings`, {
    body: { mode: settings.mode, source: settings.source, onlyVerified: settings.onlyVerified, format: settings.format,
      timezone: settings.timezone, captionTemplate: settings.captionTemplate, hashtags: settings.hashtags },
    headers: { "if-match": String(settings.revision) },
  }));
}
export const getInstagramAuthorization = () => apiGet<{ authorizationUrl: string }>(`${BASE}/account/authorization`);

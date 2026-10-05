import type { components } from "../../lib/api/r1-schema";

type R1 = components["schemas"];
export type PublicationStatus = R1["PublicationStatus"];
export type PublicationFilter = "all" | "draft" | "published";
export type InstagramPost = R1["InstagramPost"];
export type PublicationSource = Pick<InstagramPost["source"], "reportId" | "scanId" | "title" | "categoryName" | "mediaId" | "publicSummary"> &
  Partial<Pick<InstagramPost["source"], "sourceRevision" | "status" | "occurredAt" | "area">>;
export type InstagramAccount = R1["InstagramOverview"]["account"];
export type PublicationSettings = R1["PublicationSettings"];
export type InstagramOverview = R1["InstagramOverview"];
export type PublicationPage = R1["PublicationPage"];
export type PublicationQuery = {
  status: PublicationFilter;
  search: string;
  period: "all" | "7d" | "30d";
  cursor?: string;
};
export type PostPreview = {
  source: PublicationSource;
  caption: string;
  altText: string;
};

/** Preview-only defaults; never presented as saved account preferences. */
export const PREVIEW_SETTINGS: PublicationSettings = {
  revision: 0,
  source: "reports",
  onlyVerified: true,
  format: "feed",
  timezone: "Asia/Jakarta",
  draftGeneration: "manual",
  publishMode: "approval_required",
  captionTemplate:
    "Temuan {jenis_sampah}.\n\n{ringkasan_laporan}\n\nMari jaga lingkungan dan pilah sampah dengan bijak.",
  hashtags: "#SAP #PilahSampah #PeduliLingkungan",
};

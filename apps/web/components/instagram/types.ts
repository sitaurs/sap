import type { R1 } from "../../lib/api/r1";
/** R1 types stay isolated from the published 1.1 client; runtime readiness is separate. */
export type PublicationStatus = R1["PublicationStatus"];
export type InstagramPost = R1["InstagramPost"];
export type PublicationSource = InstagramPost["source"];
export type InstagramOverview = R1["InstagramOverview"];
export type InstagramAccount = InstagramOverview["account"];
export type PublicationSettings = R1["PublicationSettings"];
export type PublicationOperation = R1["PublicationOperation"];
export type PublicationPage = R1["PublicationPage"];
export type PublicationFilter = "all" | PublicationStatus;
export type PublicationQuery = {
  status: PublicationFilter;
  search: string;
  period: "all" | "7d" | "30d";
  cursor?: string;
};
export type PostPreview = {
  source: PublicationSource;
  caption: string;
  kind: "initial" | "resolution";
  milestoneId: string | null;
  replacesPostId: string | null;
};
export const publicationLabels: Record<PublicationStatus, string> = {
  draft: "Draf",
  publishing: "Sedang memposting",
  published: "Terposting",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  retracting: "Sedang ditarik",
  retracted: "Ditarik",
  needs_action: "Perlu tindakan",
};
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

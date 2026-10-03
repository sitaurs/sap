/** Proposed Instagram contract. Existing SAP report/media types remain unchanged. */
export type PublicationStatus = "draft" | "publishing" | "published" | "failed";
export type PublicationFilter = "all" | "draft" | "published";
export type PublicationSource = {
  reportId: string;
  scanId: string | null;
  title: string;
  categoryName: string;
  mediaId: string;
  publicSummary: string;
};
export type InstagramPost = {
  id: string;
  revision: number;
  source: PublicationSource;
  status: PublicationStatus;
  caption: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  permalink: string | null;
  publishError: string | null;
};
export type InstagramAccount = {
  username: string | null;
  status: "connected" | "disconnected" | "expired";
};
export type PublicationSettings = {
  revision: number;
  mode: "draft" | "automatic";
  source: "scan_reports";
  onlyVerified: true;
  format: "feed";
  timezone: "Asia/Jakarta";
  captionTemplate: string;
  hashtags: string;
};
export type InstagramOverview = {
  account: InstagramAccount;
  capabilities: { canPublish: boolean; canAutomate: boolean; canConnect: boolean };
  settings: PublicationSettings;
  stats: { total: number; draft: number; published: number };
};
export type PublicationPage = { items: InstagramPost[]; nextCursor: string | null; total: number };
export type PublicationQuery = { status: PublicationFilter; search: string; period: "all" | "7d" | "30d"; cursor?: string };
export type PostPreview = { source: PublicationSource; caption: string };

/** Preview defaults only; never presented as saved account preferences. */
export const PREVIEW_SETTINGS: PublicationSettings = {
  revision: 0, mode: "draft", source: "scan_reports", onlyVerified: true,
  format: "feed", timezone: "Asia/Jakarta",
  captionTemplate: "Temuan {jenis_sampah}.\n\n{ringkasan_laporan}\n\nMari jaga lingkungan dan pilah sampah dengan bijak.",
  hashtags: "#SAP #PilahSampah #PeduliLingkungan",
};

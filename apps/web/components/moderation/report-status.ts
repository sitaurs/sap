import type { SapReportStatus } from "../../lib/api/client";

export const STATUS_LABEL: Record<SapReportStatus, string> = {
  submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan",
  resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat",
};
export const STATUS_COLOR: Record<SapReportStatus, string> = {
  submitted: "#f4b532", verified: "#3473c8", in_progress: "#63b2eb",
  resolved: "#4b9e54", rejected: "#ef6967", duplicate: "#9aa5b2",
};
// Mirrors the server-side transition table (moderation.types.ts). The API is the
// source of truth; this only trims the UI to plausible choices before submit.
export const VERIFIED_FAMILY: SapReportStatus[] = ["verified", "in_progress", "resolved"];
export const TRANSITIONS: Record<SapReportStatus, SapReportStatus[]> = {
  submitted: ["verified", "rejected", "duplicate"],
  verified: ["verified", "in_progress", "rejected", "duplicate"],
  in_progress: ["in_progress", "resolved", "verified", "rejected", "duplicate"],
  resolved: ["resolved", "verified", "rejected", "duplicate"],
  rejected: ["submitted"],
  duplicate: ["submitted"],
};

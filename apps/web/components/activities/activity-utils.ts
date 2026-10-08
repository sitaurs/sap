import type {
  Activity,
  ActivityCommand,
  ActivityStatus,
  MemberStatus,
} from "../../lib/api/activities";
import { ApiError } from "../../lib/api/client";

export const statusLabels: Record<ActivityStatus, string> = {
  draft: "Draf",
  registration_open: "Pendaftaran dibuka",
  registration_closed: "Pendaftaran ditutup",
  in_progress: "Berlangsung",
  awaiting_result: "Menunggu hasil",
  completed: "Selesai",
  on_hold: "Ditunda",
  cancelled: "Dibatalkan",
};
export const memberLabels: Record<MemberStatus, string> = {
  requested: "Menunggu",
  accepted: "Diterima",
  waitlisted: "Cadangan",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
type RegistrationView = {
  status: ActivityStatus;
  registrationOpen: boolean;
  registrationClosedReason: "deadline_passed" | "manually_closed" | "activity_not_open" | "source_unavailable" | null;
  registrationClosesAt: string | null;
};
export function displayedActivityStatus(activity: RegistrationView): ActivityStatus {
  return activity.status === "registration_open" && !activity.registrationOpen
    ? "registration_closed"
    : activity.status;
}
export function registrationClosedMessage(
  activity: RegistrationView,
  locale = "id-ID",
): string | null {
  if (activity.registrationOpen) return null;
  if (activity.registrationClosedReason === "deadline_passed")
    return `Pendaftaran ditutup otomatis pada ${dateLabel(activity.registrationClosesAt, true, locale)} karena batas waktu pendaftaran telah lewat.`;
  if (activity.registrationClosedReason === "manually_closed")
    return "Pendaftaran ditutup oleh pengelola.";
  if (activity.registrationClosedReason === "source_unavailable")
    return "Pendaftaran ditutup karena laporan sumber tidak lagi terbuka untuk kegiatan.";
  return null;
}
export const commands: {
  action: ActivityCommand;
  permission: keyof Activity["actions"];
  label: string;
  reason?: boolean;
  danger?: boolean;
}[] = [
  { action: "publish", permission: "publish", label: "Publikasikan kegiatan" },
  {
    action: "close_registration",
    permission: "closeRegistration",
    label: "Tutup pendaftaran",
  },
  { action: "start", permission: "start", label: "Mulai kegiatan" },
  {
    action: "request_result",
    permission: "requestResult",
    label: "Minta hasil kegiatan",
  },
  { action: "hold", permission: "hold", label: "Tunda kegiatan", reason: true },
  {
    action: "resume",
    permission: "resume",
    label: "Lanjutkan kegiatan",
    reason: true,
  },
  {
    action: "cancel",
    permission: "cancel",
    label: "Batalkan kegiatan",
    reason: true,
    danger: true,
  },
];
export const shortId = (id: string) => id.slice(0, 8);
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "KS";
export function dateLabel(value: string | null, time = false, locale = "id-ID") {
  if (!value || !Number.isFinite(Date.parse(value))) return "Belum ditentukan";
  return (
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(value)) + (time ? " WIB" : "")
  );
}
export function localDate(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
export const fromLocalDate = (value: string) =>
  value ? new Date(`${value}:00+07:00`).toISOString() : null;
export function errorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    const messages: Record<string, string> = {
      FEATURE_UNAVAILABLE:
        "Fitur kegiatan relawan belum diaktifkan oleh pengelola SAP.",
      REVISION_CONFLICT:
        "Data berubah sejak Anda membuka halaman. Muat versi terbaru, periksa kembali input, lalu simpan ulang.",
      ACTIVITY_FULL:
        "Kuota telah penuh. Muat peserta terbaru atau pilih cadangan.",
      SOURCE_NOT_PUBLIC:
        "Laporan sumber belum memenuhi syarat publikasi atau izinnya sudah berubah.",
      ACTIVE_ACTIVITY_EXISTS:
        "Laporan ini sudah memiliki kegiatan aktif. Kelola kegiatan tersebut terlebih dahulu.",
      INVALID_TRANSITION:
        "Tindakan ini tidak tersedia pada status terbaru. Muat ulang informasinya.",
      COORDINATOR_REASSIGNMENT_REQUIRES_HOLD:
        "Tunda kegiatan terlebih dahulu sebelum mengganti koordinator.",
      EVIDENCE_INVALID:
        "Periksa hubungan foto, versi publik, dan izin pemilik sebelum menyimpan.",
      RESOLUTION_EVIDENCE_REQUIRED:
        "Hasil selesai memerlukan foto sesudah untuk web yang siap dan mempunyai izin pemilik.",
      ACTIVITY_NOT_READY:
        "Lengkapi persyaratan dan pastikan koordinator menerima penugasan.",
      MEMBERSHIP_CLOSED:
        "Perubahan peserta tidak tersedia pada status atau jadwal saat ini.",
      FORBIDDEN: "Anda tidak mempunyai izin untuk tindakan ini.",
    };
    return messages[cause.code] || cause.message;
  }
  return cause instanceof Error
    ? cause.message
    : "Permintaan belum berhasil. Coba kembali.";
}
export const isConflict = (cause: unknown) =>
  cause instanceof ApiError && cause.code === "REVISION_CONFLICT";
export const uniqueItems = <T extends { id: string }>(old: T[], next: T[]) => [
  ...new Map([...old, ...next].map((item) => [item.id, item])).values(),
];

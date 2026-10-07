import { ApiError, apiGet, apiMutate } from "./client";
import type { components } from "./r1-schema";
export type R1 = components["schemas"];
export type Page<T> = { items: T[]; nextCursor: string | null };
export const enc = encodeURIComponent;
export const query = (
  values: Record<string, string | number | boolean | undefined>,
) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export async function r1Get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  try {
    return await apiGet<T>(
      path,
      signal ? AbortSignal.any([signal, timeout]) : timeout,
    );
  } catch (error) {
    if (timeout.aborted && !signal?.aborted)
      throw new ApiError(
        408,
        "READ_TIMEOUT",
        "Pemuatan terlalu lama. Coba muat ulang.",
      );
    throw error;
  }
}
export async function r1Mutate<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  revision?: number,
  key?: string,
): Promise<T> {
  const signal = AbortSignal.timeout(30_000);
  try {
    return await apiMutate<T>(method, path, {
      body,
      signal,
      headers: {
        ...(revision !== undefined ? { "if-match": String(revision) } : {}),
        ...(key ? { "idempotency-key": key } : {}),
      },
    });
  } catch (error) {
    if (signal.aborted || error instanceof TypeError)
      throw new ApiError(
        408,
        "OPERATION_UNCERTAIN",
        "Hasil permintaan belum diketahui. Periksa versi terbaru sebelum mencoba lagi.",
      );
    throw error;
  }
}
export function r1Error(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "FEATURE_UNAVAILABLE")
      return "Fitur belum tersedia. Pengelola perlu menyiapkan dan mengaktifkan layanan R1.";
    if (error.status >= 500)
      return "Layanan belum dapat dihubungi. Coba muat ulang atau hubungi pengelola SAP.";
    if (error.status === 401)
      return "Sesi berakhir. Masuk kembali untuk melanjutkan.";
    if (["EMAIL_NOT_VERIFIED", "EMAIL_UNVERIFIED"].includes(error.code))
      return "Verifikasi email diperlukan. Masuk kembali dan selesaikan verifikasi.";
    if (error.status === 403)
      return error.code === "CSRF_INVALID"
        ? "Sesi keamanan tidak valid. Muat ulang halaman sebelum melanjutkan."
        : "Akun Anda tidak memiliki izin untuk tindakan ini.";
    if (error.status === 410)
      return "Informasi publik telah dicabut. Foto dan ringkasan sebelumnya tidak lagi ditampilkan.";
    if (error.status === 404)
      return "Informasi tidak ditemukan atau tidak tersedia untuk akun Anda.";
    if (error.code === "PENDING_UPDATE_EXISTS")
      return "Anda sudah memiliki pembaruan yang menunggu tinjauan. Buka Kontribusi saya untuk melengkapinya.";
    if (revisionConflict(error))
      return "Versi informasi telah berubah. Tinjau versi terbaru; input Anda tetap disimpan.";
    if (error.status === 429)
      return `Terlalu banyak permintaan. Coba kembali${error.retryAfter ? ` setelah ${error.retryAfter} detik` : " beberapa saat lagi"}.`;
    if (error.code === "READ_TIMEOUT")
      return "Pemuatan terlalu lama. Coba muat ulang.";
    if (error.code === "SOURCE_REVISION_CHANGED")
      return "Sumber laporan berubah. Perbarui sumber dan tinjau ulang gambar final sebelum melanjutkan.";
    if (error.code === "PENDING_RETRACTIONS")
      return "Masih ada penarikan yang belum selesai. Periksa operasi penarikan sebelum memutuskan koneksi.";
    if (error.code === "ACTIVITY_FULL")
      return "Kuota kegiatan telah penuh. Perbarui informasi untuk melihat status dan tempat yang tersedia.";
    if (error.code === "EVIDENCE_INVALID")
      return "Bukti belum memenuhi izin, versi, atau hubungan dengan sumber yang dipilih. Periksa kembali bukti.";
    if (error.code === "PUBLICATION_NOT_APPROVED")
      return "Gambar final dan konten terkini perlu disetujui sebelum diposting.";
  }
  return error instanceof Error
    ? error.message
    : "Permintaan belum berhasil. Coba kembali.";
}
export function permissionReason(code: string | null | undefined): string {
  const reasons: Record<string, string> = {
    ACCOUNT_DISCONNECTED: "Akun Instagram belum terhubung.",
    TOKEN_EXPIRED: "Otorisasi Instagram kedaluwarsa; hubungkan ulang akun.",
    PERMISSION_MISSING:
      "Izin publikasi Instagram belum lengkap; periksa otorisasi akun.",
    RENDITION_NOT_READY: "Gambar final belum siap.",
    AUTOMATION_DISABLED: "Pembuatan draf otomatis belum diaktifkan.",
    COORDINATOR_REQUIRED:
      "Tindakan ini memerlukan koordinator yang telah menerima penugasan.",
    FEATURE_UNAVAILABLE: "Fitur belum diaktifkan.",
    PUBLICATION_NOT_APPROVED: "Konten terkini perlu persetujuan moderator.",
    SOURCE_NOT_APPROVED: "Sumber laporan belum memenuhi syarat publikasi.",
    REGISTRATION_CLOSED: "Pendaftaran telah ditutup.",
    ACTIVITY_FULL: "Kuota kegiatan sudah penuh.",
    INCIDENT_CLOSED: "Kejadian sudah ditutup untuk tindakan ini.",
    SUPPORT_CLOSED: "Dukungan baru telah ditutup karena kejadian sudah selesai.",
    EMAIL_NOT_VERIFIED: "Verifikasi email diperlukan sebelum mengirim kontribusi.",
    EMAIL_UNVERIFIED: "Verifikasi email diperlukan sebelum mengirim kontribusi.",
    INVALID_TRANSITION: "Tindakan belum tersedia pada status saat ini.",
    NOT_COORDINATOR: "Akun ini bukan koordinator kegiatan.",
  };
  return code
    ? (reasons[code] ??
        "Tindakan belum tersedia. Hubungi pengelola untuk memeriksa izin dan kesiapan layanan.")
    : "";
}
export const revisionConflict = (e: unknown) =>
  e instanceof ApiError &&
  (e.status === 409 || e.status === 412) &&
  [
    "REVISION_CONFLICT",
    "PRECONDITION_FAILED",
    "SCHEDULE_REVISION_CONFLICT",
  ].includes(e.code);

import type { SapScan } from "../lib/api/client";

export function scanPointsMessage(scan: SapScan): { text: string; points?: number } {
  if (scan.status === "queued" || scan.status === "processing") return { text: "Poin menunggu hasil scan." };
  if (scan.status === "failed") return { text: "0 poin: pemindaian belum berhasil." };
  if (scan.pointsAwarded > 0) return { text: "+{0} poin telah ditambahkan.", points: scan.pointsAwarded };
  if (scan.outcome === "unknown" || scan.outcome === "no_waste") return { text: "0 poin: material sampah belum dikenali." };
  if (scan.pointsReason === "daily_limit") return { text: "0 poin: batas harian 5 scan berhadiah (50 poin) telah tercapai. Poin tersedia lagi besok (WIB)." };
  if (scan.pointsReason === "duplicate_image") return { text: "0 poin: foto yang sama sudah dipindai hari ini (WIB)." };
  return { text: "0 poin: alasan poin tidak diberikan belum tersedia." };
}

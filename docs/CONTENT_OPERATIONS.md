# CONTENT_OPERATIONS — Moderasi dan operasi SAP

v1.0 · Pemilik teknis: Zamani; admin operasional ditunjuk sebelum peluncuran. Dashboard frontend dikerjakan Zaka.

## 1. Alur pemeriksaan laporan

Submitted bersifat private. Admin memeriksa foto, waktu, kategori opsional, lokasi, alasan pelapor dan kandidat duplicate. Label model hanya membantu; model tidak memverifikasi kebenaran kejadian. Kriteria verify: bukti cukup jelas untuk penumpukan yang dilaporkan, lokasi/waktu masuk akal, tidak duplikat, dan ringkasan publik sudah dibersihkan dari data pribadi.

Rejected: alasan singkat yang bisa dipahami pelapor, misalnya bukti tidak cukup atau bukan laporan penumpukan. Duplicate: hubungkan canonical report yang sudah verified/in_progress/resolved; laporan tetap tercatat sebagai laporan terhadap canonical incident, tetapi tidak menambah incident count dan tidak menghasilkan poin. Admin tidak boleh memilih target milik sendiri/chain/cycle tanpa validasi sistem.

## 2. Penanganan dan bukti

Verified → in_progress ketika ada tindak lanjut nyata yang dicatat. In_progress → resolved membutuhkan foto bukti dan catatan; ini penilaian admin berdasarkan bukti, bukan jaminan pemerintah telah menangani. Reopen memerlukan alasan dan mengembalikan ke verified. Jangan menampilkan nama instansi/mitra atau status penjemputan bila tidak ada kerja sama nyata.

## 3. Publikasi dan privasi

Exact koordinat, identitas pelapor, original foto dan catatan internal hanya owner/admin. Publik hanya melihat area H3, ringkasan yang telah ditinjau, tanggal, kategori, status, dan derivative foto yang aman bila ada. Sebelum approve foto, periksa wajah/plat/alamat pribadi, buang EXIF dan buat derivative; jika belum aman, publicMediaUrl tetap null. Hapus/retract konten publik segera bila ditemukan informasi sensitif.

## 4. Poin dan anti-spam

Keputusan memberi poin ditentukan backend sesuai PRD, bukan admin mengetik jumlah manual. Scan berulang pada gambar sama/hari sama tidak menambah award; duplicate/rejected tidak mendapat report award. Ketika canonical yang pernah verified dibatalkan, ledger menulis reversal. Verifikasi ulang memulihkan award yang sama tanpa kuota baru; cap harian tetap dicatat pada hari award asli, sehingga siklus verify/reject tidak menjadi sumber poin tambahan.

Batasi upload/laporan sesuai rate limit; admin memeriksa pola spam dan jangan menganggap setiap orang dalam radius sama melaporkan kejadian sama. Pelaporan ramai meningkatkan coverage, bukan bukti bebas bias; metode area selalu ditampilkan.

## 5. Ritme operasi

Baseline usulan: triase submitted setiap hari kerja, tangani laporan PII yang masuk segera, pantau antrean dan snapshot stale. Target waktu respons publik baru diumumkan setelah ada pemilik operasional yang sanggup memenuhinya. Review acak keputusan, bukti resolved dan duplikat setiap minggu; audit perubahan tidak dihapus agar metrik bisa ditelusuri.

## 6. Retensi dan penghapusan

Sebelum submit, jelaskan moderasi, penggunaan lokasi untuk agregasi, publikasi teredaksi, dan kebijakan setelah akun dihapus. Baseline TECH_SPEC: scan media24 jam, orphan24 jam, media laporan90 hari setelah resolved, log30 hari/audit180 hari. Foto aktif dan data pribadi yang tidak lagi diperlukan dibersihkan. Akun yang dihapus kehilangan identitas/session; kejadian publik dapat dipertahankan secara anonim sesuai kebijakan yang disetujui. Bukti internal perlu akses terbatas dan masa retensi jelas.

## 7. Checklist pembukaan

- [ ] Admin operasional dan escalation contact tersedia.
- [ ] Kategori EcoLens ML serta label Indonesia benar; source Hugging Face hanya provenance dan tidak ada mock di produksi.
- [ ] Pengunjung peta hanya melihat data terverifikasi teredaksi.
- [ ] Metode area, periode, asOf dan no-data dijelaskan.
- [ ] Verify/duplicate/reject/resolve/reopen telah diuji bersama frontend/backend.
- [ ] Privacy copy, retensi, account deletion, log redaction dan audit berjalan.
- [ ] SMTP/tiles/Gradio/queue/R2 failure mempunyai runbook dan pemilik.

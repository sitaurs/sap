# DESIGN-UI-UX — Brief redesign SAP untuk teman

v1.0 · **Pemilik UI/UX dan frontend: teman Anda.** Produk bernama SAP — Sustainable AI Platform. Dokumen ini brief dan kriteria handoff; desainer mengembangkan identitas visual serta implementasi frontend.

## 1. Tujuan pengalaman

Pengguna memahami tiga tindakan: kenali sampah, laporkan penumpukan, lihat area yang sering mengalami kejadian. Pertahankan kemudahan kamera/unggah dan aktivitas pengguna dari produk sumber, lalu rancang ulang brand, navigasi, layout, komponen, visual dan copy untuk SAP. Tidak perlu menyalin landing/globe/animasi EcoLens. Nama/logotype SAP dan tagline ditetapkan dalam eksplorasi desain.

Prinsip: tindakan utama jelas; fungsi berguna di ponsel; peta tetap terbaca saat banyak area; angka punya arti; status laporan dibedakan dari hasil ML; progres asinkron jujur; tidak mendorong foto berulang hanya untuk mengejar poin.

## 2. Navigasi yang disarankan

Mobile: Beranda/Dashboard, Scan, Laporan, Peta, Akun; achievements/leaderboard dapat menjadi subbagian aktivitas. Desktop: sidebar ringkas dengan navigasi sama; admin memiliki konteks/menu terpisah. Landing publik mengarahkan scan/lapor/login dan peta. Kamera baru meminta izin ketika pengguna menekan aksi kamera. Dashboard pengguna bukan dashboard admin.

## 3. Inventaris layar

| ID | Layar | Elemen/tindakan utama | State yang harus didesain |
| --- | --- | --- | --- |
| UI-01 | Landing SAP | Manfaat, tiga kemampuan, cara kerja, CTA | Pengunjung dan pengguna masuk |
| UI-02 | Daftar/login | Nama/email/password, tautan bantuan | Validasi, salah kredensial, email belum verified, rate limit |
| UI-03 | OTP | Kode6 digit, expiry, resend timer | Salah, expired, cooldown, sukses |
| UI-04 | Lupa/reset password | Email, OTP, password baru | Generic response, expired, reset sukses |
| UI-05 | Dashboard | Scan/point/streak, distribusi10 kategori, laporan saya | Loading, pertama kali, data ada, error |
| UI-06 | Scan capture | Kamera/unggah, pratinjau, batal/ganti | Izin ditolak, device unavailable, format/ukuran salah |
| UI-07 | Scan progress/hasil | Tahap antrean/proses, kandidat, CTA lapor | Queued, processing, classified, unknown, no_waste, failed |
| UI-08 | Riwayat scan | Item bertanggal, kategori/status, detail | Kosong, pagination, media expired |
| UI-09 | Buat laporan | Foto1–3, kategori opsional, deskripsi, tingkat tumpukan | Validasi, upload gagal, tanpa scan |
| UI-10 | Tentukan lokasi/waktu | GPS opsional, pin manual, konfirmasi, waktu kejadian | GPS ditolak, pin diubah, waktu invalid |
| UI-11 | Tinjau/kirim laporan | Ringkasan dan pemberitahuan verifikasi | Submitting, retry, idempotent success |
| UI-12 | Laporan saya | Filter status, item dan ringkasan | Semua6status, kosong, pagination |
| UI-13 | Detail/timeline laporan | Foto private, status, alasan, edit submitted | Duplicate menunjuk referensi; rejected dengan alasan;409konflik |
| UI-14 | Peta area | Sel, legenda, filter periode/kategori, toggle list | Loading, data, no data, stale, terlalu luas, tiles gagal |
| UI-15 | Detail area | Count unik/open/resolved, periode/asOf, ringkasan publik | Tanpa foto publik, filter berubah, area tak punya data |
| UI-16 | Achievements | Badge unlocked/locked/revoked | Progres, empty, revoke |
| UI-17 | Leaderboard | Rank/poin/display name | Kosong, pagination; tidak tampil email |
| UI-18 | Akun | Profil/logout/hapus | Reauth, konfirmasi hapus, queued/completed/failure |
| UI-19 | Admin overview | Antrean dan usia laporan | Tidak punya akses, loading/empty/error |
| UI-20 | Admin antrean | Filter, daftar status, sort | Pagination, konflik keputusan bersamaan |
| UI-21 | Admin review | Bukti, koordinat, waktu, kandidat duplicate | Verify/reject/duplicate, validation, stale revision |
| UI-22 | Admin penanganan | Start/resolved/reopen, bukti dan catatan | Upload bukti, konfirmasi, status invalid |
| UI-23 | Admin audit | Keputusan, aktor, target/waktu | Filter, pagination, kosong |

## 4. Prototipe wajib

A. Login → scan foto plastik → kandidat → dashboard/riwayat. B. Foto tidak dikenali → tetap buat laporan manual → pin/tanggal → submit → status menunggu. C. Admin review → verify → area muncul → in_progress → resolved dengan bukti → pelapor melihat timeline. D. Duplicate/rejected → alasan dan hitungan peta tidak bertambah. E. Session expired, layanan EcoLens ML timeout, GPS ditolak, peta gagal: user memahami cara melanjutkan.

Setiap prototipe mencakup kembali, batal dan menjaga input yang belum dikirim; jangan membuat desain hanya jalur sukses. Teman menguji klik prototipe sebelum implementasi dan menguji kembali dengan backend nyata.

## 5. Pedoman visual yang dapat dieksplorasi

- Arah: bersih, modern, berbasis informasi; brand hijau-biru dengan netral hangat dapat dijadikan moodboard awal. Desainer menentukan palet final, ikon/logo, ilustrasi dan gaya tipografi.
- Warna risiko tidak boleh bergantung pada warna saja; sertakan label rendah/sedang/tinggi, pola/ikon dan angka. Status verified bukan sinonim aman, resolved bukan prediksi bebas sampah.
- Kandidat token awal: teks `#17231D`, primary `#176B45`, accent `#155E75`, background `#F7F8F5`, surface putih. Semua pasangan teks/background harus diuji kontras; ini titik awal, bukan palet final wajib.
- Body16 px, line-height sekitar1.5; judul24–36 px sesuai perangkat; grid spacing4/8 px. Target sentuh≥ 44 px. Breakpoint referensi360,768,1280 px; layout harus tetap bekerja320 px dan zoom200%.
- Peta menggunakan bottom sheet detail pada mobile dan panel samping pada desktop. Tabel admin berubah ke kartu/list di mobile. Animasi singkat untuk perubahan state dan menghormati reduced motion.

## 6. Komponen yang perlu dibuat

Button/loading/icon button; input/error/help; password/OTP; uploader/progress; camera preview; category chip; scan result card; async status; report card; timeline; status badge; risk legend; date/category filter; map/list toggle; area detail; stat card; empty/error state; pagination; modal konfirmasi; toast; role-guard page; admin review panel. Setiap komponen memiliki disabled/focus/hover/error yang relevan serta props typed dari kontrak bila membawa data API.

## 7. Copy dan arti data

- Unknown: "Jenis sampah belum bisa dikenali. Coba foto lain atau lanjutkan laporan."
- ML failure: "Pemindaian sedang tidak tersedia. Anda tetap bisa membuat laporan."
- Submitted: "Laporan terkirim dan menunggu pemeriksaan."
- Area: "5 kejadian terverifikasi pada 3 hari berbeda selama periode ini."
- No data: "Belum ada laporan terverifikasi untuk area dan periode ini."
- Stale: "Data terakhir diperbarui [waktu]. Pembaruan sedang tertunda."
Jangan menampilkan persen peluang penumpukan, berat/CO₂/air/energi aktual, atau tingkat kepenuhan dari output klasifikasi. Jangan membawa multiplier pseudo-impact dari web EcoLens lama. Untuk score model pilih istilah "skor model" dengan penjelasan, atau prioritaskan kandidat kategori tanpa indikator kepastian palsu.

## 8. Aksesibilitas dan privasi

Focus visible, label field, error terhubung, urutan keyboard, alt yang berguna, live region untuk progres/status, stop polling announcement berulang, reduced motion. Foto/lokasi laporan tidak langsung publik; jelaskan sebelum submit. Peta mempunyai list alternatif yang memuat informasi yang sama. Dialog kamera/hapus kembali ke fokus pemicu ketika ditutup. Konfirmasi hapus tidak menggunakan pola manipulatif.

## 9. Deliverable teman Anda

Figma dengan halaman Foundations, Components, User Flows, Screens, Prototype, Handoff; identitas SAP; desain mobile+desktop dan state matriks; asset/logo berizin; token; source Next.js; generated API client; MSW mock; mapping layar→operationId; pengujian aksesibilitas dan bukti integrasi. Token final dibagikan ke code sebagai CSS variables, tidak disalin manual per halaman.

## 10. Penerimaan desain/frontend

Tidak ada nama EcoLens sebagai brand UI produk; istilah "EcoLens ML" hanya boleh muncul bila penjelasan provenance memang diperlukan. Navigasi semua fitur wajib tersedia; status dan angka cocok kontrak; tiga alur utama selesai tanpa penjelasan moderator; no-data/error/permission states jelas; validasi form cocok backend; map/list setara; runtime tidak bergantung pada fixture produksi. Lihat FRONTEND_HANDOFF dan INTEGRATION_CONTRACT untuk implementasi.

# REQUIREMENTS — SAP

v1.0 · Semua FR-01 sampai FR-14 dan NFR berikut wajib untuk rilis lengkap. UI/UX/frontend milik Zaka; backend milik Zamani. Schema mesin berada di contracts/openapi.json.

| ID | Kebutuhan | Acceptance criteria |
| --- | --- | --- |
| FR-01 | Auth email/password + OTP + reset | Verifikasi, expiry, resend terbatas, logout/revoke, password reset dan sesi kadaluwarsa punya state jelas; respons reset tidak membocorkan akun |
| FR-02 | Kamera/unggah | JPEG/PNG/WebP ≤ 10 MiB; kamera ditolak tetap bisa unggah; server memeriksa byte dan decode; EXIF dibuang |
| FR-03 | Scan EcoLens ML | Scan asinkron melalui Gradio self-hosted, 10 kategori asli; classified/unknown/no_waste/failure berbeda; retry idempoten dan tidak menggandakan poin |
| FR-04 | Riwayat/dashboard | Hanya data pemilik; scan tersimpan dan statistik server; distribusi 10 kategori konsisten |
| FR-05 | Poin/streak/badge/leaderboard | Ledger unik, batas harian, reversal dan pagination; nama publik pengguna tanpa email; angka sama di semua halaman |
| FR-06 | Buat laporan | 1–3 foto, koordinat valid, waktu kejadian, deskripsi 20–2000 karakter; categoryId/scanId opsional; submission tidak bergantung pada ML sukses |
| FR-07 | Laporan saya | Daftar/detail/status/timeline pemilik; koreksi submitted saja, perubahan menggunakan revision; konflik tidak menimpa diam-diam |
| FR-08 | Admin moderasi | Verify/reject/duplicate dengan alasan, histori immutable; role diperiksa backend; laporan submitted tidak masuk publik |
| FR-09 | Penanganan | Verified → in_progress → resolved; resolved wajib bukti foto dan catatan; reopen wajib alasan |
| FR-10 | Peta area | Filter periode/kategori/bbox; laporan canonical terverifikasi saja, metoda H3 fixed, without-data berbeda dari rendah |
| FR-11 | Detail area | Event unik/open/resolved, hari kejadian, asOf dan methodVersion; daftar ringkasan teredaksi tanpa identitas/koordinat rinci |
| FR-12 | Deduplikasi | Saran kandidat radius+waktu tidak otomatis menghapus; admin menandai duplicate dengan canonicalId; duplikat tidak menaikkan hitungan atau poin |
| FR-13 | Profil/hapus akun | Update displayName; konfirmasi dan recent auth untuk penghapusan; cleanup media pribadi serta pseudonimisasi laporan publik sesuai kebijakan |
| FR-14 | Operasi dan audit | Audit keputusan admin, liveness dan model-aware readiness ML yang terpisah, health web/API/worker, job cleanup, statistik antrean, backup/restore dan alert |

## Kebutuhan nonfungsional

| ID | Target dan pembuktian |
| --- | --- |
| NFR-01 | Mobile 320 px sampai desktop; keyboard, fokus terlihat, label, kontras dan reduced motion; target WCAG 2.2 AA diuji manual + otomatis |
| NFR-02 | Request/response sesuai OpenAPI, generated client/types tanpa edit manual; CI mendeteksi schema drift dan fixture invalid |
| NFR-03 | Semua mutasi terlindungi CSRF/Origin; sesi HttpOnly; role/ownership tiap resource; storage private dan URL baca singkat |
| NFR-04 | Usulan p95 API non-ML ≤ 500 ms dan agregasi peta ≤ 2 s pada skenario staging 20 pengguna bersamaan, 10k laporan; rekam kondisi uji |
| NFR-05 | Respons queued scan ≤ 1 s; provider ML soft wait 15 s, deadline 90 s; hasil error/manual laporan tetap usable saat Gradio mati; target bukan jaminan provider |
| NFR-06 | UTC untuk timestamp; hari streak/agregasi Asia/Jakarta; API score 0..1, byte size bytes, jarak meter, GeoJSON longitude lalu latitude |
| NFR-07 | Tidak ada email, token, raw foto atau koordinat tepat dalam log publik; foto laporan publik hanya derivative disetujui admin |
| NFR-08 | `Idempotency-Key` wajib tepat pada createScan, createReport, decideReport dan deleteMe; tidak wajib pada auth mutation atau upload. Key sama+canonical payload sama mereplay hasil selama 24 jam, payload berbeda menghasilkan 409. Update report dan keputusan admin memakai If-Match; retry/concurrency tidak menciptakan scan, laporan, status atau poin ganda |
| NFR-09 | Backup database dan objek diuji restore; target RPO ≤ 24 jam/RTO ≤ 8 jam adalah baseline operasi yang harus dibuktikan |
| NFR-10 | Map down → list area; data kosong ≠ aman; ML down ≠ no_waste; session expired ≠ data kosong |

## Acceptance lintas fitur

Uji satu pengguna mendaftar, scan, melapor, admin verify, peta berubah, admin resolve, pengguna melihat status dan poin. Uji duplikat, rejection, pencabutan verifikasi dan stale revision. Uji semua jalur dengan fixture lalu dengan API staging dan layanan Gradio self-hosted yang nyata. TEST_PLAN berisi matriks rinci.

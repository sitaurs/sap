# TEST_PLAN — Verifikasi SAP

v1.0 · Paket ini mendefinisikan pengujian; aplikasi belum diimplementasikan. Fixtures sintetis bukan bukti akurasi model atau kejadian nyata.

## 1. Tingkat pengujian

Unit: rules ledger/status/hotspot/mapping. Contract: request/response API dan field/privacy. Integration: Neon Postgres/PostGIS + Upstash Redis/BullMQ + Cloudflare R2 melalui S3-compatible API + worker. E2E: Next.js→NestJS→data dan Gradio self-hosted untuk smoke terkontrol. Visual/accessibility: teman memimpin, backend membantu data/state. Hindari semua tes memakai stub sehingga integrasi nyata tidak pernah diperiksa.

## 2. Matriks acceptance

| Test | FR/NFR | Skenario | Harus terbukti |
| --- | --- | --- | --- |
| T-01 | FR-01 | Daftar→OTP→login; OTP salah/expired; resend | Single-use, cooldown 60 detik, maksimum 5 percobaan atomik, cookie HttpOnly, payload seragam |
| T-02 | FR-01,NFR-03 | CSRF hilang/salah pada semua mutasi, role user akses admin, resource user lain | 403/404; tidak ada side effect; GET logout ditolak/tidak tersedia |
| T-03 | FR-01 | Reset password dan logout pada dua tab | Reset mencabut seluruh sesi; logout mutation mencabut sesi aktif dan query pribadi dibersihkan |
| T-04 | FR-02 | Foto base64 JSON/SVG/polyglot/invalid/oversize/decode bomb/kamera ditolak | Server menolak aman; hanya multipart JPEG/PNG/WebP tervalidasi; upload alternatif berfungsi |
| T-05 | FR-03 | Gradio classified 10 kategori/unknown/no_waste/error | Normalisasi tepat; biological tidak menjadi other; format provider tidak bocor |
| T-06 | FR-03,NFR-05 | Cold start/timeout/invalid payload/401/403/outage/model multiclass hilang | Readiness gagal bila model degraded; status failed berbeda dari no_waste; tidak ada poin; bisa lapor tanpa ML |
| T-07 | FR-03,05 | Worker crash/retry dan double-click scan | Hanya satu completion/award; ledger tidak ganda |
| T-08 | FR-04,05 | Kuota poin, pergantian hari Asia/Jakarta, reversal | Stats/badge/streak/rank konsisten dengan aturan |
| T-09 | FR-06,07 | Submit tanpa scan, lokasi manual, future time, edit submitted | Data valid tersimpan; future ditolak; status lain tidak boleh edit |
| T-10 | FR-08,09 | Verify→in_progress→resolved→reopen | Bukti/notes wajib; timeline/audit lengkap |
| T-11 | FR-12 |5 laporan kejadian sama→1 canonical | Map count1 dan award tidak bertambah karena duplicate |
| T-12 | FR-10,11 |5 canonical3 tanggal,2 resolved | High,incident5,open3,resolved2 |
| T-13 | FR-10 |3 canonical2 tanggal lalu satu rejected | Medium berubah low dan count2 |
| T-14 | FR-10 |5 canonical1 tanggal; area0kejadian | Low untuk pertama; no-data untuk kedua |
| T-15 | FR-10,11,NFR-06 | Filter sama, pan/zoom/pagination, lon-lat terbalik | Map/detail/list konsisten, validasi koordinat, period boundaries |
| T-16 | FR-08,11,NFR-07 | Submitted/private report, media dan publik projection | Data privat tidak keluar melalui endpoint publik |
| T-17 | NFR-08 | Dua admin kirim decision dengan revision sama | Satu sukses, satu409, tidak overwrite/duplicate ledger |
| T-18 | FR-13 | Delete akun dengan receipt | Identitas/session/media terhapus sesuai kebijakan; status receipt tersedia tanpa PII |
| T-19 | NFR-01,10 | Keyboard/zoom200%/320 px/GPS ditolak/map tile error | Alur dapat selesai; map list alternatif bermakna |
| T-20 | NFR-02 | Field/enum backend berubah tanpa kontrak | CI gagal; generated client/fixture drift terdeteksi |
| T-21 | FR-14,NFR-09 | Restore DB+media+replay deletion tombstone | Data yang diminta hapus tidak muncul kembali; aplikasi sehat |
| T-22 | NFR-04 |20 pengguna bersamaan/10kreport | Ukur p95 API/map, catat host/index/cold-warm kondisi |
| T-23 | FR-01 | Resend verification setelah cooldown dan concurrent OTP attempts | Endpoint tersedia; satu challenge aktif; batas 5 percobaan tidak dapat dilewati race |
| T-24 | FR-03,05 | Completion scan bersamaan/replay outbox/key idempotensi sama | Satu scan/completion/ledger/badge; canonical payload berbeda dengan key sama menghasilkan 409 |
| T-25 | FR-08 | Keputusan same-status memperbarui metadata publik | If-Match wajib, revision naik, audit tercatat, status tetap, tanpa award/reversal |
| T-26 | PRD | Dashboard/landing setelah scan | Tidak ada pseudo-impact CO2/air/energi atau klaim fisik tanpa metodologi |

## 3. Dataset uji

Fixtures API dalam paket mencakup28 state utama untuk mock. Untuk geospasial, buat seed nyata memakai library H3 dan PostGIS, bukan polygon ilustratif fixture; kasus batas sel, waktu, radius duplicate dan rentang filter wajib. Untuk ML, gunakan contoh berizin/fixture internal dari layanan Gradio self-hosted; source Hugging Face hanya provenance. Jangan mengklaim benchmark 95% dari tes UI. Uji provider nyata dipisahkan dari tes CI rutin agar network/resource VPS tidak membuat semua PR flaky.

## 4. Security dan operasi yang relevan

Uji ownership media/report/scan, strict validation, SQL parameterization, CSRF pada setiap mutation, rate limit, password/OTP retry, sanitasi publicSummary, R2 signed URL expiry, pencabutan role/sesi, dan tidak adanya secret di bundle. Uji penciptaan outbox+DB atomik, queue terhenti, job terlambat setelah delete, retry 502 provider, Basic Auth salah tanpa retry tak terbatas, event polling putus, late result setelah timeout, restart saat job aktif, dan cleanup orphan. Uji liveness terpisah dari model-aware readiness, kedua checkpoint loaded/compatible, score finite 0..1, label asing/`error`, serta concurrency baseline satu pada VPS 2 vCPU.

## 5. Gate dan bukti

PR fitur: unit+contract+build+fixture gate; staging: E2E nyata, accessibility, provider probe; rilis: semuaFR/NFR disetujui kedua pemilik, tidak ada isu kritis, backup/restore dan admin SOP siap. Simpan tanggal, commit frontend/backend/contract, lingkungan, input teredaksi dan hasil. Angka target performa/retensi adalah baseline usulan sampai hasil uji membuktikannya.

## 6. Pemeriksaan paket dokumentasi

Sebelum ZIP: cocokkan operationId frontend dengan OpenAPI; resolve semua $ref; periksa schema fixture, enum, link internal, judul produk, serta integritas ZIP. Ini pemeriksaan dokumen, bukan tes aplikasi. Catat hasil aktual pada akhir README setelah pemeriksaan selesai.

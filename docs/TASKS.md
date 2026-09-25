# TASKS — Backlog SAP

v1.0 · Checkbox hanya ditandai bila ada bukti aktual; dokumen/kontrak bukan bukti fitur aplikasi selesai. FE=Zaka(UI/UX+frontend); BE=Zamani; BOTH=keduanya.

## Gerbang bersama

- [ ] C-01 BOTH — Review PRD/taxonomy/state/kontrak1.0.0; selesai bila komentar utama ditutup. Dependensi: tidak ada.
- [ ] C-02 BE — Selesaikan acceptance spike Gradio. SetelahC-01.
  - [x] Discovery API/input/output dan named endpoint terverifikasi.
  - [x] HTTP Basic Auth, upload dan basic inference smoke terverifikasi.
  - [ ] Fixture masing-masing 10 kelas serta unknown/no_waste.
  - [ ] Malformed response, label `error`, model hilang/mismatch dan degraded readiness.
  - [ ] Timeout, polling putus, late result dan restart saat job aktif.
  - [ ] `providerRevision`, cold/warm latency, RSS/CPU dan concurrency benchmark.
- [ ] C-03 BOTH — Bootstrap checkout bersih repo `sitaurs/sap`, monorepo, lockfile, generated client, MSW dan CI kontrak; `ecoLens`/`ecoLens_ML` tidak ikut repo. Selesai jika perubahan field yang disengaja membuat gate gagal. SetelahC-01.
  - [ ] Sebelum coding auth, dokumentasikan response `Set-Cookie` untuk `sap_csrf`, `sap_session`, dan `sap_deletion` di OpenAPI; regenerasi dan validasi client contract.
- [ ] C-04 BOTH — Buat staging origin tunggal dan akun tes; FE memanggil API tanpa CORS/cookie mismatch. SetelahC-03,B-01.
- [ ] C-05 BE — Tutup external readiness: koneksi Neon pooled/direct dari runtime target, BullMQ/reconnect/replay outbox, R2 presigned lifecycle, SMTP delivery, dan model-aware readiness; perbarui ENVIRONMENT_READINESS tanpa secret. SetelahC-03.

## UI/UX dan frontend — Zaka

- [ ] F-01 Brand SAP, sitemap/wireflow dan prototipe5 alur di DESIGN-UI-UX; review bersama. SetelahC-01.
- [ ] F-02 Design tokens/komponen mobile+desktop dan aksesibilitas; semua state kontrol tersedia. SetelahF-01.
- [ ] F-03 Auth/OTP/reset + CSRF bootstrap + session guard; fixture401/403/429 lulus. SetelahC-03,F-02.
- [ ] F-04 Kamera/uploader/scan job/results/history; stream berhenti, polling terminal, unknown/no_waste/failed berbeda. SetelahF-02,C-03.
- [ ] F-05 Dashboard/statistik/poin/streak/badges/leaderboard; semua angka dari API. SetelahF-03,F-04.
- [ ] F-06 Form laporan bertahap foto/pin/waktu/review; bisa submit tanpa ML. SetelahF-02,C-03.
- [ ] F-07 Laporan saya/detail/timeline/edit submitted; konflik409 tidak menghilangkan input. SetelahF-06.
- [ ] F-08 Map/list/area detail dan filter; no data/stale/tiles failure/bounds error tersedia. SetelahF-02,C-03.
- [ ] F-09 Admin antrean/review/duplicate/resolution/audit; guard UI dan decision confirmation. SetelahF-07,F-08.
- [ ] F-10 Account/re-auth/delete status; logout membersihkan cache. SetelahF-03.
- [ ] F-11 Integrasikan API nyata, mobile320 px, keyboard/screen reader/reduced motion; tutup isu prioritas tinggi. SetelahB-10,F-03..F-10.

## Backend — Zamani

- [ ] B-01 NestJS config/env/health/error envelope/DTO/CSRF/session skeleton. SetelahC-01.
- [ ] B-02 Migrations Postgres/PostGIS, taxonomy, role, seed development dan constraints. SetelahB-01.
- [ ] B-03 Auth/register/OTP/resend/login/reset/logout/reauth/profile; test single-use dan revoke. SetelahB-02.
- [ ] B-04 Private upload/sniff/decode/EXIF/expiry/signed read; owner enforced. SetelahB-03.
- [ ] B-05 Gradio ML adapter normalization+BullMQ/outbox+scan endpoints/history; Basic Auth server-only, timeout/late completion/idempotency dan providerRevision. SetelahC-02,B-04.
- [ ] B-06 Ledger/daily caps/streak/badges/ranking/statistics; concurrent completion dan reversal tested. SetelahB-05.
- [ ] B-07 Reports/create/edit/owner/timeline/media ownership; revision+idempotency. SetelahB-04.
- [ ] B-08 Moderation transitions/dedup/evidence/public projection/audit; satu transaksi. SetelahB-06,B-07.
- [ ] B-09 H3 res9/PostGIS duplicate radius/agregasi/filter/cache/isStale; contoh HOTSPOT_RULES lulus. SetelahB-08.
- [ ] B-10 Admin lists/stats/audit dan seluruh operationId implemented; contract tests respons/error. SetelahB-08,B-09.
- [ ] B-11 Cleanup/orphan/retensi/deletion receipts/tombstone; object storage ikut bersih. SetelahB-03,B-04,B-07.
- [ ] B-12 Monitoring/queue age, ML CPU/RAM/readiness/restart, provider availability, rate limits, security dan log redaction. SetelahB-05,B-10,B-11.

## Integrasi dan rilis

- [ ] R-01 BOTH — Demo login→scan→lapor→verify→map→resolve→status. SetelahF-11,B-12.
- [ ] R-02 BOTH — Jalur failure, duplicate, retraction, two-tab conflict, account deletion dan session expiry. SetelahR-01.
- [ ] R-03 BE — Benchmark skenario beban dan backup restore; rekam hasil serta risiko yang tersisa. SetelahB-12.
- [ ] R-04 FE — Uji usability minimal5 orang sebagai titik awal dan audit aksesibilitas; revisi isu kritis. SetelahF-11.
- [ ] R-05 BOTH — Review seluruh FR/NFR, konfigurasi production, retensi dan runbook; deploy setelah semua gerbang. SetelahR-02,R-03,R-04.

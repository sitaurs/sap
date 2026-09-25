# ROADMAP — SAP

v1.0 · Estimasi relatif 14–18 minggu untuk dua kontributor dengan waktu kerja yang memadai. Ini baseline perencanaan, bukan janji tanggal; kapasitas dan pengalaman tim menentukan durasi.

| Fase | Perkiraan | Teman: UI/UX + frontend | Anda: backend | Gerbang |
| --- | --- | --- | --- | --- |
| 1. Kesepakatan & spike | M1–2 | Brand, sitemap, wireflow, setup Next.js/mock | Bootstrap repo SAP, NestJS/data, kontrak, Gradio acceptance spike | Taxonomy/state/API disepakati; discovery terbukti dan risiko provider tercatat |
| 2. Fondasi & fitur asli | M3–5 | Auth, scan, dashboard, komponen | Auth/OTP, upload, queue, adapter Gradio, scan history | Scan dan akun end-to-end |
| 3. Laporan & peta | M6–9 | Form laporan, laporan saya, peta/detail area | Reports, spatial query, canonical/dedup, aggregate | Laporan terverifikasi tampil benar |
| 4. Admin & gamifikasi | M10–12 | Admin, leaderboard, badge/streak, responsive states | Moderasi/resolution, ledger, audit, cleanup | Semua FR terintegrasi |
| 5. QA & rilis | M13–14 | Usability/accessibility dan perbaikan UI | Security/performance/restore/monitoring | Semua acceptance dan bukti uji |
| Cadangan integrasi | M15–18 bila perlu | Perbaikan temuan | ML/deploy/data/performance | Tidak melewati gerbang dengan fitur palsu |

## Dependensi penting

Peta bergantung pada keputusan admin dan HOTSPOT_RULES; frontend dapat memakai mock sebelum API siap. Gamifikasi bergantung pada peristiwa backend yang idempoten. Upload harus siap sebelum scan/laporan. Rilis integrasi ML menuntut pengujian layanan Gradio nyata, model-aware readiness dan identitas artefak meskipun source model tidak berubah. User dapat melapor tanpa scan, sehingga outage ML tidak memblokir fungsi laporan. Implementasi hanya masuk repo `sitaurs/sap`; checkout EcoLens web/ML tetap referensi eksternal.

## Rilis lengkap

G1: kontrak dan prototype; G2: auth+scan; G3: report+map+moderation; G4: semua FR/NFR, nilai stats konsisten, uji silang perangkat, privasi, operasi dan backup. Rilis dilakukan setelah G4; tahapan ini bukan versi MVP terpisah.

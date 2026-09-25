# SAP — Sustainable AI Platform

Paket spesifikasi v1.0 · 24 September 2026 · Bahasa produk: Indonesia

## Kesepakatan proyek

SAP adalah **rebuild dari awal** web EcoLens dengan identitas dan UI baru, mempertahankan kemampuan pengenalan sampah dari model EcoLens, serta menambah pelaporan penumpukan, peta area rawan berdasarkan kejadian terverifikasi, dan dashboard admin. Runtime inferensi produksi yang dipilih adalah layanan Gradio self-hosted; source Hugging Face/EcoLens tetap menjadi provenance model, bukan provider produksi. Semua kebutuhan wajib dalam paket ini masuk satu rilis lengkap; fase roadmap adalah urutan pengerjaan.

**Teman Anda: UI/UX dan seluruh frontend. Anda: backend, database, integrasi ML, geospasial dan operasi.** Bobot, kategori dan pelatihan ML tidak menjadi pekerjaan rebuild ini. Area rawan adalah ringkasan kejadian historis, tanpa klaim memprediksi masa depan.

Dokumen ini menggantikan rancangan EcoLens sebelumnya yang berfokus pada sampah elektronik. Nama produk tampil sebagai **SAP — Sustainable AI Platform**. Nama EcoLens hanya dipakai sebagai referensi sumber. Paket berisi spesifikasi, kontrak dan data contoh; belum merupakan aplikasi, prototipe Figma, ataupun layanan yang sudah diuji operasional.

## Stack yang dipilih

- Frontend: Next.js App Router + React + TypeScript + Tailwind CSS; TanStack Query; MapLibre GL JS.
- Backend: NestJS + TypeScript, REST API, PostgreSQL + PostGIS, Drizzle ORM/SQL migrations, Redis + BullMQ, penyimpanan objek kompatibel S3.
- ML: layanan inferensi Gradio self-hosted yang configurable; backend berkomunikasi melalui adapter Gradio, tanpa pelatihan ulang. Source EcoLens/Hugging Face hanya menjadi provenance dan referensi model.
- Kontrak: OpenAPI 3.1 versi `1.0.0`, tipe TypeScript dihasilkan dari schema; fixture bersama dan pengujian kontrak. HTTP browser memakai `/api/v1` melalui satu origin.
Pilihan ini adalah keputusan rancangan tim untuk pemisahan frontend/backend yang jelas; versi dependensi dikunci saat bootstrap setelah pemeriksaan kompatibilitas.

## Panduan baca sesuai peran

| Peran | Urutan utama |
| --- | --- |
| Teman — UI/UX + frontend | PRD → DESIGN-UI-UX → FRONTEND_HANDOFF → INTEGRATION_CONTRACT → API_SPEC → fixture |
| Anda — backend | PRD → REQUIREMENTS → TECH_SPEC → DATABASE → API_SPEC → ML_INTEGRATION → HOTSPOT_RULES → BACKEND_HANDOFF |
| Bersama | SOURCE_AUDIT → PLAN → ROADMAP → TASKS → TEST_PLAN → DEPLOYMENT → CONTENT_OPERATIONS |

## Daftar dokumen

| File | Isi |
| --- | --- |
| [PRD.md](PRD.md) | Sasaran, pengguna, cakupan rilis dan metrik |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Kebutuhan dan acceptance criteria |
| [PLAN.md](PLAN.md) | Pendekatan kerja dua orang dan tanggung jawab |
| [ROADMAP.md](ROADMAP.md) | Fase dengan dependensi dan gerbang |
| [DESIGN-UI-UX.md](DESIGN-UI-UX.md) | Brief desain baru SAP untuk teman |
| [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) | Halaman, state, pemakaian API dan mock |
| [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) | Modul, transaksi, keamanan dan operasi |
| [TECH_SPEC.md](TECH_SPEC.md) | Arsitektur dan stack terpilih |
| [DATABASE.md](DATABASE.md) | Entitas, relasi dan indeks |
| [API_SPEC.md](API_SPEC.md) | Panduan endpoint dan payload |
| [INTEGRATION_CONTRACT.md](INTEGRATION_CONTRACT.md) | Aturan mencegah mismatch dan workflow perubahan |
| [ML_INTEGRATION.md](ML_INTEGRATION.md) | Pemakaian model yang tersedia dan batas integrasi |
| [HOTSPOT_RULES.md](HOTSPOT_RULES.md) | Definisi area rawan, deduplikasi dan agregasi |
| [TASKS.md](TASKS.md) | Checklist terpisah per pemilik |
| [TEST_PLAN.md](TEST_PLAN.md) | Skenario dan bukti siap rilis |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Konfigurasi, CI/CD, pemulihan |
| [CONTENT_OPERATIONS.md](CONTENT_OPERATIONS.md) | Verifikasi laporan dan moderasi |
| [SOURCE_AUDIT.md](SOURCE_AUDIT.md) | Fitur asli yang ditemukan dan pengembangan SAP |
| [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md) | Status verifikasi layanan eksternal dan konfigurasi environment tanpa rahasia |
| [contracts/openapi.json](contracts/openapi.json) | Sumber utama endpoint, enum dan schema v1 |
| [contracts/fixtures.json](contracts/fixtures.json) | Contoh request/response sintetis untuk mock dan tes |

## Aturan prioritas dan perubahan

OpenAPI adalah acuan nama field, endpoint, enum dan status HTTP. REQUIREMENTS mengatur penerimaan; HOTSPOT_RULES mengatur perhitungan; DATABASE memetakan penyimpanan; PRD mengatur cakupan. Bila berbeda, perbaiki dokumen/implementasi dalam PR kontrak sebelum merge. Frontend tidak membuat nama field/status sendiri; backend tidak mengubah respons tanpa pembaruan kontrak dan fixture.

## Kebijakan source dan target repository

Target repository implementasi adalah [github.com/sitaurs/sap](https://github.com/sitaurs/sap). Repository itu hanya memuat implementasi SAP baru dengan struktur berikut:

```text
apps/web
apps/api
apps/worker
packages/api-client
contracts
db
docs
```

Checkout lokal `/sap/ecoLens` dan `/sap/ecoLens_ML` bersifat **read-only reference**. Keduanya tidak boleh disalin, dijadikan submodule/subtree, atau di-commit ke repository SAP. Kode web lama boleh dipelajari sebagai referensi alur dan tampilan, sedangkan implementasi, kontrak, model data, keamanan, dan aturan domain SAP tetap dibangun dari awal berdasarkan handoff ini.

## Keputusan yang belum membutuhkan jawaban sekarang

Domain publik, penyedia hosting/tiles/SMTP, kota cakupan awal, akun admin produksi dan kebijakan retensi final ditetapkan pada setup. Baseline teknis rinci sudah diberikan agar pekerjaan dapat dimulai. Endpoint, Basic Auth, discovery API, upload, dan inferensi dasar Gradio self-hosted sudah diverifikasi; matriks 10 kelas, kondisi model terdegradasi, serta benchmark cold/warm masih harus diselesaikan. Status layanan selengkapnya dicatat di [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md).

## Serah terima

Teman Anda mulai dari README ini, lalu desain dan frontend handoff. Dokumen handoff yang relevan boleh dimasukkan ke folder `docs/` repository SAP baru; salin `contracts/` ke root workspace agar dipakai kedua aplikasi. Jangan ikut menyalin checkout legacy `ecoLens` atau `ecoLens_ML`. Paket tidak memuat kunci API atau data pengguna, dan `.env` tidak pernah boleh di-commit.

## Pemeriksaan paket

Pemeriksaan dokumentasi saat ini mencakup 20 Markdown; pemeriksaan paket sebelumnya mencatat 35 operasi API dan 28 kasus fixture terhadap keyword schema yang digunakan, dengan referensi schema serta tautan internal terselesaikan dan operationId handoff frontend cocok dengan OpenAPI. Konsistensi fixture status scan/laporan dan hitungan area juga diperiksa. Ini pemeriksaan struktural dokumen/kontrak, bukan sertifikasi seluruh standar OpenAPI atau pengujian lengkap runtime ML. Pengujian runtime tetap mengikuti TEST_PLAN.

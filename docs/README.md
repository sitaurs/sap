# SAP — Sustainable AI Platform

Paket spesifikasi v1.0 · 24 September 2026 · Bahasa produk: Indonesia

**Pembaruan 4 Oktober 2026:** dokumen ini mencakup baseline produk dan extension komunitas, relawan, Hermes, dan Instagram R1. Baseline serta banyak handler extension telah diimplementasikan di repository. Kontrak extension `1.2.0` masih draft, beberapa provider belum siap, frontend extension belum seluruhnya terintegrasi, dan release gate belum lulus. Baca [status implementasi backend](BACKEND_IMPLEMENTATION_STATUS.md) sebelum menganggap fitur aktif sebagai rilis siap. Untuk extension, mulai dari [kontrak Zaka–Zamani](CONTRACT_ZAKA_ZAMANI.md), [rencana backend](BACKEND_EXECUTION_PLAN.md), dan kedua [riset](research/2026-10-03-community-volunteers-hermes-ux.md). Zaka bebas menentukan desain/layout extension, sementara fungsi dan perilaku mengikuti kontrak bersama.

## Kesepakatan proyek

SAP adalah **rebuild dari awal** web EcoLens dengan identitas dan UI baru, mempertahankan kemampuan pengenalan sampah dari model EcoLens, serta menambah pelaporan penumpukan, peta area rawan berdasarkan kejadian terverifikasi, dan dashboard admin. Runtime inferensi produksi yang dipilih adalah layanan Gradio self-hosted; source Hugging Face/EcoLens tetap menjadi provenance model, bukan provider produksi. Semua kebutuhan wajib dalam paket ini masuk satu rilis lengkap; fase roadmap adalah urutan pengerjaan.

**Zaka: UI/UX dan seluruh frontend. Zamani: backend, database, integrasi ML, geospasial dan operasi.** Bobot, kategori dan pelatihan ML tidak menjadi pekerjaan rebuild ini. Area rawan adalah ringkasan kejadian historis, tanpa klaim memprediksi masa depan.

Dokumen ini menggantikan rancangan EcoLens sebelumnya yang berfokus pada sampah elektronik. Nama produk tampil sebagai **SAP — Sustainable AI Platform**. Nama EcoLens hanya dipakai sebagai referensi sumber. Paket berisi spesifikasi, kontrak dan data contoh; belum merupakan aplikasi, prototipe Figma, ataupun layanan yang sudah diuji operasional.

## Stack yang dipilih

- Frontend: Next.js App Router + React + TypeScript + Tailwind CSS; TanStack Query; MapLibre GL JS.
- Backend: NestJS + TypeScript, REST API, PostgreSQL + PostGIS, Drizzle ORM/SQL migrations, Redis + BullMQ, penyimpanan objek kompatibel S3.
- ML: layanan inferensi Gradio self-hosted yang configurable; backend berkomunikasi melalui adapter Gradio, tanpa pelatihan ulang. Source EcoLens/Hugging Face hanya menjadi provenance dan referensi model.
- Kontrak: OpenAPI 3.1 versi `1.1.0`, tipe TypeScript dihasilkan dari schema; fixture bersama dan pengujian kontrak. HTTP browser memakai `/api/v1` melalui satu origin.
Pilihan ini adalah keputusan rancangan tim untuk pemisahan frontend/backend yang jelas; versi dependensi dikunci saat bootstrap setelah pemeriksaan kompatibilitas.

## Panduan baca sesuai peran

| Peran | Urutan utama |
| --- | --- |
| Zaka — UI/UX + frontend | PRD → DESIGN-UI-UX → FRONTEND_HANDOFF → INTEGRATION_CONTRACT → API_SPEC → fixture |
| Zamani — backend | PRD → REQUIREMENTS → TECH_SPEC → DATABASE → API_SPEC → ML_INTEGRATION → HOTSPOT_RULES → BACKEND_HANDOFF |
| Bersama | SOURCE_AUDIT → PLAN → ROADMAP → TASKS → TEST_PLAN → DEPLOYMENT → CONTENT_OPERATIONS |

## Daftar dokumen

| File | Isi |
| --- | --- |
| [CONTRACT_ZAKA_ZAMANI.md](CONTRACT_ZAKA_ZAMANI.md) | Kontrak fungsi frontend/backend extension R1, DTO, endpoint, state, izin dan pembagian kerja |
| [BACKEND_EXECUTION_PLAN.md](BACKEND_EXECUTION_PLAN.md) | Requirement backend, paket pekerjaan BE-00–14, dependensi, acceptance, operasi dan rollout |
| [PRD.md](PRD.md) | Sasaran, pengguna, cakupan rilis dan metrik |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Kebutuhan dan acceptance criteria |
| [PLAN.md](PLAN.md) | Pendekatan kerja dua orang dan tanggung jawab |
| [ROADMAP.md](ROADMAP.md) | Fase dengan dependensi dan gerbang |
| [DESIGN-UI-UX.md](DESIGN-UI-UX.md) | Brief desain baru SAP untuk Zaka |
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
| [SAPA_ASSISTANT.md](SAPA_ASSISTANT.md) | **Addendum v1.1** — pet chatbot SAPA (usulan Zaka): brief UX + handoff backend, di luar kontrak v1.0 |
| [contracts/openapi.json](../contracts/openapi.json) | Kontrak mesin endpoint existing 1.1.0; extension dipromosikan setelah schema/handler siap |
| [contracts/fixtures.json](../contracts/fixtures.json) | Contoh request/response sintetis untuk mock dan tes |

## Aturan prioritas dan perubahan

Untuk endpoint existing, OpenAPI 1.1.0 adalah acuan nama field, enum, dan HTTP status. Untuk extension yang belum tersedia, CONTRACT_ZAKA_ZAMANI menetapkan bentuk yang akan diimplementasikan dan BACKEND_EXECUTION_PLAN menetapkan requirement/gate. Pada BE-00 buat schema draft terpisah untuk mock/codegen; jangan memasukkan route yang belum tersedia ke published OpenAPI. Promosi target 1.2.0 dilakukan bersama handler, fixture dan generated client setelah gate siap. Setelah promosi, kontrak mesin wajib sama dengan Markdown. REQUIREMENTS/PRD/DATABASE tetap menjadi baseline fitur lama; HOTSPOT_RULES tetap mengatur risiko H3, tanpa pengaruh vote. Perubahan kontrak direview bersama sebelum push ke main.

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

Domain publik, penyedia hosting/tiles/email, kota cakupan awal, akun admin produksi dan kebijakan retensi final ditetapkan pada setup. Baseline teknis rinci sudah diberikan agar pekerjaan dapat dimulai. Endpoint, Basic Auth, discovery API, upload, dan inferensi dasar Gradio self-hosted sudah diverifikasi; matriks 10 kelas, kondisi model terdegradasi, serta benchmark cold/warm masih harus diselesaikan. Status layanan selengkapnya dicatat di [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md).

## Serah terima

Zaka mulai dari README ini, lalu desain dan frontend handoff. Dokumen handoff yang relevan boleh dimasukkan ke folder `docs/` repository SAP baru; salin `contracts/` ke root workspace agar dipakai kedua aplikasi. Jangan ikut menyalin checkout legacy `ecoLens` atau `ecoLens_ML`. Paket tidak memuat kunci API atau data pengguna, dan `.env` tidak pernah boleh di-commit.

## Pemeriksaan paket

Pemeriksaan dokumentasi saat ini mencakup 20 Markdown; pemeriksaan paket sebelumnya mencatat 35 operasi API dan 28 kasus fixture terhadap keyword schema yang digunakan, dengan referensi schema serta tautan internal terselesaikan dan operationId handoff frontend cocok dengan OpenAPI. Konsistensi fixture status scan/laporan dan hitungan area juga diperiksa. Ini pemeriksaan struktural dokumen/kontrak, bukan sertifikasi seluruh standar OpenAPI atau pengujian lengkap runtime ML. Pengujian runtime tetap mengikuti TEST_PLAN.

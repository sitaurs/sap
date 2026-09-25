# PLAN — Pelaksanaan SAP

v1.0 · Dua jalur kerja paralel: teman = UI/UX dan frontend; Anda = backend. Rilis memuat seluruh kebutuhan wajib.

## 1. Pembagian pekerjaan

| Area | Teman | Anda | Titik temu |
| --- | --- | --- | --- |
| Produk | Alur dan pengalaman | Aturan data/domain | PRD dan acceptance |
| Desain | Brand SAP, Figma, sistem komponen | Umpan balik keterbatasan data/API | Inventaris layar/state |
| Frontend | Next.js, form, peta, dashboard dan admin UI | Menyediakan API/fixture | Generated client + OpenAPI |
| Backend | Konsumsi kontrak | NestJS, auth, DB, worker, ML, laporan, agregasi | Staging dan contract tests |
| ML | State menunggu/hasil/error | Adapter EcoLens ML ke Gradio self-hosted | ScanDto; frontend tidak memanggil Gradio langsung |
| Rilis | Build dan QA frontend | Deploy API/data/worker | End-to-end dan keputusan go/no-go |

## 2. Urutan kerja

1. Bekukan kontrak v1, taxonomy, state laporan, mock dan repo/workspace. Catat hasil discovery Gradio aktual dan selesaikan acceptance spike yang masih pending.
2. Teman menyusun brand/wireflow lalu layar auth/scan/dashboard. Anda membuat auth, upload, scan adapter, worker dan schema awal. Demo menggunakan fixture identik.
3. Teman membuat form laporan, peta, area detail dan laporan saya. Anda membuat laporan, dedup, moderasi, audit dan agregasi H3.
4. Teman membuat admin UI, leaderboard, responsive/error/accessibility states. Anda menyelesaikan ledger, streak, badges, privasi, cleanup dan operasi.
5. Integrasikan semua flow di staging; perbaiki perbedaan kontrak, uji layanan Gradio self-hosted nyata, lalu gerbang keamanan, aksesibilitas, performa dan restore.

## 3. Cara kerja mencegah mismatch

Target implementasi adalah `https://github.com/sitaurs/sap`: `apps/web` milik teman, `apps/api` dan `apps/worker` milik Anda, `packages/api-client` hasil generate, `contracts` milik bersama, serta `db` dan `docs`. Checkout `ecoLens` dan `ecoLens_ML` hanya referensi read-only dan tidak boleh disalin, dijadikan submodule/subtree, atau di-commit. Folder tanggung jawab membantu koordinasi; tidak menghalangi perubahan lintas folder saat disepakati. PR perubahan kontrak wajib menyertakan schema, fixture, mapping UI dan tes. Hindari membangun frontend berdasarkan bentuk respons internal provider/MongoDB lama.

Demo bersama dua kali seminggu, review kontrak sebelum mulai fitur, triase integrasi setiap hari saat fase penggabungan. Definisi selesai: berfungsi dengan fixture dan API nyata, error states lengkap, acceptance lulus, tidak ada pending perubahan schema.

## 4. Risiko dan tindak lanjut

Gradio/model tidak siap atau berubah protokol → adapter, model-aware readiness dan contract probe; tetap bisa melapor manual. Banyak laporan duplikat → verifikasi dan canonical report. Area ramai pengguna bias → label metode dan jumlah kejadian, bukan probabilitas objektif. Peta provider tidak tersedia → daftar ringkasan. Budget kecil → satu host staging web/API/worker; jangan menghapus modul rilis tanpa keputusan produk.

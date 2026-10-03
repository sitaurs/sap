# SAP — Sustainable AI Platform

Rebuild EcoLens berdasarkan kontrak dan handoff SAP. Repo ini hanya berisi implementasi baru backend dan frontend SAP. Source legacy `ecoLens` dan `ecoLens_ML` tidak boleh dimasukkan sebagai submodule, subtree, atau hasil salinan.

## Workspace

- `apps/web`: Next.js frontend and same-origin API proxy
- `apps/api`: NestJS HTTP API (`/api/v1`)
- `apps/worker`: BullMQ worker
- `packages/config`: validasi environment bersama
- `contracts`: OpenAPI dan fixtures sebagai source of truth
- `docs`: handoff yang disinkronkan

## Menjalankan

1. Salin `.env.example` menjadi `.env` dan isi secret melalui kanal aman.
2. `npm install`
3. `npm run dev:api`
4. Terminal lain: `npm run dev:worker`
5. Terminal lain: `npm run dev:web`

Web berjalan di port 3000 dan meneruskan `/api/v1` ke backend lokal port 3001. Untuk akses satu jaringan, jalankan web dengan `npm run dev:web -- --hostname 0.0.0.0`, isi `APP_ORIGIN=http://IP_KOMPUTER:3000` di `.env` backend dan `SAP_ALLOWED_DEV_ORIGINS=IP_KOMPUTER` pada lingkungan web. Bagikan `http://IP_KOMPUTER:3000`, bukan `0.0.0.0`. Jangan commit kredensial atau `.env`.

Jalankan `npm run check` sebelum commit.

## Riset pengembangan

- [Kontrak bersama Zaka–Zamani](docs/CONTRACT_ZAKA_ZAMANI.md): pembagian frontend/backend, fungsi wajib frontend, DTO, endpoint, state, izin, dan handoff integrasi R1. Desain dan layout menjadi pilihan Zaka.
- [Rencana eksekusi backend](docs/BACKEND_EXECUTION_PLAN.md): requirement, paket BE-00–14, migration, dependensi, acceptance, operasi, dan rollout.
- [Rencana komunitas, relawan, dan UX Hermes — 3 Oktober 2026](docs/research/2026-10-03-community-volunteers-hermes-ux.md): alur warga/admin, syarat vote, halaman, pembaruan kondisi, kegiatan, biaya AI, metrik dampak, dan tahapan pilot.
- [Hermes Agent, moderasi laporan, dan integrasi Instagram — 3 Oktober 2026](docs/research/2026-10-03-hermes-instagram.md): kemampuan API, rancangan draf/penarikan, desain poster, komunitas/relawan, dan metrik SDGs.

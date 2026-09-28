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

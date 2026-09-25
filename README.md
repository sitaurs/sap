# SAP — Sustainable AI Platform

Rebuild EcoLens berdasarkan kontrak dan handoff SAP. Repo ini hanya berisi implementasi baru backend dan frontend SAP. Source legacy `ecoLens` dan `ecoLens_ML` tidak boleh dimasukkan sebagai submodule, subtree, atau hasil salinan.

## Workspace

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

Jalankan `npm run check` sebelum commit.

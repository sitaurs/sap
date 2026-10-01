# Hybrid Scan Detection — Plan, Requirements & Design

Status: **IMPLEMENTED** (fase 1–8 selesai, 2026-09-28) · Tanggal: 2026-09-28 · Terkait: `ML_INTEGRATION.md`, `DATABASE.md`, `API_SPEC.md`, `INTEGRATION_CONTRACT.md`

> **Catatan implementasi (2026-09-28).** Fitur sudah diimplementasikan penuh dan `npm run check` hijau (typecheck config/api/worker/web, worker 40 tes, api 126 tes, build, `contracts:lint` 36 paths/40 ops, `contracts:routes` 40/40). Dokumen di bawah adalah rencana asli yang sudah **disinkronkan dengan kode akhir**; perbedaan dari draft awal ditandai inline. Ringkasan berkas final ada di [§8](#8-status-implementasi).

## 1. Ringkasan & Tujuan

Klasifikasi sampah saat ini murni dari model ML eksternal (EcoLens Gradio). User melaporkan hasilnya kadang **ngawur**. Tujuan fitur ini: **hybrid detection** — bila keyakinan (confidence) ML rendah, gambar dikirim ke **vision-LLM** untuk klasifikasi ulang, lalu hasil terbaik yang dipakai. Perilaku bisa **diatur admin** (mode + threshold + model) via dashboard **atau** env.

Keputusan yang sudah disepakati:
- Cakupan: dikerjakan lengkap **sampai UI admin dashboard**.
- Mode default: **`unknown_plus_threshold`**.
- Model vision: **`sapa`** (di gateway `SAPA_LLM_BASE_URL`, sudah diuji vision-capable: botol → `plastic` 0.99, latensi ~12,5s).
- Sumber kebenaran setting: **tabel DB `scan_settings`** (di-seed dari env), bisa dioverride runtime dari admin.

## 2. Latar Belakang (pipeline saat ini)

- ML jalan di **Gradio eksternal** (bukan di repo). Threshold ada **di dalam Space**: binary `no_waste` gate 0.4, multiclass 0.53; hasil <0.53 sudah **di-collapse jadi `Unknown/Mixed`** sebelum sampai ke SAP.
- Worker: `apps/worker/src/scan-processor.ts` → `MlAdapter.classify()` (`ml-adapter.ts`) → `MlClient.predict()` (`ml-client.ts`). Hasil disimpan `scan-repository.ts:completeSucceeded()`.
- Outcome enum: `classified | unknown | no_waste`. Skor top-1 mentah tetap ada di `predictions[0].score`.
- 10 kelas (id = label, tanpa prefix): `battery, biological, cardboard, clothes, glass, metal, paper, plastic, shoes, trash`.
- Tabel `scans` TIDAK punya kolom confidence khusus — confidence ada di `predictions` jsonb (`{categoryId, score}`).
- Sudah ada LLM client OpenAI-compatible (SAPA) tapi **text-only** (`apps/api/src/assistant/assistant-provider.ts`) — perlu versi vision di worker.

## 3. Requirements

### 3.1 Fungsional
- FR1 — Sistem mendukung 4 **mode** deteksi:
  - `full_ml`: ML saja (LLM mati).
  - `unknown_only`: panggil LLM hanya bila outcome ML = `unknown`.
  - `unknown_plus_threshold` (default): panggil LLM bila outcome = `unknown` **ATAU** skor top-1 `< confidence_threshold`.
  - `full_llm`: setiap scan langsung ke LLM (ML dilewati).
- FR2 — `confidence_threshold` (0..1) dapat dikonfigurasi.
- FR3 — Model vision (`vision_model`) dapat dikonfigurasi; default `sapa`.
- FR4 — Admin dapat melihat & mengubah mode/threshold/model dari **panel dashboard** (role `admin`).
- FR5 — Setting juga dapat diset via **env** sebagai nilai awal (seed) saat DB kosong.
- FR6 — Perubahan setting berlaku **tanpa restart** worker (worker baca setting per job, dengan cache pendek).
- FR7 — Bila LLM dipakai, hasil dipetakan ke 10 kategori valid yang sama; kalau tidak valid → tolak (jangan paksa) dan **fallback ke hasil ML**.
- FR8 — Sumber klasifikasi (ML / LLM / LLM-gagal→ML) tercatat untuk audit.

### 3.2 Non-fungsional
- NFR1 — Kegagalan/timeout LLM tidak boleh menggagalkan scan; selalu ada fallback ke ML.
- NFR2 — Latensi LLM ~12,5s per panggilan; worker concurrency saat ini 1. Fitur tidak boleh memblokir queue selamanya (pakai timeout via `SCAN_LLM_VISION_TIMEOUT_MS`, default 30000ms, terpisah dari `SAPA_LLM_TIMEOUT_MS` asisten teks).
- NFR3 — Tidak pernah menulis `category_id` yang melanggar FK `scans.category_id` (reuse `mapPrediction`).
- NFR4 — Endpoint admin wajib lewat `SessionAuthGuard` + `AdminGuard`.
- NFR5 — Tidak ada rahasia (API key) yang bocor ke client/log.
- NFR6 — Biaya: tiap fallback = 1 panggilan LLM berbayar; mode `full_llm` = tiap scan berbayar.

## 4. Desain

### 4.1 Sumber konfigurasi & presedens
`env (default awal) → seed baris DB scan_settings → admin override (runtime)`. Worker & API baca dari **DB** (source of truth). Env hanya mengisi baris saat pertama kali (idempotent seed).

### 4.2 Model data — migrasi `0007_scan_settings.sql`
```sql
-- 0007_scan_settings. Runtime-tunable hybrid detection settings, held in a
-- single "singleton" row so the worker and admin API share one source of truth.
CREATE TABLE scan_settings (
  id                   text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  mode                 text NOT NULL DEFAULT 'unknown_plus_threshold'
                         CHECK (mode IN ('full_ml', 'unknown_only', 'unknown_plus_threshold', 'full_llm')),
  confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.600
                         CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  vision_enabled       boolean NOT NULL DEFAULT false,
  vision_model         text NOT NULL DEFAULT 'sapa' CHECK (length(vision_model) BETWEEN 1 AND 100),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL
);
```
Seed baris `singleton` di `apps/api/src/infrastructure/seed.ts` (`INSERT ... ON CONFLICT (id) DO NOTHING`) memakai nilai env sebagai default. Tabel juga terdaftar di guard `EXPECTED_TABLES` (`apps/api/test/infrastructure/migrations.test.ts`).

### 4.3 Tambahan config — `packages/config/src/index.ts` (`AppConfig`)
```ts
SCAN_LLM_VISION_ENABLED: booleanFromEnv.default(false),
SCAN_HYBRID_MODE: z.preprocess(emptyToUndefined,
  z.enum(['full_ml','unknown_only','unknown_plus_threshold','full_llm']).default('unknown_plus_threshold')),
SCAN_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
SCAN_LLM_VISION_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).default('sapa')),
SCAN_LLM_VISION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
```
`superRefine`: bila `SCAN_LLM_VISION_ENABLED` true → `SAPA_LLM_BASE_URL` & `SAPA_LLM_API_KEY` wajib (endpoint & key vision reuse gateway SAPA). Semua `SCAN_*` env **hanya menyemai** baris DB saat kosong; sesudahnya baris DB yang berlaku.

### 4.4 Logika keputusan (di worker, sesudah `MlAdapter.classify`)
Diimplementasikan **murni/tanpa I/O** di `apps/worker/src/hybrid.ts` (`shouldUseVision`, `resolveClassification`) supaya mudah dites.
```
settings = scanSettingsRepo.get()          // cache TTL ~5s
mlResult = adapter.classify(bytes)         // kecuali mode full_llm

switch settings.mode:
  full_ml:                 use mlResult                              // vision diabaikan meski enabled
  full_llm:                use visionClassify(bytes)                 // ML dilewati total
  unknown_only:            if mlResult.outcome == 'unknown' -> tryVision(mlResult)
  unknown_plus_threshold:  if mlResult.outcome == 'unknown'
                              OR (mlResult.outcome=='classified' AND top1(mlResult) < threshold)
                              -> tryVision(mlResult)                 // top1 == threshold sudah cukup yakin

tryVision(fallback):
  if !settings.vision_enabled: return fallback                      // providerRevision tetap null
  try   v = visionClassify(bytes); return v  (providerRevision = 'llm:<model>')
  catch: return fallback         (providerRevision = 'llm_failed:<model>')   // NFR1
```
`providerRevision` menandai sumber: `llm:<model>` (vision menjawab), `llm_failed:<model>` (vision dicoba, ML yang menjawab), atau `null` (murni ML / vision tak dipakai).

### 4.5 Vision client — `apps/worker/src/vision-client.ts`
- `classify(image: Buffer, mime: string): Promise<MlPrediction>` — bentuk output **sama** dengan `MlPrediction` (`{label, confidences:[{label,confidence}]}`) supaya bisa langsung lewat `mapPrediction` (NFR3).
- Request: `POST {SAPA_LLM_BASE_URL}/chat/completions`, `Authorization: Bearer <SAPA_LLM_API_KEY>`, `model = settings.vision_model`, `response_format: {type:'json_object'}`, `stream:false`, timeout `SCAN_LLM_VISION_TIMEOUT_MS` via AbortController.
- Messages: system (instruksi: klasifikasikan ke 10 kelas, balas `{"category","confidence"}` JSON), user = `[{type:'text',...},{type:'image_url',image_url:{url:'data:<mime>;base64,...'}}]`.
- Parse `{category, confidence}` → `label=category`, `confidences=[{label:category, confidence}]`. Kelas tak dikenal → biarkan `mapPrediction` yang menolak (`ML_INVALID_RESPONSE`).
- TIDAK pernah log key atau isi gambar.

### 4.6 Integrasi worker
- `apps/worker/src/main.ts`: buat `new VisionClient(config)` + `new ScanSettingsRepository(sql)`, inject ke `ScanProcessor(repo, store, adapter, visionClient, settingsRepo)`.
- `scan-processor.ts`: terapkan logika §4.4; set `provider_revision` = `ml:<rev>` | `llm:<model>` | `llm_failed:<model>`.
- `scan-repository.ts`: tanpa perubahan skema (reuse kolom `predictions`, `outcome`, `category_id`, `provider_revision`). Poin tetap hanya untuk `outcome='classified'`.

### 4.7 Admin API — scan settings (baru)
Extend `apps/api/src/admin/` (guard `SessionAuthGuard` + `AdminGuard` sudah ada):
- `GET /admin/scan-settings` → baca baris `singleton`.
- `PUT /admin/scan-settings` → update `mode` | `confidence_threshold` | `vision_enabled` | `vision_model`. Validasi via DTO (`@IsIn` mode, `@Min(0)@Max(1)` threshold, dst). Set `updated_by = user.id`, `updated_at = now()`. Catat ke audit (reuse `audit.repository.ts`).
- **Guard gateway (422)**: `ScanSettingsService` menolak `vision_enabled=true` **atau** `mode='full_llm'` bila `SAPA_LLM_BASE_URL`/`SAPA_LLM_API_KEY` belum dikonfigurasi → `UnprocessableEntityException` kode `SCAN_SETTINGS_INVALID` (tak menyentuh repo). Perubahan non-vision tetap boleh.
- Service `scan-settings` + repository baca/tulis tabel. Bentuk view: `{ mode, confidenceThreshold, visionEnabled, visionModel, updatedAt }`.

### 4.8 Panel Moderasi Laporan (UI baru atas API yang SUDAH ada)
Endpoint moderasi **sudah lengkap** (`GET /admin/reports`, `/duplicates`, `POST /decisions`, `/stats`, `/audit`) — jadi **tanpa API baru**, cukup UI:
- Daftar antrean `status=submitted` (+ filter status lain), tampilkan foto/lokasi/waktu.
- Aksi keputusan: Verifikasi (wajib `publicSummary` + `reason`), Tolak, Tandai Duplikat (pilih target dari `/duplicates`), lanjut `in_progress`/`resolved`.
- Kirim `Idempotency-Key` (uuid) + `If-Match` (revisi) tiap keputusan; tangani 409 (konflik revisi) → refresh.
- Panel Stats (`/admin/stats`) & Audit (`/admin/audit`).

### 4.9 Web — kerangka admin dashboard + panel
- Tambah tab admin yang **hanya muncul bila `user?.role === 'admin'`** (role sudah tersedia di client, `schema.d.ts` `User.role`). Tab: **Moderasi Laporan** & **Pengaturan scan** (Stats/Audit jadi bagian panel moderasi).
- Slot di `apps/web/components/dashboard.tsx` (nilai `Tab` baru `admin-moderation`/`admin-settings`, array `adminNav`, `allTabs`, gate `isAdminTab`). Panel dirender **langsung** dari `dashboard.tsx` lewat komponen baru `apps/web/components/admin-panel.tsx` (`admin-panel.module.css`) — `dashboard-views.tsx` tak diubah. Non-admin yang memaksa tab admin dapat layar "akses ditolak". Ikuti pola panel Pengaturan (toggle SAPA) untuk simpan.
- Client wrappers baru di `apps/web/lib/api/client.ts`: `getScanSettings`, `updateScanSettings`, `listAdminReports`, `getReportDuplicates`, `decideReport`, `getAdminStats`, `listAuditEvents` (pakai `apiGet`/`apiMutate` + envelope + CSRF yang sudah ada). `apiMutate` kini juga menerima `PUT`.

### 4.10 Kontrak OpenAPI & tipe web
- Endpoint moderasi laporan **sudah ada** di kontrak (`schema.d.ts`: `listAdminReports`, `getAdminStats`, `listAuditEvents`, dll) → UI bisa langsung pakai.
- Yang **baru** hanya `GET/PUT /admin/scan-settings`: ditambahkan ke `contracts/openapi.json` beserta skema `ScanSettings` / `ScanSettingsUpdateInput`, lalu `apps/web/lib/api/schema.d.ts` diregen.
- **Keputusan pada rilis tersebut (v1.0.0):** versi kontrak tidak dinaikkan karena perubahan scan-settings bersifat *additive*. Kontrak API kini telah maju ke `1.1.0` untuk menambahkan operasi MFA dan mengubah respons login menjadi hasil terdiskriminasi; rujuk `contracts/openapi.json` untuk kontrak terkini.

## 5. Rencana Tes (status akhir)
- Unit worker (`apps/worker/test/hybrid.test.ts`): `shouldUseVision` & `resolveClassification` tiap mode, batas threshold, fallback saat LLM error/timeout, vision-disabled tetap ML. ✅
- Unit wiring worker (`apps/worker/test/scan-processor.test.ts`): eskalasi low-confidence → `llm:sapa`; kegagalan vision → sukses via ML (`llm_failed:sapa`, scan tak gagal); confident ML lewati vision. ✅
- Mapping: LLM string → `category_id`/outcome via `mapPrediction` (reuse), tak langgar FK. ✅
- API (`apps/api/test/scan-settings.test.ts`): `getScanSettings` delegasi; `updateScanSettings` tolak enable vision / `full_llm` tanpa gateway (422 `SCAN_SETTINGS_INVALID`); izinkan perubahan non-vision; izinkan vision setelah gateway ada. Role gating tetap via guard `SessionAuthGuard`+`AdminGuard`. ✅
- Migrasi (`apps/api/test/infrastructure/migrations.test.ts`): `scan_settings` masuk `EXPECTED_TABLES`. ✅
- Regresi: **worker 40 tes, api 126 tes** — semua lulus. Web: `tsc` typecheck lulus (runtime `dev:web` di-skip karena SIGBUS lokal, lihat §7). ✅

## 6. Urutan Kerja (fase) — SELESAI
1. ✅ **Config + migrasi 0007 + seed** `scan_settings`.
2. ✅ **Worker**: `VisionClient` + `ScanSettingsRepository` + logika mode (`hybrid.ts`) di `scan-processor.ts` + wiring `main.ts` (+tes).
3. ✅ **Admin API** scan-settings (controller/service/repo/DTO + audit + guard 422) (+tes).
4. ✅ **Kontrak**: tambah scan-settings ke `contracts/openapi.json`, regen `schema.d.ts` (versi rilis saat itu `1.0.0`, lihat §4.10).
5. ✅ **Web kerangka admin** (tab role-gated + client wrappers).
6. ✅ **Web panel Moderasi Laporan** (pakai API yang sudah ada).
7. ✅ **Web panel Pengaturan scan**.
8. ✅ **Verifikasi**: `npm run check` hijau (typecheck, tes, build, contracts).

## 7. Risiko & Pertanyaan Terbuka
- **Latensi LLM ~12,5s** + worker concurrency 1 → throughput turun saat banyak fallback. Mitigasi: timeout ketat; pertimbangkan naikkan concurrency nanti.
- **web dev SIGBUS** di mesin lokal → verifikasi UI lewat preview bisa rewel (saat ini jalan). Build prod/Vercel tak terpengaruh.
- **Kontrak OpenAPI**: perlu pastikan lokasi sumber kontrak & alur regen `schema.d.ts` (langkah paling menyentuh banyak berkas).
- **Biaya LLM** per fallback / per scan (mode `full_llm`).
- **Scope besar**: fase 5–7 (UI admin + moderasi) porsi terbesar; bisa dipecah per-commit.
- Terbuka: mau simpan `confidence` LLM di `predictions` (sudah) + tandai sumber di `provider_revision` (sudah direncanakan) — cukup, atau perlu kolom `source` khusus di `scans`? (default: cukup `provider_revision`). **Terjawab: cukup `provider_revision`; tak ada kolom baru.**

## 8. Status Implementasi

Semua fase (1–8) selesai 2026-09-28; `npm run check` **hijau** (typecheck config/api/worker/web · worker 40 tes · api 126 tes · build · `contracts:lint` 36 paths/40 ops · `contracts:routes` 40/40).

Berkas yang dibuat/diubah:

| Area | Berkas | Catatan |
| --- | --- | --- |
| Config | `packages/config/src/index.ts` | 5 env `SCAN_*` + `superRefine` gateway |
| Migrasi | `apps/api/migrations/0007_scan_settings.sql` | tabel singleton |
| Seed | `apps/api/src/infrastructure/seed.ts` | seed baris dari env (idempotent) |
| Worker | `apps/worker/src/hybrid.ts` | logika keputusan murni (`shouldUseVision`, `resolveClassification`) |
| Worker | `apps/worker/src/vision-client.ts` | klien OpenAI-compatible; tak pernah log key/bytes |
| Worker | `apps/worker/src/scan-settings-repository.ts` | cache TTL ~5s; gagal-baca → default |
| Worker | `apps/worker/src/scan-processor.ts`, `main.ts` | wiring + terapkan §4.4; set `provider_revision` |
| API | `apps/api/src/admin/scan-settings.service.ts` + repo + DTO + `admin.controller.ts` | `GET/PUT /admin/scan-settings`, guard 422 |
| Kontrak | `contracts/openapi.json`, `apps/web/lib/api/schema.d.ts` | additive; versi rilis saat itu `1.0.0` |
| Web | `apps/web/lib/api/client.ts` | `apiMutate` + `PUT`; 7 wrapper admin |
| Web | `apps/web/components/admin-panel.tsx` + `admin-panel.module.css` | panel Moderasi + Pengaturan scan |
| Web | `apps/web/components/dashboard.tsx` | tab admin role-gated |
| Tes | `apps/worker/test/hybrid.test.ts`, `scan-processor.test.ts`, `apps/api/test/scan-settings.test.ts`, `infrastructure/migrations.test.ts` | lihat §5 |



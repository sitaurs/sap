# DEPLOYMENT — SAP

v1.0 · Pemilik API/data/worker: backend; build frontend: frontend. Target awal satu origin HTTPS dengan reverse proxy.

## 1. Lingkungan dan provider

Default development memakai layanan managed khusus development: Neon PostgreSQL/PostGIS, Upstash Redis native TLS, Cloudflare R2 private via S3 API, managed SMTP, dan Gradio self-hosted di VPS. Emulator/container lokal opsional, bukan syarat bootstrap. Browser memakai Next.js:3000 dan rewrite `/api/v1/*` ke NestJS:3001 bila lokal.

Dev, staging dan production wajib memiliki database, queue, bucket, SMTP credential, ML credential dan application secret terpisah. Jangan mengirim email nyata dari fixture/seed.

Produksi: reverse proxy membagi `/api/v1` ke NestJS dan route lain ke Next.js; worker adalah process/container terpisah. Neon, Upstash, R2 dan SMTP berada di luar private network VPS sehingga wajib TLS, timeout, retry terbatas dan monitoring. Cookie host-only dan same-origin API harus konsisten. Rujukan [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

Status aktual ada di [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md); smoke provider tidak menggantikan integration test aplikasi.

## 2. Variabel environment kanonik

| Nama | Pemakai | Arti |
| --- | --- | --- |
| `APP_ORIGIN` | Web server/API | Origin publik penuh tanpa trailing slash |
| `API_INTERNAL_URL` | Web server/proxy | URL API server-side, bukan `NEXT_PUBLIC_*` |
| `DATABASE_URL` | API/worker | Neon pooled connection; secret; TLS |
| `DATABASE_DIRECT_URL` | Migration/admin | Neon direct connection; secret |
| `REDIS_URL` | API/worker | Upstash native TLS `rediss://`; bukan REST URL/token |
| `SESSION_SECRET` | API | Secret signing security/session |
| `CSRF_SECRET` | API | Secret signed double-submit token |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | API/worker | SMTP; credential server-only |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | API/worker | R2 private via S3 API |
| `ML_INFERENCE_URL` | Worker | Base URL Gradio, bukan raw call endpoint |
| `ML_API_NAME` | Worker | `/predict_gradio` |
| `ML_USERNAME`, `ML_PASSWORD` | Worker | HTTP Basic reverse proxy; secret |
| `ML_TIMEOUT_MS` | Worker | `90000` baseline |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Web | Style/tiles; browser key harus scoped |
| `CONTRACT_VERSION` | API/web | `1.0.0` |
| `NODE_ENV`, `LOG_LEVEL` | Server | Runtime |

Repo hanya menyediakan `.env.example` berisi placeholder. Nilai nyata disimpan di secret manager/`.env` runtime; `.env*` diabaikan kecuali `.env.example`. Dilarang menaruh password, token, connection string, deployment URL aktual, Authorization header, foto atau koordinat tepat di docs/log/CI.

Origin allowlist berasal dari `APP_ORIGIN`. R2 tetap privat; upload melalui API sehingga direct-upload CORS tidak diperlukan. Signed read URL berumur pendek.

## 3. Repository dan bootstrap

Target: [github.com/sitaurs/sap](https://github.com/sitaurs/sap), hanya berisi:

```text
apps/web
apps/api
apps/worker
packages/api-client
contracts
db
docs
```

`ecoLens`/`ecoLens_ML` adalah referensi read-only; jangan disalin, dijadikan subtree/submodule, atau di-commit. Jangan `git init` di direktori induk checkout legacy. `.gitignore` melindungi `.env*` kecuali `.env.example`, bobot model, media lokal, log, coverage, build dan cache.

Script wajib: `dev`, `build`, `lint`, `typecheck`, `db:migrate`, `db:seed`, `contracts:lint`, `contracts:types`, `contracts:fixtures`, `contracts:check`, `test`, `test:contract`, `test:e2e`. Seed admin hanya non-production; password tidak dicetak.

Urutan bootstrap:

1. Checkout bersih, runtime dan frozen lockfile.
2. Resource/secret development terpisah; startup memvalidasi env tanpa mencetak nilai.
3. Uji Neon pooled/direct dari runtime target; migration termasuk `CREATE EXTENSION IF NOT EXISTS postgis`.
4. Generate/verify contract; start API dan worker.
5. Uji BullMQ/reconnect/replay outbox pada Upstash.
6. Uji R2 upload, signed read dan cleanup.
7. Uji auth/CSRF dan email sandbox.
8. Jalankan Gradio discovery, model-aware readiness dan scan smoke.
9. Start proxy/frontend dan E2E.

Build frontend sukses tidak berarti API/worker/provider/model sehat.

## 4. Gradio self-hosted

Runtime ditemukan: Gradio 6.26, prefix `/gradio_api`, endpoint `/predict_gradio`, input `img` Image/Buffer, output `LabelData`. Basic Auth diterapkan reverse proxy. Worker memakai `@gradio/client` pada base URL dengan custom `Authorization` header, bukan native auth option atau raw call endpoint.

Baseline VPS 4 GB/2 vCPU, CPU-only, satu process dan concurrency 1 sampai benchmark selesai. Deployment wajib:

- Python 3.10 dan dependency dipin;
- materialize kedua bobot Git LFS dan verifikasi hash;
- deklarasikan `timm`/arsitektur benar;
- model path/working directory eksplisit;
- readiness gagal pada missing/unexpected checkpoint key;
- cek binary+multiclass serta known-positive/negative;
- hasilkan `providerRevision` dari source commit, checkpoint hash dan runtime version;
- restart policy, resource limit, liveness/readiness terpisah;
- tidak log Basic Auth, credential, gambar atau payload sensitif.

Root HTTP 200 hanya liveness. Detail ada di [ML_INTEGRATION.md](ML_INTEGRATION.md).

## 5. CI/CD

1. Frozen install; lint/typecheck; validate OpenAPI/fixture.
2. Generate client + git-diff gate; unit/contract test; build web/API/worker.
3. Migration database isolated; integration test PostGIS, queue dan adapter R2.
4. Deploy staging: additive migration → API → worker → web; E2E dan ML probe.
5. Production setelah acceptance; smoke auth/scan/report/map dengan data tes yang dibersihkan.

Catat image/release ID, commit kontrak dan `providerRevision`. Mixed-version rollout harus kompatibel; jangan hapus schema saat release lama masih menggunakannya.

## 6. Backup, pemulihan dan rotasi

- Neon: tetapkan retention sesuai plan dan uji restore staging.
- R2: inventaris checksum, lifecycle dan restore; objek bukan pengganti metadata DB.
- Upstash: bukan source of truth; rebuild queue dari outbox/database dan unique constraint.
- SMTP/ML: simpan runbook failover tanpa credential di repo.
- Rotasi credential Neon, Upstash, R2, SMTP, ML Basic Auth, session dan CSRF dengan overlap/revocation teruji.

Baseline target RPO 24 jam/RTO 8 jam harus dibuktikan. Restore: DB → deletion tombstones → reconcile outbox/queue/ledger → objek R2 → area snapshot → smoke → buka traffic. Restore tidak boleh menghidupkan kembali data wajib-hapus.

Rollback aplikasi hanya ke release kompatibel schema; destructive migration tidak di-rollback otomatis. Jika ML outage, scan dapat dinonaktifkan dengan feature flag dan 503 sementara, sedangkan report/map tetap berjalan.

## 7. Monitoring dan runbook

Monitor error API, p95 non-ML, Neon, queue age/reconnect Upstash, scan timeout, ML liveness/readiness/providerRevision, CPU/RAM VPS, email send/deliverability, R2 cleanup, oldest submitted report dan snapshot staleness.

Log memakai requestId/scanId/reportId tanpa token, password, Authorization, foto atau koordinat tepat. Job retry terkontrol. Redis hilang → replay outbox; DB gagal → readiness 503/tolak mutation; R2 gagal → jangan membuat media seolah selesai; ML 401/403 → configuration incident tanpa retry tak terbatas.

Rujukan: [NestJS queues/BullMQ](https://docs.nestjs.com/techniques/queues). Dokumen tidak menjanjikan SLA/biaya provider.

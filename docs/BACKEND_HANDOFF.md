# BACKEND_HANDOFF — Pekerjaan backend SAP

v1.0 · NestJS + Neon PostgreSQL/PostGIS + Upstash Redis/BullMQ + Cloudflare R2; UI/UX dan frontend dikerjakan rekan tim.

SAP adalah rebuild EcoLens dari awal. Target implementasi [github.com/sitaurs/sap](https://github.com/sitaurs/sap). `ecoLens` dan `ecoLens_ML` hanya referensi read-only; jangan disalin, dijadikan subtree/submodule, atau di-commit. Web lama boleh menjadi referensi UX, bukan fondasi API, auth, database atau domain.

## Modul dan batas

| Modul | Tanggung jawab | Keluaran frontend |
| --- | --- | --- |
| auth/users | Session, CSRF, OTP, reset, role, profil/hapus | `UserDto`, challenge, error |
| media | Validasi, ownership, R2 private via S3 API, expiry | `MediaDto`, signed URL owner/admin |
| scans/ml | Job, adapter Gradio configurable, normalization, completion | `ScanDto` tanpa payload provider mentah |
| reports | Create/edit/read mine, revision, validation | `ReportDto`, timeline |
| moderation | Transition, duplicate, resolution, public redaction | Keputusan atomik, receipt status |
| areas | PostGIS filter, H3, rule version, cache | GeoJSON cells, area detail |
| gamification | Ledger/cap/dedup/streak/badge/ranking | Statistik konsisten |
| operations | Outbox, cleanup, deletion, health/audit | Admin/health dan monitoring |

## Pola wajib

Controller: parse/validate → guard session/role/owner → domain service → repository/transaction → serializer. Tolak unknown field sensitif; gunakan update allowlist. Service DB tidak menerima role/`userId` arbitrer dari client. Inaccessible 404; unauthenticated 401; wrong role 403; revision 409; semantic 422.

Frontend bukan security boundary. Poin, status, role, ownership, kategori ML, H3 dan moderasi dihitung/divalidasi server. Jangan menyediakan server action legacy sebagai jalur mutation domain.

## Transaksi penting

1. Scan completed + ledger + stats + badge event tepat sekali.
2. Report created + media link + idempotency record.
3. Admin decision + event + duplicate target + reversal/award + outbox + audit.
4. OTP consume + verify/password update + session revocation.
5. Delete request + lock akun + enqueue cleanup.

Atomic outbox mencegah SQL berhasil tetapi queue hilang. Redis lock bukan source of truth; unique constraint/idempotency DB melindungi retry. Upstash dapat dibangun ulang dari outbox/database.

## ML dan media

Worker memakai `ML_INFERENCE_URL` base URL dan `ML_API_NAME=/predict_gradio`. Runtime: Gradio 6.26, prefix `/gradio_api`, input `img` Image/Buffer, output `LabelData`. HTTP Basic berada di reverse proxy; `@gradio/client` mengirim custom `Authorization` header, bukan native auth option. Jangan rakit `/gradio_api/call/...` atau fallback `/run/predict`.

Worker wajib:

- membaca byte media tervalidasi dari R2, bukan URL user;
- menjaga credential server-only dan tidak log Authorization;
- memvalidasi `LabelData`, taxonomy, finite score `[0,1]`, top-k dan menolak `error`;
- 401/403 = configuration failure tanpa retry berulang;
- membedakan timeout, unavailable, invalid, unknown dan no_waste;
- menyimpan `providerRevision`, latency dan attempt tanpa raw secret;
- memeriksa scan belum terminal/dihapus sebelum completion;
- baseline concurrency 1 pada VPS 4 GB/2 vCPU hingga benchmark selesai.

ML readiness memeriksa binary+multiclass, checkpoint, known-positive/negative, dependency pinning serta risiko `timm`, `strict=False`, relative path dan LFS pointer. HTTP 200 saja tidak cukup. Lihat [ML_INTEGRATION.md](ML_INTEGRATION.md) dan [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md).

Media disimpan privat di R2 via S3 API. API melakukan sniff/decode/re-encode, strip EXIF, checksum dan ownership sebelum record valid. Baca memakai signed URL singkat; tidak ada public bucket/remote URL arbitrer.

## Anti-mismatch API

Implementasikan operationId/schema `contracts/openapi.json`. Swagger export wajib diff dengan kontrak termasuk enum, required/null, 202 dan envelope. Serializer menghapus password hash, owner internal, exact location dan PII dari respons publik. Uji kontrak pada HTTP instance. Error provider diterjemahkan ke status SAP; raw response tidak dikirim ke frontend.

Perubahan field/status/header memerlukan perubahan kontrak+fixture dahulu. Jangan menyediakan compatibility `/api/predict` legacy.

## Urutan backend

1. Bootstrap workspace dan validasi env tanpa mencetak nilai.
2. Schema/migration, session dan CSRF.
3. Media/R2.
4. Gradio discovery/readiness dan scan worker.
5. Stats/ledger/badge.
6. Report lifecycle.
7. Dedup PostGIS dan H3 aggregate.
8. Admin/audit.
9. Deletion/cleanup.
10. Deployment, observability dan recovery drill.

Frontend menerima fixture dulu dan endpoint staging bertahap. Fitur belum selesai tidak mengembalikan sukses palsu. Development default memakai managed services; emulator lokal opsional; tiap environment memakai resource/credential terpisah.

## Deliverable frontend

Base URL staging; version/commit kontrak; generated client; akun dev via kanal aman; fixture semua state; endpoint ready; cara CSRF; contoh error; batas field publik. Credential SMTP, Neon, Upstash, R2, ML dan application secret tidak masuk browser, docs atau chat.

## Readiness awal

Layanan telah diuji pada tingkat berbeda; path aplikasi penuh masih sebagian pending. Neon SQL Editor/PostGIS berhasil tetapi pooled/direct dari runtime VPS masih perlu dibuktikan. SMTP TLS/auth belum membuktikan deliverability. ML discovery/inferensi dasar belum menggantikan matriks kelas, degraded-model test dan benchmark. Gunakan [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md) sebagai status resmi.

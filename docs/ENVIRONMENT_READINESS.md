# ENVIRONMENT_READINESS — Kesiapan layanan eksternal

Status per 25 September 2026. Dokumen ini hanya mencatat kemampuan yang diuji dan nama variabel environment. Dokumen tidak boleh memuat password, token, access key, connection string, hostname, URL deployment aktual, atau header autentikasi.

## Aturan rahasia

- Nilai nyata disimpan pada secret manager atau `.env` lokal/runtime.
- `.env` tidak pernah di-commit. Repository hanya boleh menyediakan `.env.example` berisi nama variabel dan placeholder aman.
- Secret tidak dikirim melalui chat, fixture, dokumentasi, log, browser bundle, atau output CI.
- Environment development, staging, dan production harus memakai resource serta credential terpisah.

## Matriks readiness

| Layanan | Status | Sudah diverifikasi | Masih pending | Variabel environment |
| --- | --- | --- | --- | --- |
| Neon PostgreSQL/PostGIS | Partial — konektivitas runtime verified | PostgreSQL `18.6`; PostGIS `3.6.4`; `ST_DWithin` berhasil; pooled dan direct URL berhasil dari runtime pengembangan. Jaringan ini harus memaksa IPv4 karena DNS juga memberi IPv6 sementara host tidak memiliki rute IPv6 | Transaksi, migration aplikasi, dan verifikasi ulang dari VPS deployment | `DATABASE_URL`, `DATABASE_DIRECT_URL` |
| Upstash Redis | Partial — provider primitive verified | Native Redis TLS; `PING`, set, get, dan delete berhasil | Pastikan nilai runtime aktual selalu memakai skema `rediss://`; uji BullMQ end-to-end, reconnect, dan recovery worker | `REDIS_URL` |
| Cloudflare R2 | Partial — provider primitive verified | Bucket privat dapat diakses; upload, metadata/head, dan delete objek berhasil; akses publik tidak diperlukan | Presigned GET berdurasi pendek, lifecycle/retention, restore, dan alur media aplikasi end-to-end | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| SMTP | Partial | Koneksi TLS dan autentikasi berhasil tanpa mengekspos credential | Pengiriman email nyata, deliverability, SPF/DKIM/DMARC, bounce, dan rate limit | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` |
| Gradio self-hosted | Partial | HTTP Basic Auth, API discovery/`view_api`, upload, named endpoint, dan inferensi dasar berhasil | Satu fixture untuk masing-masing 10 kelas; unknown/no-waste; malformed/degraded response; kedua model loaded; timeout; concurrency; latency cold/warm; restart saat job aktif | `ML_INFERENCE_URL`, `ML_API_NAME`, `ML_USERNAME`, `ML_PASSWORD`, `ML_TIMEOUT_MS` |

## Konfigurasi aplikasi terkait

Nama berikut diperlukan oleh aplikasi tetapi nilainya tidak dicatat di dokumen:

```text
APP_ORIGIN
API_INTERNAL_URL
SESSION_SECRET
CSRF_SECRET
CONTRACT_VERSION
NODE_ENV
LOG_LEVEL
```

`CONTRACT_VERSION` untuk rilis ini adalah `1.0.0`.

## Kriteria siap implementasi

- Neon cukup siap untuk penyusunan schema, tetapi deployment API/worker belum boleh dinyatakan siap sampai koneksi dari VPS menggunakan kedua URL diuji.
- Upstash harus menggunakan TLS native (`rediss://`) karena BullMQ tidak memakai REST API sebagai transport queue.
- R2 tetap privat; backend menangani upload dan menerbitkan signed read URL sementara sesuai aturan media.
- Keberhasilan autentikasi SMTP belum membuktikan email diterima pengguna.
- HTTP 200 Gradio bukan bukti model sehat. Readiness ML harus memeriksa model binary dan multiclass serta probe positif/negatif.
- Tidak ada status dalam dokumen ini yang mengizinkan secret masuk repository atau frontend bundle.

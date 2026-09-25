# SOURCE_AUDIT — Dasar rebuild SAP

Pemeriksaan awal dilakukan pada 24 September 2026 dan dimatangkan pada 25 September 2026. Source web berada pada commit `191de5678f3ac1f84ca82d4b8ff848d3bd6f40b8`; source ML berada pada commit `3d41e0d13f1199eb34d2cd803914db49f6458904`.

SAP adalah rebuild dari awal. Checkout lokal `/sap/ecoLens` dan `/sap/ecoLens_ML` hanya referensi read-only dan tidak boleh disalin, dijadikan submodule/subtree, atau di-commit ke target [github.com/sitaurs/sap](https://github.com/sitaurs/sap). Repository target hanya berisi monorepo SAP baru: `apps/web`, `apps/api`, `apps/worker`, `packages/api-client`, `contracts`, `db`, dan `docs`.

Kedua source berhasil di-clone, tetapi ketiga file `.pth` lokal masih berupa pointer Git LFS berukuran 133 byte; bobot aktual belum materialized di checkout lokal. Runtime Gradio self-hosted yang terpisah telah melewati smoke test Basic Auth, discovery API, upload, dan inferensi dasar. Keberhasilan runtime tersebut tidak membuktikan bahwa artefak runtime identik dengan pointer pada checkout lokal.

| Temuan | Bukti kode | Keputusan SAP |
| --- | --- | --- |
| Scan kamera/unggah dan hasil | `src/app/dashboard/page.tsx`, `src/app/api/predict/route.ts` | Jadikan alur UX sebagai referensi; bangun ulang frontend dan adapter backend |
| Auth/OTP/reset | `src/app/api/auth/*` | Pertahankan kebutuhan produk, tetapi bangun ulang memakai sesi opaque dan CSRF SAP |
| Statistik/poin/streak | `src/app/api/user/stats/route.ts`, predict route | Implementasikan ulang dengan ledger/transaksi |
| Achievements/leaderboard | `src/app/dashboard/achievements`, `leaderboard`, lib achievements | Pertahankan fungsi dan perjelas aturan |
| MongoDB di web sumber | `src/Modal/user.ts`, `scan.ts`, `src/lib/mongo.ts` | SAP memilih Postgres/PostGIS karena fitur geospasial; tidak ada migrasi data lama |
| Laporan lokasi/peta/admin laporan | Tidak ditemukan pada route, model, navigasi dan pencarian source yang diperiksa | Pengembangan baru SAP pada snapshot ini |
| Model binary dan multi-class | `ecoLens_ML/utils/predict.py` | Gunakan model EcoLens melalui Gradio self-hosted, tanpa training; source HF tetap provenance |

## Batas penggunaan source legacy

Yang boleh dijadikan referensi konseptual:

- alur kamera/unggah, preview, loading, hasil, dan empty/error state;
- ide layout dashboard, statistik kategori, achievement, dan leaderboard;
- normalisasi email, OTP sekali pakai, serta pesan kredensial generik sebagai niat UX;
- preprocessing gambar, taxonomy 10 kelas, threshold, dan top-k model ML.

Yang harus ditolak sebagai fondasi SAP:

- monolit Next.js API, MongoDB/Mongoose, serta model data legacy;
- JWT access/refresh cookie lama dan guard frontend sebagai batas keamanan;
- endpoint legacy `/api/predict` atau `/run/predict`;
- payload gambar base64, validasi media hanya di browser, dan respons provider langsung ke frontend;
- poin berdasarkan confidence, mutable `ecoScore`, dan aturan achievement legacy;
- klaim dampak CO2, air, atau energi berbasis multiplier scan tanpa metodologi;
- tipe API lama, kalkulasi domain di client, dan server action sebagai jalur mutation domain.

## Temuan utama web legacy

- Web adalah monolit Next.js App Router dengan route API dan MongoDB/Mongoose; tidak ada worker, queue, outbox, object storage privat, atau kontrak API yang dihasilkan dari OpenAPI.
- Fitur laporan, hotspot/peta berbasis insiden, media service, dan moderasi admin tidak ditemukan sehingga merupakan pengembangan baru SAP.
- Scan mengirim gambar sebagai base64 JSON dan memanggil endpoint ML yang di-hardcode secara sinkron, tanpa timeout/retry/circuit breaker yang memadai.
- Terdapat dua algoritme poin yang saling bertentangan; tidak ada ledger append-only, idempotency key, dedup, atau kuota harian.
- UI memanggil resend OTP yang route-nya tidak ditemukan; logout frontend/backend tidak konsisten; reset/session revocation dan CSRF tidak memenuhi kontrak SAP.
- Tidak ditemukan automated test, sedangkan konfigurasi build mengabaikan error TypeScript dan ESLint.

## Temuan utama source dan runtime ML

- Runtime produksi yang dipilih adalah layanan Gradio self-hosted, bukan Hugging Face sebagai provider. Source EcoLens/Hugging Face tetap menjadi provenance model.
- Named API runtime telah ditemukan sebagai `/predict_gradio`; autentikasi aktual memakai HTTP Basic Auth pada reverse proxy. Backend harus memakai Gradio client terhadap base URL configurable, bukan merakit endpoint job protocol secara manual.
- Model menjalankan tahap binary MobileNetV3 lalu klasifikasi EfficientNet-B0 untuk 10 kategori. Threshold sumber adalah `0.4` untuk binary dan `0.53` untuk multiclass, dengan top-3.
- `requirements.txt` tidak mencantumkan `timm`, dependency tidak dipin, path model relatif terhadap current working directory, dan loader memakai `strict=False` tanpa menjadikan missing/unexpected key sebagai kegagalan readiness.
- Bila model multiclass gagal dimuat, source dapat mengubah gambar waste menjadi `no_waste`. Readiness wajib memeriksa kedua model dan known-positive/known-negative; HTTP 200 pada UI Gradio saja tidak cukup.
- Uji matriks 10 kelas, malformed/degraded response, timeout, concurrency, dan latency cold/warm belum selesai.

## Catatan integrasi yang perlu diuji

- Web sumber memanggil `/run/predict`; endpoint ini usang dan tidak boleh dijadikan fallback. Runtime aktual memakai named endpoint `/predict_gradio`, yang tetap harus dikonfigurasi melalui environment.
- Label source EcoLens `biological` tidak cocok dengan mapping lama yang mencari organic/food/fruit. SAP menggunakan taxonomy model utuh untuk menghindari hilangnya kategori.
- Wrapper ML legacy dapat mengembalikan no_waste ketika model multi gagal dimuat. SAP harus menjalankan probe fixture kategori sebelum menganggap layanan sehat; respons tunggal itu tidak cukup membedakan kondisi model rusak.
- Loader source ML memakai `strict=False`. Kompatibilitas checkpoint harus dibuktikan melalui readiness model-aware dan identitas artefak; SAP tidak mengubah bobot/model sebagai bagian pekerjaan web.
- Angka dampak pada dashboard sumber berasal dari asumsi per scan; pada SAP utamakan metrik aktivitas. Pelestarian angka fisik memerlukan metode dan bukti terpisah.

## Rujukan snapshot

[Repo web](https://github.com/wahb-amir/ecoLens/tree/191de5678f3ac1f84ca82d4b8ff848d3bd6f40b8) · [Proxy prediksi web](https://github.com/wahb-amir/ecoLens/blob/191de5678f3ac1f84ca82d4b8ff848d3bd6f40b8/src/app/api/predict/route.ts) · [Source/provenance ML](https://huggingface.co/spaces/wahb-amir/ecoLens/tree/3d41e0d13f1199eb34d2cd803914db49f6458904) · [Prediksi ML](https://huggingface.co/spaces/wahb-amir/ecoLens/blob/3d41e0d13f1199eb34d2cd803914db49f6458904/utils/predict.py).

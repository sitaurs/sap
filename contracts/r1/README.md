# Kontrak backend R1 — draf untuk Zaka dan Zamani

**Target: 1.2.0. Published dan header runtime tetap 1.1.0.** File di folder ini belum menggantikan kontrak published. Backend tambahan mempunyai deklarasi handler; database, worker, provider dan perilaku runtime belum diverifikasi. Flag fitur memakai default nonaktif.

## Berkas

| Berkas | Kegunaan |
| --- | --- |
| `openapi.json` | Salinan baseline 1.1.0 ditambah schema request/response, enum, query, izin, IM/IK/CSRF dan 79 operasi R1 |
| `fixtures.json` | Contoh DTO dan skenario **sintetis** untuk pengembangan; bukan laporan, akun, foto atau post nyata |
| `readiness.json` | Inventaris handler, status draf/tidak terverifikasi, default flag, serta syarat promosi kontrak |

Acuan perilaku tetap [kontrak Zaka–Zamani](../../docs/CONTRACT_ZAKA_ZAMANI.md) dan [rencana backend](../../docs/BACKEND_EXECUTION_PLAN.md). Schema JSON menutup field asing pada DTO tetap; map memiliki tipe nilai yang eksplisit. Pemeriksaan lintas field, hubungan bukti, hak akses, revision dan lifecycle dicatat dalam `x-domain-rules` dan kontrak MD.

## Untuk Zaka

1. Gunakan nama field dan enum draf ini untuk adapter fitur baru. Semua data sukses JSON memakai `{ data, meta: { requestId } }`; OAuth callback dan URL poster provider memakai redirect 302.
2. Bedakan permintaan accepted HTTP 202, operasi queued/running dan penyelesaian confirmed. Publish/retract mengembalikan `PublicationOperation`, bukan `InstagramPost`.
3. Muat permission/capability dari backend. Fitur nonaktif mengembalikan 503 `FEATURE_UNAVAILABLE`; jangan menggantikan error API dengan fixture atau menganggap timer sebagai sukses.
4. Pakai mock hanya dalam mode pengembangan yang jelas diberi label sintetis. Jangan menyalin contoh UUID/signed URL ke alur produksi.
5. Koordinasikan promosi schema, header dan generated client dengan Zamani. Jangan mengganti generated client existing 1.1.0 hanya karena draf ini tersedia.

Tambahan operasi yang semula dijelaskan dalam prosa kini eksplisit: penerimaan koordinator, acknowledgement jadwal dan akses bukti pengukuran oleh pihak berwenang. `/publication-assets/{id}` adalah URL poster bertanda tangan untuk Meta; browser pengguna tidak memakainya sebagai endpoint foto asli.

## Regenerasi

Jalankan `node scripts/generate-r1-contract.mjs` dari root repo. Generator membaca DTO TypeScript dalam kontrak MD, menambah request yang dijelaskan dalam tabel/prosa, dan mencatat deklarasi controller di source. Perintah ini menulis tiga artefak di folder ini; tidak menjalankan test, server, migration atau panggilan provider. Perubahan MD atau controller perlu diregenerasi bersama.

## Sebelum menjadi published

- Review kecocokan schema dengan validator, serializer dan seluruh hubungan domain.
- Lakukan verifikasi runtime/kontrak yang diotorisasi, rehearsal migration dan recovery worker.
- Buktikan kesiapan konfigurasi Hermes/Meta/consent, rendition dan penarikan provider pada lingkungan pilot.
- Sinkronkan generated frontend types/adapters, fixtures pengembangan dan header kontrak.
- Promosikan `contracts/openapi.json` dan runtime version secara terkoordinasi setelah syarat terpenuhi.

Tidak ada hasil test atau kesiapan provider yang diklaim oleh artefak ini. `readiness.json` mencatat keberadaan handler pada source, bukan bukti layanan sudah diaktifkan.

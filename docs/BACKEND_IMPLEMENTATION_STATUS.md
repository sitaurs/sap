# Status implementasi backend Zamani — R1

3 Oktober 2026. Acuan: [kontrak bersama](CONTRACT_ZAKA_ZAMANI.md), [rencana eksekusi](BACKEND_EXECUTION_PLAN.md), [poster Instagram](INSTAGRAM_POST_DESIGN.md).

## Kode yang tersedia

| Bagian | Implementasi |
| --- | --- |
| Fondasi | Migration 0011–0016, transaksi idempotent, revisi, audit, guard, upload pending sebelum penyimpanan objek |
| Kejadian/komunitas | Public projection/timeline, support/follow, update bukti dan keputusan moderator, lifecycle/claim resolusi |
| Review Hermes | Snapshot privat, dedup intent otomatis, hasil tervalidasi, biaya/timeout, service Python terisolasi, fallback antrean manusia |
| Relawan/dampak | Kegiatan, acceptance koordinator, membership/slot/ack jadwal/attendance, hasil/measurement, koreksi, agregat dan notifikasi |
| Bukti | Consent pemilik per kanal, rendition/redaksi, approval, private URL sesuai relasi |
| Instagram | OAuth terikat sesi, token terenkripsi, draf/preview/approval, intent publish/retract/disconnect, status needs_action saat hasil tidak pasti |
| Poster | Template referensi v2, foto bukti approved, peta jalan/sungai/geografi OSM nyata, area H3 publik, snapshot/version/metadata dan atribusi |
| Worker | Antrean review/render/publish/retract/domain terpisah, lease, business acknowledgement, rekonstruksi intent dari SQL, log metrik antrean/operasi berkala dan pemakaian Hermes tervalidasi |
| Cleanup | Penghapusan akun dan objek, inventory poster, tugas cleanup berjejak, anonimisasi statistik, perlindungan bukti aktif |
| Handoff Zaka | [OpenAPI/fixture/readiness draft](../contracts/r1/README.md), generator dari kontrak MD dan source handler |

“Kode tersedia” bukan bukti integrasi produksi berhasil. Checklist acceptance pada rencana eksekusi tetap menjadi gate rilis; tidak dicentang hanya karena kompilasi berhasil.

## Pemeriksaan dan batas hasil

`npm run check` berhasil: typecheck config/API/worker/web; kontrak baseline 43 path, 48 operasi, 45 fixture; 217 test lolos; build API/worker; serta 127 route cocok dengan 127 operasi draft R1 sementara kontrak published tetap 1.1.0. `git diff --check` juga berhasil. Draft R1 berisi 79 operasi tambahan dan 95 contoh DTO sintetis. Test yang tertinggal diselaraskan dengan tabel migration dan cleanup baru.

Static review mencakup transaksi, akses bukti per tahap, consent, source revision, lease/recovery, serta approval. Worker kini menyimpan token dan estimasi biaya Hermes yang lolos validasi, lalu mencatat agregat antrean moderasi, backlog/error/latency/biaya, dan ketidakpastian operasi tanpa identitas pengguna atau isi laporan. Migration belum diterapkan ke database; Hermes, Overpass, dan Meta belum dipanggil untuk pemeriksaan integrasi. Poster mengikuti acuan komposisi, memakai foto rendition yang disetujui dan geometri OSM nyata; preview visual dengan foto laporan SAP nyata belum dibuat karena media berizin dan endpoint peta produksi belum tersedia di tugas ini.

Semua flag extension, renderer, publisher, dan delete default false. Published OpenAPI/header/frontend existing tetap 1.1.0; kontrak target 1.2.0 hanya draft. Jangan mengaktifkan rilis R1 sebelum handoff frontend, migration, dan readiness/provider selesai.

## Persiapan operator

1. Database PostgreSQL/PostGIS, Redis, dan private object storage memakai konfigurasi server. Backup dan terapkan bundle migration 0011–0016 dengan mekanisme migrator repo; jangan mengubah checksum migration lama.
2. Hermes: ikuti [runbook service](../services/hermes-review/README.md), checkout pin, credential provider, model vision, volume intent persisten, batas harga/biaya yang sesuai, serta jaringan privat. Secret transport sama pada service dan worker.
3. Peta: isi `POSTER_OVERPASS_URL` endpoint HTTPS dengan kapasitas yang disiapkan operator, batas request harian dan cache. Folder `apps/worker/assets/fonts` harus ikut deploy worker.
4. Instagram: akun professional + Page, Meta App/Facebook Login config, scope/token yang sesuai per operasi, domain callback dan delivery HTTPS, kunci enkripsi credential 32 byte, serta admin/moderator. Graph version diisi eksplisit; jangan menaruh secret di frontend atau git.
5. Siapkan contoh laporan nyata dengan foto milik/izin pelapor, moderator, dan koordinator untuk pilot. Preview harus diperiksa sebelum publish; penarikan harus terbukti dengan akun SAP sebelum kemampuan delete diaktifkan.
6. Sepakati retensi dan kapasitas operasi. Kirim log `sap_extension_metrics` (setiap 60 detik) ke penyimpanan log terpantau dan pasang alert ambang antrean/lease/failed/needs_action/biaya; log metrik mulai tersedia setelah migration R1 diterapkan. Cost Hermes adalah estimasi layanan, bukan tagihan provider. Pastikan backup restore dan cleanup dipantau. Konfigurasi terisi belum membuktikan readiness.

## Promosi kontrak

Zaka mengubah validator/adapter/frontend berdasarkan draft bersama. Pemeriksaan integrasi dan negative case pada rencana eksekusi harus dilakukan sebelum target 1.2.0 dipromosikan ke published schema/header. Perubahan berikutnya yang diminta push tetap menuju main.

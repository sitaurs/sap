# Handoff frontend R1 — 5 Oktober 2026

## Status dan acuan

**Perubahan scope 6 Oktober 2026:** pemilik meminta **Aktivitas warga** dihapus. Menu desktop/mobile dan halaman dashboard terkait sudah dihapus; URL lama membuka Dashboard. Daftar Kabar saya, Kejadian diikuti, Kontribusi saya, Kegiatan saya, dan Tugas koordinator dalam halaman tersebut bukan lagi deliverable frontend. Detail kejadian publik, dukung/follow, form kondisi dari kejadian, jelajah/detail kegiatan, dan halaman koordinator langsung tetap tersedia. API/database backend tidak dihapus.

**Sinkronisasi `bb29e10`:** menu **Relawan** (`view=activities`) dan widget pendaftaran/penugasan dari commit teman tetap tersedia sebagai layar terpisah. Tipe R1 mengikuti kontrak terbaru, termasuk flag lifecycle `resolutionReviewRequired`. Review komunitas milik commit teman tidak dimasukkan kembali ke menu; bookmark `admin-community` dipetakan ke Moderasi laporan. Ini tidak mengembalikan halaman Aktivitas warga yang telah dihapus.

**Perubahan scope 5 Oktober 2026:** pemilik meminta **Antrean review** dihapus. Menu desktop/mobile, halaman, dan adapter frontend khusus antrean sudah dihapus. URL lama membuka Moderasi laporan. FE-09 untuk layar antrean khusus tidak lagi termasuk deliverable frontend; endpoint/aturan review backend tetap menjadi acuan backend. Tidak ada klaim bahwa alur review warga tersebut telah dipindahkan ke moderasi existing.

Scope aktif frontend mengacu FE-01–FE-08, FE-10–FE-11 dan FE-13–FE-14 pada `docs/CONTRACT_ZAKA_ZAMANI.md`, dengan pengecualian daftar Aktivitas warga di atas, memakai DTO generated `apps/web/lib/api/r1-schema.d.ts` dan handler yang ada di repo. Auth, laporan, peta, moderasi laporan, admin kegiatan, Dampak, dan navigasi mobile dipakai kembali. FE-09 layar antrean khusus dikeluarkan atas permintaan pemilik. FE-12 Dampak tidak dibangun ulang.

**Belum merupakan acceptance integrasi R1 nyata.** Pengguna mengonfirmasi bahwa lingkungan Zamani belum siap. `contracts/r1/readiness.json` masih menyatakan draft 1.2.0, published/runtime header 1.1.0, migration/runtime/provider belum diverifikasi, dan flag default off. Tidak ada perubahan schema kontrak, handler backend, migration, secret, flag rilis, atau credential Meta dalam pekerjaan ini.

## Cakupan frontend

| FE | Implementasi dan lokasi | Batas verifikasi |
| --- | --- | --- |
| 01–02 | `/incidents/[id]`: ringkasan, status, tanggal WIB, foto rendition yang disetujui, timeline bertahap, canonical redirect, empty/error/410. Peta existing mendapatkan tautan kejadian pada area terpilih. | Proyeksi publik perlu diuji terhadap data backend nyata; tidak ada fallback detail owner. |
| 03–04 | Dukung/batal dukung dan follow/unfollow tetap terpisah pada detail kejadian. Daftar kejadian diikuti dan kabar/read/unread pada Aktivitas warga dihapus 6 Oktober. | Kuota/otorisasi, merge, dan konsistensi setelah timeout perlu live acceptance; daftar/notifikasi pribadi di luar scope UI aktif. |
| 05–06 | Pembaruan kondisi dari detail kejadian tetap tersedia: upload 0–3 foto, consent, waktu UTC, input/error/draf sesi. Daftar Kontribusi saya dan akses pelengkapan dari daftar tersebut dihapus 6 Oktober. | Pelengkapan dari kontribusi milik pengguna tidak lagi tersedia sebagai layar aktif. File lokal dipertahankan selama form hidup; teks, ID media, revisi dasar, dan consent disimpan di sessionStorage. |
| 07 | `/activities` dan `/activities/[id]`: jelajah, kuota server, detail, permintaan ikut, batal dengan konfirmasi, acknowledgement jadwal. Daftar Kegiatan saya dihapus 6 Oktober. | Requested tidak dianggap accepted. Quota race dan jadwal multiuser menunggu backend nyata. |
| 08 | `/activities/[id]/manage`: terima/tolak penugasan dengan consent nama, peserta/kehadiran, jadwal/informasi, command, pengiriman/pelengkapan hasil. Komponen peserta/hasil existing memakai gateway coordinator asli. | ID hasil privat perlu diketahui untuk membuka hasil existing; lihat blocker B-03. |
| 09 | Layar **Antrean review** dihapus atas permintaan pemilik, 5 Oktober 2026. URL lama membuka Moderasi laporan. | Alur review warga khusus dikeluarkan dari scope frontend; backend/kontrak tidak dihapus dan bukan klaim integrasi alur tersebut ke moderasi existing. |
| 10–11 | Publikasi Instagram existing memakai DTO R1: delapan status, reports termasuk tanpa scan, final rendered preview, alt text, approval, publish/retract 202 operation, cancel, operasi persisten, retry eksplisit, manual confirmation, koneksi/disconnect, capability reasons, settings, riwayat sumber dengan pagination. | Meta/render/storage/worker/token/reconciliation belum diverifikasi; tidak ada posting nyata dalam tes. |
| 12 | Halaman Dampak existing tetap dipakai. | Agregat API nyata dan deduplikasi pengukuran tetap membutuhkan acceptance backend. |
| 13–14 | Loading/empty/error/forbidden/expired/feature off, focus/touch targets, grid mobile; If-Match, input konflik dipertahankan, versi baru ditampilkan lalu dikonfirmasi. | E2E browser memakai jaringan sintetis terisolasi; pengujian assistive technology oleh pengguna tetap diperlukan. |

## Navigasi dan penggunaan komponen

- Desktop tidak lagi menampilkan **Aktivitas warga** dan **Antrean review**, sesuai permintaan pemilik. URL lama Aktivitas warga membuka Dashboard.
- Mobile memakai lima menu bawah existing. Akun menampilkan Riwayat scan dan Pencapaian pada Aktivitas saya; Pusat admin mempunyai lima menu setelah penghapusan Antrean review. SAPA dan kerangka navigasi tidak dibangun ulang.
- Route publik menggunakan `BrandLogo` existing, warna navy/green, kartu putih, jarak 20–28 px, dan satu kolom pada layar kecil. Foto publik selalu berasal dari response API.
- `ActivityMembers`, `ActivityResultForm`, dan `PublicVersion` menerima gateway opsional. Default mempertahankan adapter admin existing; gateway coordinator/review memakai `r1Get/r1Mutate` langsung dan tidak masuk mock kegiatan.
- Form hasil coordinator menawarkan consent per kanal untuk foto baru milik pengunggah. Consent foto existing tidak direset ke kosong secara diam-diam. Bukti timbangan tetap privat.
- Layar baru tidak memiliki mockup original tersendiri yang disetujui. Capture browser digunakan untuk meninjau ruang, keterbacaan, dan overflow; bukan klaim kesamaan piksel dengan mockup yang berbeda konteks.

## Mapping API

Semua path di bawah relatif ke `/api/v1`. Envelope existing `{ data, meta }`, cookie/CSRF existing, dan error `{ error, meta }` tetap digunakan.

| Adapter / alur | Endpoint |
| --- | --- |
| Public incident | GET `/public/incidents/{id}`, `/timeline`, `/viewer`; PUT `/support` `{supported}`, `/follow` `{following}` |
| Pemilik kontribusi | GET `/users/me/community-updates`, `/community-updates/{id}`; POST `/public/incidents/{id}/updates` + IK; PATCH `/community-updates/{id}` + IM |
| Upload/consent | POST `/media` multipart file/purpose; GET/PUT `/media/{id}/consents`, PUT + IM dan `{channels}` |
| Kabar/follow | GET `/users/me/notifications`, `/users/me/followed-incidents`; PUT `/users/me/notifications/{id}/read` `{read}` |
| Public activity | GET `/activities`, `/activities/{id}`, `/viewer`, `/public-results`; PUT `/membership` `{participating}`, `/schedule-acknowledgement` `{scheduleRevision,confirmed}` |
| Coordinator | GET `/users/me/coordinator-assignments`, `/activities/{id}/manage`, `/memberships`; PUT `/coordinator-acceptance` + IM; PATCH membership / PUT attendance + IM; PATCH activity + IM; POST commands + IM+IK |
| Hasil coordinator | POST `/activities/{id}/results` + IK; GET/PATCH `/activities/{id}/results/{resultId}`, PATCH + IM; relation URL foto hasil/timbangan existing |
| Review | GET `/admin/review-queue`, `/admin/reviews`, `/admin/reviews/{id}`; POST `/admin/reviews` + IK; GET admin update/result; POST decisions + IM+IK |
| Rendition review | GET/POST `/admin/media/{mediaId}/renditions` dengan subjectType/subjectId; POST IM revisi **subjek** + IK; foto privat melalui URL relasi yang berizin |
| Instagram | GET `/admin/instagram`, `/posts`, `/posts/{id}`, `/preview`; POST draft + IK; PATCH caption/altText + IM; POST approve/publish/cancel/retract + IM+IK |
| Operasi Instagram | GET `/admin/instagram/operations/{id}`; POST `/retry`, `/manual-confirmation` + IK; POST `/account/disconnect` + IK; GET `/account/authorization`; PUT `/settings` + IM |
| Lifecycle/history | GET `/admin/reports/{id}/lifecycle`, `/publications`; source foto dari `/admin/instagram/reports/{reportId}/media/{mediaId}/url` |

IM = integer `If-Match`. IK = `Idempotency-Key`. Intent yang sama menggunakan key sama selama komponen hidup; perubahan payload/revisi menghasilkan intent baru. Mutasi tidak diulang otomatis setelah error. Jangan menganggap draft endpoint sebagai API yang sudah dirilis.

## Semantik penting untuk Zamani

1. Support dan follow tidak saling memanggil. Login/verifikasi hanya mengembalikan ke tujuan allowlist; tidak mengulang tindakan pengguna secara otomatis.
2. 410 pada detail/timeline/viewer menghapus konten publik yang sudah sempat dimuat. Tidak ada permintaan private-original sebagai fallback foto yang gagal/expired/forbidden.
3. Consent existing harus berhasil dimuat sebelum bisa diubah/disubmit. Consent tetap menjadi pilihan pemilik per kanal; persetujuan moderator/rendition adalah tindakan terpisah.
4. Form kondisi menyimpan kind/description/waktu/correction, revisi dasar, media ID, dan pilihan kanal dalam sessionStorage. Pemulihan selesai sebelum penyimpanan nilai awal, termasuk saat efek React diulang di development. Revisi update yang berubah ditampilkan dan harus dikonfirmasi setelah reopen. Consent yang belum berhasil dimuat tidak dianggap kosong. URL signed, File, token, kata sandi, dan data gambar tidak disimpan di draft tersebut.
5. Konflik update, keputusan review, peserta, hasil, jadwal, dan Instagram mempertahankan input. Versi backend ditampilkan; pilihan rendition lama ditinjau ulang setelah revisi subjek berubah.
6. Approval Instagram terikat contentRevision/sourceRevision/renditionId, tidak sama dengan publish. Gambar final harus ready dan URL belum expired. Publish/retract **202 mengembalikan PublicationOperation**, bukan sukses post.
7. Timeout/network reset mutasi ditampilkan sebagai hasil belum diketahui. Publish existing diblokir sampai versi/preview dibaca lagi. Replay manual mempertahankan key; tidak melakukan retry otomatis. ID operasi terakhir dibaca dari post setelah reopen.
8. Poll operasi/review berhenti setelah batas 2 menit, pause saat tab tidak terlihat, dan abort pada unmount. Hasil pending tidak dianggap gagal atau berhasil. Retry eksplisit memakai operasi yang sama. Manual retraction memerlukan 1–3 bukti purpose `resolution` dan penjelasan 20–1000.
9. `draftGeneration=automatic` hanya pembuatan draf; `publishMode=approval_required`. `publishedAt` historis dapat tetap ada setelah retracting/retracted. Delapan status dipakai pada filter dan badge; nilai tidak dikenal ditolak oleh adapter Instagram.
10. Milestone activity_result hanya menawarkan asset dengan sourceType/activity result ID yang sama. Contract report_resolution tidak mengekspose daftar allowedSources per milestone; eligibility terakhir tetap divalidasi server saat create (B-04).
11. Perubahan keikutsertaan atau acknowledgement jadwal yang gagal menonaktifkan tindakan berikutnya sampai detail/viewer dimuat ulang. Versi foto publik yang expired/gagal dimuat tidak dapat dipilih; tidak ada fallback ke foto asli privat pada layar publik.

## Blocker dan acceptance backend

| ID | Kondisi | Yang dibutuhkan |
| --- | --- | --- |
| B-01 | Lingkungan R1 belum siap menurut pengguna dan readiness masih draft. | Zamani menyediakan URL nonproduksi, migration R1, flag yang aktif, seed/akun guest-user-coordinator-admin, cookie/CSRF dan versi response yang disepakati. Jangan mengirim credential lewat chat/dokumen. |
| B-02 | Storage/rendition/Hermes/Meta dan worker belum punya bukti operasi nyata. | Uji URL expiry, redaksi/consent lintas owner, Hermes timeout/stale, render final, token/scope expiry, publish uncertain, retract saat publish berjalan, manual delete dan reconnect. |
| B-03 | `ManagedActivity` tidak memuat latestResultId dan kontrak tidak menyediakan daftar hasil privat coordinator. | Sepakati endpoint/field discovery atau notification target berisi ID hasil. Frontend menerima `/activities/{id}/manage?result={resultId}&screen=result`, memvalidasi relasi lewat API, dan mempertahankan ID setelah submit. Tidak mengarang ID dari data mock. |
| B-04 | Report-resolution milestone belum memuat eligible media/source IDs yang tepat. | Pertimbangkan projection eligible assets per milestone. Saat ini UI menampilkan approved assets/claims, server dapat menolak EVIDENCE_INVALID; error dipertahankan tanpa memilih foto lain diam-diam. |
| B-05 | Saat awal audit port 3000 memakai project preview `D:/projkwblampung`, bukan Git repo `D:/projkwblampung/sap/apps/web`; listener itu tidak aktif lagi pada pengecekan terakhir. | Verifikasi task ini memakai port 3110. Saat integrasi utama, jalankan frontend dari repo SAP yang benar; jangan mengira perubahan repo nested otomatis masuk salinan induk. |

Release gate tetap mencakup guest → login/verifikasi kembali ke tujuan; canonical/withdrawal; support/follow retry; quota race; beda role/coordinator relation; perubahan jadwal; partial/complete; null/0/deduplikasi/koreksi berat; evidence lintas owner; token/scope hilang; timeout publish dan reload operasi. Frontend build/test tidak menggantikan gate ini.

## Pengujian dan bukti

Runner: `apps/web/playwright.config.ts`, fixture: `apps/web/tests/r1-fixtures.ts`. Fixture bertipe R1 dan berlabel **DATA SINTETIS · KHUSUS TES**. Seluruh `/api/v1/**` diintersep; request yang belum difixture mendapat 404, **tidak diteruskan** ke backend nyata. Tidak ada route/demo/fallback produksi baru.

```powershell
# Terminal frontend dari repository SAP
cd D:\projkwblampung\sap
npm run dev --workspace=apps/web -- --hostname 127.0.0.1 --port 3110

# Terminal pengujian, server yang sama
$env:SAP_E2E_BASE_URL='http://127.0.0.1:3110'
$env:SAP_E2E_CHANNEL='chrome' # Chrome lokal; hapus bila memakai Chromium Playwright
npm run test:r1 --workspace=apps/web
npm run typecheck --workspace=apps/web
npm run build --workspace=apps/web
```

Hasil final dan daftar bukti dicatat pada `docs/FRONTEND_R1_VERIFICATION.md`. Capture mesin kerja ada di `D:/projkwblampung/output/verification/r1-frontend`, di luar Git. Tidak ada token/env dalam fixture atau dokumen ini.

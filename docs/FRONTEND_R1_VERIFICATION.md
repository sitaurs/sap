# Verifikasi frontend R1 — 5 Oktober 2026

**Perubahan scope 6 Oktober 2026:** Aktivitas warga dihapus atas permintaan pemilik. Empat skenario yang membuka `view=community` dikeluarkan bersama halaman tersebut; hasil browser di bawah merupakan bukti historis sebelum penghapusan. Suite tidak dijalankan ulang pada perubahan ini.

**Catatan sesudah verifikasi:** pada 5 Oktober 2026 pemilik meminta Antrean review dihapus. Halaman dan tiga skenario browser khusus antrean sudah dihapus; suite kini berisi 24 skenario × desktop/mobile. Angka 54/54 di bawah adalah hasil historis sebelum penghapusan, bukan hasil pemeriksaan ulang setelah perubahan scope. Pengujian baru belum dijalankan.

## Lingkungan dan batas bukti

Repository: `D:/projkwblampung/sap`. Frontend yang diuji: `apps/web`, Next.js 16.3.6, Chrome lokal, Playwright 1.63.0, timezone browser `Asia/Jakarta`.

Pengguna mengonfirmasi **backend R1 belum siap**. Tes browser di bawah memakai response jaringan sintetis bertipe R1. Ini membuktikan perilaku frontend terhadap response/error kontrak; belum membuktikan handler, migration, database, queue, storage, Hermes, Meta, atau publikasi Instagram nyata.

Port **3110** digunakan untuk repository ini. Saat awal audit, port 3000 menjalankan salinan preview di `D:/projkwblampung`, sehingga tidak dapat dijadikan bukti perubahan repository nested. Pada pengecekan listener terakhir hanya 3110 yang aktif. Backend tidak diaktifkan dengan flag atau migration baru pada pekerjaan ini.

## Hasil akhir

| Pemeriksaan | Hasil |
| --- | --- |
| Suite browser R1 development | **54/54 lolos**, 27 skenario × desktop/mobile, 1,4 menit. |
| Regresi draf/consent/operasi relawan | 6/6 lolos pada development, termasuk pemulihan dengan React Strict Mode. |
| TypeScript frontend | Lolos: `npm run typecheck --workspace=apps/web`. |
| Kontrak published | Lolos: 43 path, 48 operasi, 45 fixture; `npm run contracts:check`. Ini memeriksa kontrak published existing, bukan acceptance runtime draft R1. |
| Build produksi | **Lolos**, termasuk TypeScript dan pembentukan semua route baru. `next start` berhasil menjalankan hasil build pada port 3110. |
| Diff whitespace | Lolos: `git diff --check`; peringatan normalisasi LF/CRLF Git pada Windows. |
| Backend/provider R1 nyata | Blocker B-01/B-02 pada handoff, belum diuji. |

## Skenario browser

Setiap skenario dijalankan pada desktop 1600×1000 dan mobile 390×844. Skenario layout publik juga memeriksa lebar 320, 360, 430, dan 760 px.

| Kelompok | Skenario |
| --- | --- |
| Tujuan login | Reject external redirect/auth loop; guest detail → login → tujuan kejadian; verifikasi email → tujuan kegiatan. |
| Kejadian publik | Support dan follow terpisah; canonical redirect; withdrawal saat timeline dimuat menghapus konten lama; feature off tanpa sample fallback. |
| Kontribusi | Konflik mempertahankan teks, menampilkan revisi baru, memerlukan konfirmasi; upload gagal submit tidak mengunggah foto dua kali; pilihan consent dan tanggal WIB; consent GET gagal tidak menghapus izin; draf dibuka ulang mempertahankan input dan meminta tinjauan revisi baru. |
| Relawan/coordinator | Join tetap requested; timeout jaringan membatasi mutasi sampai viewer dibaca lagi; acceptance dengan consent nama dan If-Match; noncoordinator forbidden; penolakan jadwal meminta konfirmasi; keputusan peserta memakai endpoint coordinator. |
| Review/bukti | Jalur keputusan manual saat Hermes gagal; pembuatan rendition memakai revisi subjek dan IK; queued belum dapat dipilih; rendition kedaluwarsa tidak dapat disetujui. |
| Instagram | Approval terpisah dari publish; 202 queued bukan published; network reset tidak auto retry, intent key tetap; konflik caption mempertahankan input; manual retraction needs_action → queued dengan upload bukti; final preview expired tidak membuka approval; disconnect pending retractions memerlukan acknowledgement. |
| Mobile/keyboard | Public activity tanpa horizontal overflow pada ukuran yang diuji; fokus keyboard terlihat; drawer Instagram mobile tetap dapat digunakan. |

Assertion mencakup endpoint/metode/body, `If-Match`, `Idempotency-Key`, jumlah upload, state tombol, tujuan navigasi, dan konten UI. Ini lebih dari typecheck. Tes keyboard/fokus tidak menggantikan pengujian pembaca layar oleh pengguna.

## Isolasi mock dan credential

- Fixture hanya ada di `apps/web/tests/r1-fixtures.ts`; tidak diimpor oleh aplikasi atau adapter produksi.
- Seluruh `/api/v1/**` diintersep Playwright. Endpoint tanpa fixture mengembalikan `TEST_FIXTURE_UNHANDLED`, tidak diteruskan ke backend nyata.
- Browser tes menampilkan **DATA SINTETIS · KHUSUS TES**. Akun memakai domain `example.invalid`; challenge/password/CSRF pada fixture adalah nilai sintetis.
- Tes tidak login dengan akun pengguna, tidak mengirim pesan, dan tidak memposting/menghapus konten Meta nyata.
- `.env` dan `.env.local` tetap ignored. Output tes, trace, dan log disimpan di luar Git atau pada direktori ignored.
- Pemeriksaan pola credential pada 53 berkas teks yang berubah/baru tidak menemukan private key, token GitHub/AWS/OpenAI/Slack, atau nilai JWT. Ini pemeriksaan heuristik, bukan audit secret menyeluruh.

## Perintah yang dapat diulang

```powershell
# Terminal server development
cd D:\projkwblampung\sap
npm run dev --workspace=apps/web -- --hostname 127.0.0.1 --port 3110

# Terminal pemeriksaan
cd D:\projkwblampung\sap
$env:SAP_E2E_BASE_URL='http://127.0.0.1:3110'
$env:SAP_E2E_CHANNEL='chrome'
$env:SAP_E2E_OUTPUT='D:/projkwblampung/output/verification/r1-frontend/test-results'
npm run test:r1 --workspace=apps/web
npm run typecheck --workspace=apps/web
npm run contracts:check

# Sesudah pengujian, hentikan server development sebelum build
npm run build --workspace=apps/web
```

Untuk menjalankan sebagian tes di PowerShell, gunakan CLI langsung dari `apps/web` agar npm tidak menafsirkan flag `--grep`:

```powershell
node ../../node_modules/@playwright/test/cli.js test --grep 'reopened draft|uncertain membership|existing consent failure'
```

## Bukti visual lokal

Direktori bukti mesin kerja: `D:/projkwblampung/output/verification/r1-frontend`. Capture sukses dari suite tersimpan sebagai `activity-public-synthetic.png` dan `instagram-pending-synthetic.png` pada subdirektori proyek desktop/mobile di `test-results`.

Capture `feature-unavailable.png` diambil dari browser tanpa fixture dan menampilkan state layanan belum tersedia. Halaman publik diperiksa melalui agent-browser; tidak muncul page error pada pemeriksaan tersebut.

Warna, BrandLogo, komponen kegiatan/dialog, dan navigasi existing digunakan kembali. Layar warga/coordinator/review R1 tidak mempunyai target desain original tersendiri yang disetujui. Karena itu tidak diklaim telah lolos perbandingan piksel 12ui terhadap mockup yang berbeda konteks. Capture digunakan untuk mengecek keterbacaan, jarak, overflow, dan state fungsional.

## Acceptance yang masih harus dilakukan bersama backend

1. Jalankan migration/flag R1 di lingkungan nonproduksi dan cocokkan header versi kontrak. Jangan mempromosikan draft hanya karena frontend build berhasil.
2. Guest, user belum verified, user verified, coordinator relasional, dan admin: uji cookie/CSRF serta pengembalian tujuan login nyata.
3. Canonical merge/withdrawal, support/follow, notifikasi, requested evidence, consent pemilik lain, redaksi, dan URL expiry/revocation.
4. Race kuota peserta, perubahan jadwal dengan peserta lama, konflik revisi dua pengguna, dan timeout mutasi dengan reload state server.
5. Hasil partial/complete, bukti timbangan, unknown versus 0 kg, deduplikasi/koreksi, serta agregat Dampak existing.
6. Hermes stale/unavailable, final render, token/scope Meta expiry, publish uncertain → recovery operasi, retract saat publish berjalan, manual confirmation, disconnect/reconnect.
7. Sepakati discovery ID hasil privat coordinator (B-03) dan projection eligible asset milestone report_resolution (B-04).

Mapping endpoint, semantik input, dan rincian blocker ada pada [handoff frontend R1](FRONTEND_R1_HANDOFF.md); riwayat perubahan ada pada [contract.md](../contract.md).

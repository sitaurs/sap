# Implementasi frontend kegiatan relawan

Tanggal: 4 Oktober 2026. Acuan: `CONTRACT_ZAKA_ZAMANI.md`, `contracts/r1/openapi.json`, dan handler kegiatan/evidence pada repository. Ini catatan implementasi frontend untuk review Zaka–Zamani; tidak mempromosikan kontrak published 1.1.0 menjadi 1.2.0.

## Perubahan

- Menu admin **Kegiatan relawan** di dashboard, hanya ditampilkan untuk `user.role=admin`. Backend tetap memeriksa hak akses setiap request.
- Halaman daftar, ringkasan terpilih, detail, form buat/edit, pengelolaan peserta, pengiriman/perbaikan hasil, dan tinjauan hasil admin.
- Empat aset status dipisahkan di `apps/web/public/images/activities`. Foto laporan/bukti berasal dari signed URL backend sesuai relasi, tidak menggunakan foto contoh desain.
- CSS Modules: ruang antar bagian 22–28 px, form berkelompok, ukuran kontrol minimal 44–46 px. Pada layar yang lebih kecil panel samping turun ke bawah; field menjadi satu kolom pada ponsel.
- Loading, error API, data kosong, fitur belum aktif, pagination cursor, input validation, dan penanganan konflik revisi ditampilkan secara eksplisit.
- Types R1 dihasilkan terpisah sebagai `lib/api/r1-schema.d.ts`; adapter di `lib/api/activities.ts` menggunakan transport cookie/CSRF yang sudah ada. `schema.d.ts` dan header kontrak published tetap memakai baseline 1.1.0.

## Navigasi frontend

URL utama: `/dashboard?view=admin-activities`. State layar menggunakan `activityScreen`, `activity`, dan `result`.

| State                                      | Kegunaan                                   |
| ------------------------------------------ | ------------------------------------------ |
| Tidak ada `activityScreen`                 | Daftar kegiatan dan antrean hasil          |
| `create`                                   | Buat draf kegiatan                         |
| `detail`, `activity=<id>`                  | Detail dan tindakan sesuai capability API  |
| `edit`, `activity=<id>`                    | Edit kegiatan                              |
| `members`, `activity=<id>`                 | Peserta dan pencatatan kehadiran           |
| `result-new`, `activity=<id>`              | Kirim hasil                                |
| `result-edit`, `activity=<id>&result=<id>` | Perbaiki hasil                             |
| `review`, `activity=<id>&result=<id>`      | Tinjau hasil, versi publik, dan pengukuran |

Dalam mode API asli, semua request melewati proxy same-origin `/api/v1`. Tidak ada token Meta, storage, provider, atau credential database pada komponen. Mode mock development dijelaskan terpisah di bawah.

## Mode mock development di port 3000

Pemilik proyek meminta agar frontend kegiatan bisa dicoba seolah layanan sudah tersedia. Mode eksplisit ini memakai komponen yang sama, bukan halaman preview terpisah.

- Aktif hanya apabila `NODE_ENV=development` dan `NEXT_PUBLIC_SAP_ACTIVITIES_MOCK=1` pada `apps/web/.env.local`; restart/reload server development setelah mengubah flag. Production selalu memakai API asli.
- `lib/api/activities-mode.ts` memilih transport; `activities.ts` memuat `activities-mock.ts` secara dinamis hanya ketika flag aktif. Tidak mengubah `window.fetch`, proxy, atau transport global `client.ts`.
- Wrapper laporan sumber dan audit dikhususkan untuk komponen kegiatan, sehingga moderasi dan laporan pengguna tetap membaca data asli.
- Ada lima kegiatan contoh (termasuk draf), enam laporan sumber contoh, peserta, hasil sebelum/sesudah, berat contoh, dan audit. Jadwal diinisialisasi relatif pada saat data contoh pertama dibuat.
- Perubahan contoh tersimpan di key `sap:activities:mock:v1` dalam localStorage. Foto unggahan dan hasil redaksi disimpan sebagai Blob dalam database IndexedDB `sap-activities-mock-media`; tidak diunggah ke jaringan. Tombol **Reset data contoh** mengembalikan fixtures dan membersihkan media mock saja.
- Mendukung buat/edit, status kegiatan, keputusan peserta, kuota, kehadiran, hasil, permintaan bukti, persetujuan/penolakan, berat, versi foto publik, pagination, pemeriksaan revisi, serta replay idempotency pada operasi yang memakai IK.
- Tombol **Simulasikan persetujuan** tersedia hanya pada detail mock yang koordinatornya belum menerima tugas. Ini tidak menyatakan persetujuan koordinator asli.
- Pengolahan versi foto di browser menutup area redaksi dengan warna solid. Tidak menjalankan worker R1, Hermes, moderasi otomatis, pemeriksaan izin pemilik sebenarnya, atau publikasi web/Instagram. Angka berat dan bukti mock bukan data lingkungan terverifikasi.
- Aset foto contoh dipisah di `public/images/activities/mock`; berasal dari desain yang sudah disetujui. Bukti timbangan awal memakai ilustrasi status, bukan foto pengukuran asli.
- Login/otorisasi admin tetap nyata. Tidak ada perubahan session, CSRF, secret, migration, atau flag backend untuk mengaktifkan mock.

Untuk integrasi backend kembali: set `NEXT_PUBLIC_SAP_ACTIVITIES_MOCK=0`/hapus flag, restart frontend, lalu penuhi readiness R1 yang tercatat dalam dokumen ini. Data browser tidak dimigrasikan otomatis ke backend.

## Mapping API

| Fitur                                     | Operasi R1                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Daftar kegiatan                           | GET `/admin/activities?status&reportId&limit=12&cursor`                                                                            |
| Detail privat pengelola                   | GET `/activities/{id}/manage`                                                                                                      |
| Nama koordinator sesuai public projection | GET `/activities/{id}`; draft/notice tidak dipaksakan menjadi detail publik                                                        |
| Buat / edit                               | POST `/admin/activities` dengan IK; PATCH `/activities/{id}` dengan IM                                                             |
| Pilih sumber                              | GET `/admin/reports?limit=50&cursor`; hanya laporan utama, bukan duplicate                                                         |
| Kandidat koordinator                      | GET `/admin/activity-coordinator-candidates?search&limit=20&cursor`; pencarian minimal 3 karakter                                  |
| Ubah status                               | POST `/activities/{id}/commands`, IM+IK; seluruh tindakan mengikuti `actions.*.allowed`                                            |
| Peserta                                   | GET `/activities/{id}/memberships?status&limit=20&cursor`                                                                          |
| Keputusan peserta                         | PATCH `/activities/{id}/memberships/{membershipId}`, IM, alasan 5–1000 karakter                                                    |
| Kehadiran                                 | PUT `/activities/{id}/memberships/{membershipId}/attendance`, IM                                                                   |
| Antrean hasil                             | GET `/admin/review-queue?type=activity_result&limit=12&cursor`                                                                     |
| Detail hasil admin                        | GET `/admin/activity-results/{id}`                                                                                                 |
| Kirim / perbaiki hasil                    | POST `/activities/{id}/results`, IK; PATCH `/activities/{id}/results/{resultId}`, IM                                               |
| Upload bukti                              | POST `/media`, multipart, `purpose=activity_evidence`                                                                              |
| Tinjau hasil                              | POST `/admin/activity-results/{id}/decisions`, IM+IK                                                                               |
| Hasil publik disetujui                    | GET `/activities/{id}/public-results?limit=12&cursor`                                                                              |
| Berat sampah                              | POST `/admin/measurements/{id}/decisions`, IM+IK; pengukuran dari detail hasil                                                     |
| Foto sumber                               | GET `/admin/reports/{reportId}/media/{mediaId}/url`                                                                                |
| Foto hasil                                | GET `/activities/{id}/results/{resultId}/media/{mediaId}/url`                                                                      |
| Foto timbangan                            | GET `/activities/{id}/measurements/{measurementId}/media/{mediaId}/url`                                                            |
| Versi publik                              | GET/POST `/admin/media/{mediaId}/renditions`, subjectType `activity_result`, subjectId hasil; POST memakai IM revisi **hasil**, IK |
| Riwayat                                   | GET `/admin/audit?limit=50&cursor`, filter targetId lokal; diberi label catatan yang dimuat                                        |

IM adalah `If-Match` integer revision. IK adalah `Idempotency-Key`; key dipertahankan untuk payload/intent yang sama selama komponen hidup. Tidak ada retry mutasi otomatis setelah konflik.

## Semantik yang dipertahankan

1. Angka ringkasan berasal dari kegiatan yang **dimuat**, mengikuti filter server, bukan total global. Pencarian teks lokal hanya menelusuri data yang dimuat. Membership page tidak mempunyai total per status; frontend tidak mengarang total permintaan.
2. `acceptedCount` dan `availableSeats` berasal dari server. UI membatasi penerimaan sebelum start dan pada status registration_open/registration_closed; backend menentukan slot secara atomik dan memastikan sumber/akun tetap valid. Cadangan tidak otomatis dipromosikan oleh frontend.
3. Draf wajib mempunyai sumber, judul 5–150, deskripsi 20–2000. Field nullable tetap dikirim eksplisit. Sumber tidak dapat diganti setelah create. Publish berada pada detail sesudah save, mengikuti capability backend.
4. Penugasan tidak sama dengan penerimaan koordinator. Admin tidak memanggil acceptance untuk mengatasnamakan kandidat. Koordinator wajib menerima menggunakan sesi akunnya sendiri.
5. Kehadiran unknown tidak dianggap absent. Attendance hanya untuk accepted pada in_progress/awaiting_result/completed, termasuk koreksi setelah selesai.
6. Hasil membutuhkan 1–3 bukti sebelum (foto privat + public evidence yang dipertahankan) dan 1–3 foto sesudah. Pengamatan tidak boleh di masa depan dan harus sejak kegiatan mulai. Waktu selesai kegiatan tidak dipakai sebagai batas atas pengamatan.
7. Payload keputusan hasil selalu memuat keenam field: action, reason, verifiedOutcome, publicSummary, publicEvidenceApprovals, requestedEvidence. Tindakan request_evidence/reject mengirim outcome/summary null dan approvals kosong. Bukti tambahan 1–3, maksimal 300 karakter per item.
8. Hasil partial dapat menyelesaikan kegiatan tanpa menutup laporan sumber. Complete memerlukan bukti sesudah untuk web. Resolusi laporan tetap keputusan terpisah.
9. Berat pending_review tidak dianggap terverifikasi setelah approve hasil. Admin memverifikasi/menolak pengukuran secara terpisah berdasarkan foto timbangan dan alasan. Berat yang tidak tersedia tidak ditampilkan sebagai nol.
10. Foto privat tidak menjadi public evidence secara otomatis. Admin membuat rendition dengan area redaksi, kemudian memilih versi ready dan kanal web/Instagram. Worker dapat mengembalikan queued/failed; UI menawarkan muat ulang, tidak mengganti queued menjadi ready sendiri. Consent pemilik tidak tersedia dalam detail hasil; UI tidak mengklaim consent sudah diberikan dan tidak menulis consent sebagai admin. Backend memvalidasi consent pada keputusan publikasi.
11. Hermes hanya pendamping. Null/queued/running/failed/superseded tidak menghasilkan persetujuan otomatis. Rekomendasi completed boleh dipakai untuk usulan ringkasan tetapi keputusan tetap eksplisit oleh admin.
12. REVISION_CONFLICT mempertahankan input, menghentikan submit, dan menawarkan pemuatan revisi terbaru. Admin harus memeriksa intent sebelum mengirim ulang. API error tidak diganti data contoh.

## Kesiapan backend dan batas pekerjaan

Handler R1 tersedia dalam kode, tetapi dokumen backend menyatakan migration/readiness/provider belum menjadi bukti integrasi produksi. Flag extension default off. Implementasi UI ini tidak mengubah `.env`, flag, migration, role, cookie auth, consent, atau published contract.

Operasi kegiatan memerlukan `SAP_EXTENSION_ENABLED` dan `SAP_ACTIVITIES_ENABLED`. Antrean review memerlukan `SAP_COMMUNITY_ENABLED`. Berdasarkan `requireFeature('evidence')` pada `extension.store.ts`, evidence mengikuti flag extension dan tidak mempunyai flag evidence terpisah; rendition tetap memerlukan worker/storage yang siap. `FEATURE_UNAVAILABLE` ditampilkan sebagai fitur belum diaktifkan. Pengaktifan rilis tetap mengikuti gate backend.

Scope yang masih terpisah: layar akun koordinator untuk menerima penugasan; join/cancel peserta dan acknowledgement perubahan jadwal; daftar hasil privat di luar antrean review; koreksi pengukuran yang menghasilkan versi baru; notifikasi dan halaman impact publik. Frontend admin ini tidak mengaku sudah mengimplementasikan seluruh extension R1.

## Pemeriksaan pada pekerjaan ini

- `npm run typecheck --workspace=@sap/web`: berhasil, termasuk sesudah perapian komponen dan guard navigasi.
- Peninjauan visual memakai komponen yang sama pada origin preview terpisah, data sintetis dan foto mockup. Preview berada di luar repository dan tidak menjadi route, mode demo, atau fallback aplikasi SAP.
- Kelima target desain telah dibandingkan dengan hasil render melalui kit 12ui. Perbandingan desktop memakai 1536×1024, dengan capture full page; daftar, form, dan tinjauan hasil juga diperiksa pada lebar 390 px. Panel ditumpuk, form menjadi satu kolom, dan badge turun ke baris berikutnya jika ruang sempit.
- Peninjauan React mencakup abort request, perlindungan pagination dari respons filter lama, pemisahan state daftar/detail, pemeriksaan relasi activity/result, cleanup object URL, serta focus trap dialog yang digunakan kembali. IK memakai UUID v4 dengan fallback `crypto.getRandomValues` untuk origin HTTP LAN.
- Halaman aplikasi utama dapat dibuka, tetapi sesi browser pemeriksaan diarahkan ke login. Alur dengan sesi admin dan mutasi backend aktif belum diverifikasi.
- Tidak menjalankan suite test, mutasi database, migration, atau publikasi ke provider. Integrasi live yang menulis data belum diverifikasi pada pekerjaan ini.

## Penyesuaian terhadap mockup

- Font dan navigasi memakai komponen SAP yang sudah ada. Rekomendasi font/warna sidebar dari mapping otomatis tidak diterapkan jika mengubah konsistensi aplikasi.
- Empat ilustrasi status dipakai sebagai aset terpisah. Ikon tindakan menggunakan Lucide; foto bukti selalu menggunakan API. Foto contoh dan identitas/angka mockup tidak disalin menjadi data aplikasi.
- Kontrol mengikuti capability, kuota, consent, revision, dan status backend. Form nullable, foto publik, berat, serta loading/error menambah tinggi halaman dibanding gambar statis.
- Kit daftar mempunyai overlap mapping yang cukup; empat kit lainnya menandai overlap rendah. Mapping selector otomatis yang tidak sesuai semantik tidak diterapkan secara buta. Tata letak akhir diperiksa secara visual; hasil ini bukan klaim kecocokan pixel sempurna.
- Kit dan capture berada di `D:/projkwblampung/output/implementation-kits/kegiatan-relawan/alignment`, di luar repository.

File utama: `apps/web/components/activities/*`, `apps/web/lib/api/activities.ts`, `apps/web/lib/api/r1-schema.d.ts`, `apps/web/components/dashboard.tsx`, `apps/web/public/images/activities/*`.

## Perbaikan daftar kegiatan pada mobile — 4 Oktober 2026

Masalah pada screenshot terjadi karena breakpoint satu kolom masih mewarisi `grid-template-areas` dua kolom dan baris daftar masih memakai tujuh track tabel desktop. Akibatnya, grid membuat kolom implisit dan isi daftar meluber ke kartu pratinjau.

- Pada ≤760 CSS px, area daftar, ringkasan terpilih, dan antrean hasil disusun vertikal dengan area grid eksplisit.
- Baris tabel berubah menjadi kartu: foto/judul, badge status, jadwal/jumlah diterima, dan koordinator. Label metadata mobile mempunyai teks asli di DOM. Header tabel disembunyikan hanya pada mobile.
- Kartu pratinjau serta antrean hasil mengatur ulang track dan penempatan desktop; foto sumber tetap memakai `SourcePhoto`/media backend. Nama panjang membungkus dan filter mempunyai input 16 px.
- Pada ≤360 px, ukuran foto, padding, dan susunan tombol disesuaikan. Pemilihan kegiatan, navigasi detail, filter, pagination, dan mutasi menggunakan handler sebelumnya.
- Peninjauan komponen terisolasi pada 320, 360, 390, 430 dan 760 px menunjukkan kartu terpisah dan tidak ada overflow horizontal baris. Capture 1920×1080 sebelum/sesudah perbaikan daftar identik (0 piksel berubah). Pembandingan memakai data sintetis di luar repo, tanpa login atau mutasi backend.

Perubahan hanya pada `activities-page.tsx` dan CSS Module kegiatan. Tidak mengubah DTO, endpoint, auth/CSRF, role, flag, atau penyimpanan mock. Kit desktop asli dibaca kembali untuk hierarki dan jarak; perubahan global font/sidebar dari kit tidak diterapkan karena permintaan mempertahankan desktop. Bukti tersimpan di `D:/projkwblampung/output/implementation-kits/kegiatan-relawan/mobile-overlap-fix/`.

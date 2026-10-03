# Catatan perubahan frontend dan contract backend SAP

Tanggal: 2 Oktober 2026

Cakupan: halaman autentikasi, animasi Pet SAPA, serta frontend **Publikasi Instagram**.

Tujuan: menjelaskan perubahan yang sudah dilakukan, ketergantungan API, dan hal yang perlu ditinjau pengembang backend.

Dokumen ini melengkapi [kontrak integrasi](docs/INTEGRATION_CONTRACT.md) dan [OpenAPI](contracts/openapi.json). Sumber struktur request/response tetap OpenAPI versi `1.1.0`. Contoh data di bawah bersifat fiktif; dokumen tidak memuat credential atau nilai konfigurasi rahasia.

## 1. File yang diubah

| File | Perubahan |
| --- | --- |
| `apps/web/components/auth-page.tsx` | Baris aksi sekunder, ikon kirim ulang, state proses kirim ulang, pengosongan input kode setelah respons sukses, serta pengosongan kode ketika kembali ke formulir. |
| `apps/web/components/auth-page.module.css` | Layout tombol, outline, jarak, ukuran sentuh, focus keyboard, state disabled, animasi, dan penyesuaian layar kecil. |

Patch diterapkan pada frontend monorepo `sap/apps/web`. Tidak ada perubahan endpoint, DTO, schema OpenAPI, database, konfigurasi SMTP, cookie, atau middleware CSRF dalam patch ini. Logo dan foto halaman menggunakan aset yang sudah tersedia.

`apps/web/next-env.d.ts` sudah memiliki perubahan lokal sebelum patch ini dimulai; perubahan tersebut bukan bagian dari patch tombol verifikasi. Dukungan MFA juga sudah ada sebelumnya.

## 2. Perubahan tampilan yang sudah diterapkan

| Bagian | Sebelum | Sesudah |
| --- | --- | --- |
| Susunan aksi | Dua tombol berbentuk tautan berdampingan tanpa pengaturan layout; teks dan panah tampak menempel. | Wadah `secondaryActions` memakai flex, jarak antaraksi, dan pembungkusan saat ruang terbatas. |
| Kembali | Panah tidak sejajar dengan teks. | Panah `ArrowLeft` dan label sejajar; tombol berada di sisi kiri. |
| Kirim ulang kode | Tautan bergaris bawah. | Tombol outline warna teal di kanan, dengan ikon `RotateCw`. |
| Proses kirim ulang | Tombol utama menampilkan proses umum. | Tombol kirim ulang menampilkan `Mengirim…`; ikon berputar. Tombol utama tetap menampilkan label aksi verifikasi dan berada dalam keadaan disabled. |
| Ukuran interaksi | Mengikuti ukuran teks tautan. | Tombol sekunder memiliki tinggi minimum 44 px. |
| Keyboard | Mengikuti style tautan umum. | Tombol utama dan kedua aksi sekunder memiliki outline `focus-visible`. |
| Layar kecil | Tidak ada aturan khusus untuk baris aksi. | Baris bisa membungkus; pada lebar maksimal 360 px, jarak, font, dan padding disesuaikan. |
| Preferensi animasi | Belum mengatur ikon kirim ulang. | `prefers-reduced-motion` mematikan animasi ikon dan transisi tombol baru. |

Tombol kirim ulang hanya ditampilkan pada tahap `verify`. Layout Kembali juga dipakai pada tahap `forgot`, `reset`, dan `mfa`, karena memakai komponen autentikasi yang sama. Pada tahap `form`, baris aksi sekunder tidak ditampilkan.

## 3. Perilaku frontend yang sudah diterapkan

### Kirim ulang kode

1. Handler keluar jika `busy` sedang aktif.
2. Frontend mengaktifkan `busy` dan `resendingCode`, lalu menghapus pesan sukses/error sebelumnya.
3. Pada tahap verifikasi email, frontend memanggil `resendVerification(email.trim())`.
4. Selama request berjalan, tombol submit, Kembali, dan kirim ulang berada dalam keadaan disabled. Atribut `aria-busy` aktif pada tombol kirim ulang.
5. Jika respons sukses, frontend menyimpan `challenge.challengeId`, mengosongkan input `code`, dan menampilkan pesan `Jika akun memenuhi syarat, kode baru telah dikirim.`
6. Jika request gagal, frontend menampilkan pesan error. `challengeId` dan input kode sebelumnya tetap dipertahankan karena pengosongannya dilakukan setelah request sukses.
7. Pada blok `finally`, `busy` dan `resendingCode` kembali nonaktif.

Handler masih mempunyai cabang `forgotPassword(...)` untuk tahap `reset`, tetapi tombol kirim ulang saat ini hanya dirender pada tahap `verify`. Patch ini tidak menambahkan tombol kirim ulang pada formulir reset kata sandi.

Pencegahan klik ganda berlaku selama request frontend berjalan. Ini belum merupakan countdown atau pembatasan request selama cooldown backend.

### Kembali

- Kembali mengubah tahap menjadi `form` di komponen yang sama; tidak memanggil endpoint backend.
- Input kode, pesan sukses, dan pesan error dikosongkan.
- Email dan nama yang sudah diisi tetap berada dalam state komponen.
- Jika meninggalkan tahap MFA, `mfaCode`, `mfaPreauthToken`, dan mode kode pemulihan juga dikosongkan, sesuai perilaku yang sudah ada.
- Pada tahap verifikasi email, `challengeId` tidak dikosongkan atau dibatalkan di server oleh tombol Kembali. Masa berlaku dan penggunaan challenge tetap dikendalikan backend.

### Verifikasi kode

Input tetap satu field dengan `inputMode="numeric"`, `autoComplete="one-time-code"`, panjang maksimal enam karakter, dan pola enam digit. Karakter selain angka dibuang saat input berubah.

Submit tetap memanggil `verifyEmail(challengeId, code)`. Setelah sukses, frontend menjalankan `router.replace('/dashboard')` dan `router.refresh()`. Patch tidak menambahkan bypass verifikasi.

## 4. Kontrak API yang digunakan

Semua URL berikut menggunakan prefix `/api/v1`, sesuai client frontend dan OpenAPI.

| Aksi | Method dan URL | Body | Respons sukses |
| --- | --- | --- | --- |
| Memulai pendaftaran | `POST /api/v1/auth/register` | `{ displayName, email, password }` | HTTP 202, `{ data: Challenge }` |
| Kirim ulang verifikasi | `POST /api/v1/auth/resend-verification` | `{ email }` | HTTP 202, `{ data: Challenge }` |
| Memverifikasi email | `POST /api/v1/auth/verify-email` | `{ challengeId, code }` | HTTP 200, `{ data: User }`, cookie sesi dan rotasi CSRF melalui controller yang sudah ada. |
| Meminta pemulihan kata sandi | `POST /api/v1/auth/forgot-password` | `{ email }` | HTTP 202, `{ data: Challenge }` |
| Menyimpan kata sandi baru | `POST /api/v1/auth/reset-password` | `{ challengeId, code, newPassword }` | HTTP 200, `{ data: { message } }` |

Contoh request kirim ulang:

```http
POST /api/v1/auth/resend-verification
Content-Type: application/json
X-CSRF-Token: <token-dari-endpoint-csrf>

{"email":"pengguna@example.com"}
```

Struktur respons `Challenge`:

```json
{
  "data": {
    "challengeId": "00000000-0000-4000-8000-000000000001",
    "expiresAt": "2026-10-02T08:10:00.000Z",
    "retryAfterSeconds": 60,
    "message": "Jika akun memenuhi syarat, kode verifikasi telah dikirim ke email tersebut."
  }
}
```

Semua field `Challenge` tersebut wajib menurut OpenAPI. `challengeId` adalah UUID, `expiresAt` adalah waktu ISO, dan `retryAfterSeconds` adalah bilangan bulat minimal nol. Nilai contoh bukan hasil request nyata.

Client tetap mengambil token melalui `GET /api/v1/auth/csrf`, mengirim header `X-CSRF-Token`, dan menggunakan `credentials: 'include'`. Respons sukses harus memiliki envelope `data`. Error dibaca dari `error.code`, `error.message`, dan `error.fields`; header `Retry-After` dibaca ke `ApiError.retryAfter`.

Sumber untuk review:

- [Client frontend](apps/web/lib/api/client.ts).
- [Tipe API frontend](apps/web/lib/api/schema.d.ts).
- [Controller autentikasi](apps/api/src/auth/auth.controller.ts).
- [Validasi DTO](apps/api/src/auth/dto.ts).
- [Service autentikasi](apps/api/src/auth/auth.service.ts).
- [Repository challenge](apps/api/src/auth/challenge.repository.ts).
- [Mailer OTP](apps/api/src/auth/mailer.service.ts).

## 5. Temuan kesesuaian yang perlu ditinjau backend/frontend

Bagian ini merupakan hasil pembacaan kode. Poin tindak lanjut belum diimplementasikan dalam patch UI.

### A. Respons sukses kirim ulang belum membuktikan email baru dikirim

`AuthService.issueChallenge()` memakai cooldown 60 detik. Jika challenge terbaru masih aktif dan berada dalam cooldown, backend mengembalikan challenge tersebut tanpa memanggil `mailer.sendOtp()` lagi. Email tidak dikenal atau sudah terverifikasi juga mendapat dummy challenge untuk mencegah enumerasi akun.

Frontend saat ini hanya memakai `challengeId`. Field `retryAfterSeconds`, `expiresAt`, dan `message` belum dipakai pada halaman ini. Setelah setiap respons sukses, frontend mengosongkan input kode dan menampilkan pesan tentang kode baru, termasuk ketika backend memakai ulang challenge lama.

**Tindak lanjut yang disarankan:** pakai pesan generik `challenge.message`, terapkan cooldown dari `retryAfterSeconds`, dan sepakati perilaku input ketika ID challenge tetap sama. Pesan HTTP 202 tidak boleh dianggap bukti email tiba di inbox. Solusi ini dapat memakai kontrak yang sudah ada tanpa menambah field yang membocorkan status akun.

### B. Pengosongan input frontend tidak membatalkan OTP lama di backend

Saat request sukses, frontend mengganti ID challenge dengan respons terbaru dan mengosongkan input. Dari kode service/repository yang ditinjau, penerbitan challenge baru melakukan `INSERT`; tidak terlihat pembatalan challenge terdahulu dalam alur tersebut. Verifikasi memeriksa ID, purpose, expiry, jumlah percobaan, hash kode, dan status consumed.

**Tindak lanjut yang disarankan:** sepakati apakah beberapa challenge yang belum kedaluwarsa boleh tetap valid atau hanya challenge terbaru yang berlaku. Jangan menyimpulkan OTP lama telah dibatalkan hanya karena field UI kosong. Pemeriksaan kode ini belum mencakup kemungkinan aturan tambahan pada database.

### C. Kegagalan SMTP dan cooldown perlu diuji bersama

Service menyimpan challenge sebelum menjalankan `mailer.sendOtp()`. Jika pengiriman SMTP gagal setelah penyimpanan, request berikutnya yang masih berada dalam cooldown dapat memakai ulang challenge itu tanpa percobaan pengiriman baru.

**Tindak lanjut yang disarankan:** uji kegagalan provider email, aturan retry, dan status pengiriman. Tentukan apakah perlu pencatatan pengiriman atau outbox/retry agar cooldown tidak menahan pengiriman ulang atas kode yang belum berhasil dikirim. Ini temuan alur kode, bukan diagnosis atas kondisi SMTP saat ini.

### D. Batas dan validasi tetap menjadi tanggung jawab server

Backend saat ini mendefinisikan OTP berlaku 10 menit, cooldown 60 detik, dan batas lima percobaan per challenge. Frontend baru mencegah interaksi bersamaan selama request; setelah respons selesai, tombol kembali aktif. Penanganan HTTP 429 menampilkan pesan error tetapi belum menampilkan countdown dari `ApiError.retryAfter`.

**Tindak lanjut yang disarankan:** pastikan validasi kode, expiry, konsumsi sekali pakai, pembatasan request, dan proteksi CSRF tetap diuji di server. Countdown frontend hanya membantu pengguna dan tidak menggantikan pembatasan server.

## 6. Verifikasi yang sudah dilakukan

| Pemeriksaan | Hasil dan batas pemeriksaan |
| --- | --- |
| TypeScript frontend | Lulus dengan `tsc --noEmit --incremental false -p tsconfig.json`, dijalankan dari `apps/web`. |
| Whitespace diff | `git diff --check` lulus pada patch implementasi. |
| Browser lokal | Halaman autentikasi berhasil dimuat. Kembali dari tahap lupa kata sandi ke formulir login berfungsi. |
| Layout tombol Kembali | Ikon dan teks sejajar; tinggi tombol terukur sekitar 44 px pada pemeriksaan layar kecil. |
| Pengiriman email nyata | Belum diuji pada patch ini. Belum dilakukan pengujian SMTP, cooldown kirim ulang, atau verifikasi OTP sampai sesi dashboard. |
| Pemeriksaan backend | Pembacaan controller, DTO, service, repository, mailer, client, dan schema; belum menjalankan pengujian backend baru. |

## 7. Skenario review integrasi untuk pengembang backend

1. Pendaftaran akun belum terverifikasi menghasilkan `Challenge` dan email OTP yang sesuai.
2. Kirim ulang dalam cooldown memakai ulang challenge dan memberikan waktu tunggu yang benar.
3. Kirim ulang setelah cooldown menghasilkan challenge sesuai kebijakan OTP lama yang disepakati.
4. OTP benar, salah, kedaluwarsa, sudah dipakai, dan melewati batas percobaan memberikan hasil yang sesuai kontrak.
5. Email tidak dikenal dan email sudah terverifikasi tetap memakai respons generik.
6. Kegagalan SMTP/provider serta request berulang tidak meninggalkan pengguna tanpa cara menerima kode yang valid.
7. CSRF yang tidak valid ditolak; verifikasi sukses mengirim cookie sesi dan merotasi CSRF.
8. Error jaringan, HTTP 429, dan HTTP 503 memulihkan tombol frontend dari state disabled.
9. Kembali hanya mengubah tahap UI dan tidak menerbitkan sesi atau membatalkan challenge di backend.

Daftar ini adalah skenario yang disarankan untuk review, bukan daftar pengujian yang sudah lulus.

## 8. Integrasi animasi Pet SAPA — 2 Oktober 2026

### File dan aset

| File | Perubahan |
| --- | --- |
| `apps/web/components/sapa-sprite.tsx` dan `.module.css` | Renderer Canvas, pemutaran pose berdasarkan waktu, registrasi kaki, lintasan lompatan, fallback gambar, pengurangan gerakan, pause saat tab tersembunyi. |
| `apps/web/components/sapa-motion-data.ts` | Metadata enam gerakan, durasi tiap pose, dan anchor kedua kaki. Type `SapaActivity` hanya dipakai di frontend. |
| `apps/web/components/sapa-pet.tsx` dan `.module.css` | Launcher seluruh tubuh; label SAPA; hover/fokus; chat langsung terbuka sambil menyapa; area drag stabil; reaksi request; cleanup timer/listener. |
| `apps/web/components/sapa-client.ts` | Parameter `AbortSignal` opsional diteruskan ke request chat agar request dapat dibatalkan saat komponen dilepas. Body dan respons tetap sama. |
| `apps/web/components/dashboard.tsx` | Menghubungkan aktivitas scan dan keberhasilan laporan ke pet. Event sementara kedaluwarsa agar tidak diputar ulang saat preferensi pet diaktifkan kembali. |
| `apps/web/components/dashboard-views.tsx` | Mengirim fase pemrosesan, status akhir scan, kegagalan, serta pembatalan ke pengendali pet. |
| `apps/web/public/images/sapa/animation-v1/` | Satu PNG master dan enam PNG sheet asli, disalin dari aset yang sudah disetujui. Tidak memuat teks, credential, atau konfigurasi backend. |
| `design/sapa-animation-v1/build-playback-data.py` | Utilitas membaca artwork dan membuat metadata runtime. Tidak mengubah PNG. |

### Pemicu dan gerakan

| Pemicu | Perilaku |
| --- | --- |
| Diam | Siklus 8 detik, kedipan pendek, napas sangat kecil; sebagian besar waktu menahan pose. |
| Hover mouse / fokus keyboard | Penasaran sekitar 800 ms, sekali; cooldown 5 detik. |
| Buka chat | Panel langsung terbuka; lambaian sekitar 800 ms berjalan bersamaan. |
| Request chat / upload dan pemrosesan scan | Tablet, siklus 1,6 detik selama request frontend berjalan. |
| Respons chat valid / scan `succeeded` / laporan terkirim | Lompatan kecil sekitar 640 ms, sekali. |
| Request gagal / scan `failed` | Ekspresi ramah yang prihatin sekitar 900 ms; pesan error tetap ditampilkan di UI asal. |
| Scan tetap `queued` atau `processing` setelah batas polling | Kembali diam; tidak merayakan sukses. Hasil scan mempertahankan status sebenarnya dan kontrol refresh yang sudah ada. |
| Drag / tab tidak terlihat / reduced motion | Pemutaran berhenti. Reduced motion memakai pose tetap; kontrol chat tetap aktif. |

Gerakan tubuh digambar maksimal 30 kali/detik; pose sheet memakai durasinya sendiri. Ini bukan klaim 30 gambar unik/detik. React tidak dirender ulang untuk setiap frame. Sheet dimuat sesuai gerakan yang dibutuhkan lalu digunakan kembali; paket PNG asli berukuran sekitar 8,5 MB seluruhnya, bukan preload serentak.

### Kontrak backend

Tidak ada endpoint, DTO, database, autentikasi, CSRF, atau environment yang berubah untuk animasi ini. `POST /api/v1/assistant/chat` tetap mengirim `{ message, pageContext, conversationId }` dan mengharapkan `{ conversationId, reply, suggestedActions, citations }`. Pembatalan `fetch` adalah perilaku client; bukan endpoint pembatalan pekerjaan di server.

Scan tetap memakai upload media, create scan dengan idempotency key, serta polling status yang sudah ada. HTTP sukses tidak berarti klasifikasi berhasil: pet memeriksa `scan.status`. Pet mengikuti preferensi `user.sapaEnabled`, dan tetap disembunyikan selama wizard laporan untuk menjaga ruang formulir.

Tidak ada request API per frame, perubahan SMTP, akses credential, atau upload ke layanan desain eksternal dalam implementasi ini.

### Status pemeriksaan patch SAPA

- Pemeriksaan TypeScript frontend (`tsc --noEmit -p tsconfig.json`) lulus.
- Review kode mencakup registrasi pose, pembatalan request, timer, listener pointer/visibility, status queued/failed, dan dukungan reduced motion.
- Pemeriksaan dashboard di browser masih memerlukan sesi login aktif; tab yang tersedia mengarah kembali ke `/login`. Tidak dilakukan bypass autentikasi.
- Respons nyata chat/scan dan perangkat HP fisik belum diperiksa pada patch ini. Patch tidak menambahkan atau menjalankan suite pengujian baru.

## 9. Publikasi Instagram — frontend dan contract API

Pengguna menyetujui **frontend dan contract API terlebih dahulu**, karena teman pengembang backend belum membuat modul Instagram. Spesifikasi lengkap tersedia di [docs/instagram-publication-contract.md](docs/instagram-publication-contract.md).

### Perubahan yang masuk patch

| Bagian | Perubahan |
| --- | --- |
| Navigasi admin | Menu Publikasi Instagram pada `/dashboard?view=admin-instagram`, dimuat secara dinamis dan ditampilkan untuk role admin. |
| Daftar postingan | Foto laporan/scan, status, masuk draf dan terposting dalam WIB; filter, pencarian, periode, pagination, serta loading/error/empty state. |
| Detail | Drawer dengan foto asli, referensi laporan/scan, caption, waktu, akun tujuan, simpan draf dan konfirmasi posting. Status pending/failed tidak ditampilkan sebagai terposting. |
| Pengaturan postingan | Alur draf/otomatis, laporan dari scan, terverifikasi saja, Feed, WIB, template caption, hashtag, serta capability server. |
| Pemilih sumber | Membaca laporan admin sebenarnya; hanya sumber scan terverifikasi dengan ringkasan publik dan `publishedMediaIds` yang disetujui. |
| Aset terpisah | Ilustrasi kosong SVG, ikon vektor, dan renderer media. Tiga PNG mockup disimpan sebagai referensi dalam `design/instagram-publication-v1/`, bukan sebagai data/tampilan web. |
| Responsif | Panel lapang, daftar berubah menjadi kartu saat kontainer menyempit, pengaturan satu kolom di layar kecil, drawer penuh di HP. Sidebar dapat discroll agar menu admin tidak terpotong. |
| MediaThumbnail | Loader signed URL opsional; penggunaan foto pada halaman lama tetap memakai endpoint owner yang sama. |
| Adapter | `apps/web/lib/api/instagram.ts`, memakai client SAP dan CSRF yang sudah ada. Type tambahan terpisah dalam folder komponen Instagram. |

### Yang perlu dikerjakan backend

- Endpoint overview/capability, CRUD draf, pengaturan, publish/job status, signed URL foto admin, dan otorisasi akun. Path serta DTO lengkap ada di dokumen khusus.
- Saat ini API foto memeriksa owner, sehingga admin belum otomatis dapat melihat foto pengguna lain. Endpoint baru harus memeriksa hubungan laporan, status, serta persetujuan foto publik.
- `publishedMediaIds` pada laporan berarti persetujuan publik dalam SAP; bukan status posting Instagram. `publishedAt` harus dicatat server setelah provider mengonfirmasi publikasi berhasil.
- Penanganan idempotency, revision conflict, deduplication, pencabutan persetujuan, token akun, callback OAuth, worker automasi, serta audit tetap di server.

### Batas fungsi saat ini

Frontend tidak memakai akun terhubung, statistik, foto, atau waktu terposting fiktif. Saat modul memberi 404, tampil informasi publikasi belum diaktifkan, angka `—`, dan pratinjau pengaturan. Simpan/posting/koneksi akun disabled sampai API dan capability yang sesuai tersedia. Pemilih laporan memakai endpoint admin yang sudah ada; foto milik admin dapat memakai endpoint owner sebagai fallback, sedangkan foto pengguna lain membutuhkan endpoint foto admin yang diusulkan.

Tidak ada perubahan backend, migration, OpenAPI aktif, file environment, token provider, atau konfigurasi produksi dalam patch ini. Endpoint Instagram dalam dokumen adalah **usulan contract**, bukan endpoint yang telah dibuat.

### Pemeriksaan sebelum commit

- TypeScript frontend lulus: `tsc --noEmit --incremental false -p tsconfig.json` dari `apps/web`, pada 2 Oktober 2026.
- Pemeriksaan browser halaman admin belum dilakukan karena sesi yang tersedia masih berada di login. Tidak dilakukan bypass login.
- Publikasi Instagram nyata, OAuth, penyimpanan draf server dan automasi belum diperiksa karena backend belum tersedia. Tidak menambahkan atau menjalankan suite pengujian.
- File environment lokal diabaikan `.gitignore`. Pemeriksaan secret pada isi staged dilakukan sebelum push; file rahasia tidak termasuk daftar commit.

File `apps/web/next-env.d.ts` yang berubah otomatis oleh Next dev tidak termasuk patch aplikasi yang akan dipush; perubahan lokalnya dipertahankan.

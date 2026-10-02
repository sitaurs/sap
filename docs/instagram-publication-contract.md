# Publikasi Instagram — frontend dan usulan contract API

Tanggal: 2 Oktober 2026. **Status: usulan endpoint; modul backend Instagram belum ada.**

User menyetujui implementasi frontend dan contract terlebih dahulu. Dokumen ini tidak menyatakan bahwa penyimpanan draf, OAuth, worker automasi, atau publikasi nyata telah tersedia. OpenAPI SAP yang sekarang belum diubah; type tambahan berada di `apps/web/components/instagram/types.ts`.

## 1. Perubahan frontend

- Menu admin `Publikasi Instagram`: `/dashboard?view=admin-instagram`.
- Dua tab: **Postingan** dan **Pengaturan postingan**. Tab kedua dapat dibuka lewat `&publication=settings`.
- Tiga ringkasan: total, draf/belum terposting, terposting. Angka berasal dari server; saat endpoint belum ada, tampil `—`, bukan angka contoh.
- Daftar foto sumber, kategori, referensi laporan/scan, status, masuk draf, terposting. Tanggal ditampilkan dalam WIB, termasuk hari dan waktu; bukan waktu perangkat yang sedang membuka halaman.
- Filter status, pencarian, periode masuk draf, pagination berbasis cursor.
- Klik postingan membuka drawer detail. Caption dapat diedit sebelum posting, maksimal 2.200 karakter. Postingan terposting bersifat read only.
- Pilih laporan membuka sumber laporan sebenarnya melalui API admin yang sudah ada. Satu foto yang disetujui dipilih per postingan Feed.
- Pengaturan: draf atau otomatis, sumber laporan scan, terverifikasi saja, akun tujuan, Feed, WIB, template caption dan hashtag.
- Otomatis hanya bisa dipilih bila server memberi `canAutomate: true`. Penyimpanan/otorisasi/posting tidak aktif saat modul belum tersedia.
- Ada loading, empty, error, retry, konfirmasi publikasi, penjagaan caption belum tersimpan, navigasi keyboard, focus trap, pengembalian fokus, serta reduced motion.
- Layout lebar, tanpa preview permanen di sebelah tabel. Saat kontainer mengecil, baris berubah menjadi kartu. Panel detail memiliki footer aksi tetap; panel isi bisa discroll.

## 2. Integrasi yang sudah ada

| Endpoint yang sudah ada | Penggunaan |
| --- | --- |
| `GET /api/v1/auth/me` | Role admin dari sesi SAP; menu tidak tampil untuk non-admin. |
| `GET /api/v1/admin/reports?limit=50&cursor=…` | Laporan semua pengguna untuk pemilih sumber, bukan daftar laporan pribadi. Pagination dimuat sesuai kebutuhan. |
| `GET /api/v1/media/{mediaId}/url` | Fallback foto **milik pengguna yang sedang login** saja. Endpoint ini saat ini memeriksa owner dan tidak memberi admin akses universal. |
| `GET /api/v1/auth/csrf` | Token CSRF untuk mutasi melalui `apiMutate` yang sudah ada. |

**Temuan penting untuk backend:** role admin belum membuat `media/{id}/url` dapat membaca foto pengguna lain. Perlu endpoint foto dengan pemeriksaan hubungan laporan + persetujuan publik. UI tidak mengganti kebijakan owner, membuat bucket menjadi publik, atau menyalin signed URL ke penyimpanan lokal.

Sumber lolos apabila `scanId != null`, status `verified | in_progress | resolved`, `publicSummary` terisi, dan `publishedMediaIds` tidak kosong. `publishedMediaIds` berarti **persetujuan foto publik dalam moderasi SAP**, bukan bukti bahwa foto pernah terposting di Instagram. Gunakan `publishedAt`/status publikasi untuk bukti Instagram.

Caption awal menggunakan ringkasan publik yang disetujui, bukan deskripsi privat, nama pelapor, email, atau koordinat tepat. Backend harus memeriksa ulang syarat sumber ketika membuat draf dan memposting; validasi UI bukan otorisasi.

## 3. Usulan endpoint yang dipanggil adapter frontend

Semua memakai prefix `/api/v1/admin/instagram`, cookie sesi yang sudah ada, envelope `{ "data": ... }`, `Cache-Control: no-store`, dan admin guard **di server**. Semua mutasi memakai `X-CSRF-Token`.

| Method / path | Request | Respons data |
| --- | --- | --- |
| `GET /admin/instagram` | — | `InstagramOverview` |
| `GET /admin/instagram/posts` | Query di bawah | `PublicationPage` |
| `GET /admin/instagram/posts/{id}` | — | `InstagramPost` terbaru |
| `POST /admin/instagram/posts` | `{ reportId, mediaId, caption }`, `Idempotency-Key` UUID | 201 `InstagramPost`, status `draft` |
| `PATCH /admin/instagram/posts/{id}` | `{ caption }`, `If-Match` revision integer | 200 `InstagramPost` |
| `POST /admin/instagram/posts/{id}/publish` | Body kosong, `If-Match`, `Idempotency-Key` UUID | 202 `InstagramPost` dengan `publishing`, atau 200 `published` bila selesai sinkron |
| `PUT /admin/instagram/settings` | Field pengaturan selain revision, `If-Match` | 200 `PublicationSettings` revision terbaru |
| `GET /admin/instagram/reports/{reportId}/media/{mediaId}/url` | — | `{ url, expiresAt }`, signed URL sementara |
| `GET /admin/instagram/account/authorization` | — | `{ authorizationUrl }` otorisasi resmi Meta |

Path pada tabel belum diimplementasikan dalam backend saat ini. Adapter berada di `apps/web/lib/api/instagram.ts`.

Query daftar: `limit=12`, `status=all|draft|published`, `search` maksimal 150 karakter, `period=all|7d|30d`, `cursor` opaque opsional. `period` mengacu **createdAt masuk draf**. `draft` mencakup semua yang belum sukses terposting (`draft`, `publishing`, `failed`). Urutan stabil `createdAt DESC, id DESC`. `nextCursor` null di akhir; `total` jumlah hasil seluruh filter, bukan hanya page saat ini. Setiap page maksimal 12 item.

## 4. DTO

### InstagramOverview

```ts
{
  account: {
    username: string | null; // tanpa awalan @, tidak memuat credential
    status: 'connected' | 'disconnected' | 'expired';
  };
  capabilities: { canPublish: boolean; canAutomate: boolean; canConnect: boolean };
  settings: PublicationSettings;
  stats: { total: number; draft: number; published: number };
}
```

`total = draft + published`. `draft` mencakup semua yang belum terposting. `canPublish` hanya true saat akun terhubung, layanan publisher tersedia, permission mencukupi, dan token masih valid. `canAutomate` membutuhkan worker dan aturan publikasi yang benar-benar tersedia. `canConnect` membutuhkan konfigurasi OAuth server yang lengkap. Metadata ini bukan token.

### InstagramPost

```ts
{
  id: string;              // UUID dari server
  revision: number;        // integer >= 1, bertambah setiap perubahan
  source: {
    reportId: string;      // UUID laporan sumber
    scanId: string | null;
    title: string;         // judul ringkasan publik, bukan deskripsi privat
    categoryName: string;
    mediaId: string;       // UUID dari foto yang disetujui
    publicSummary: string;
  };
  status: 'draft' | 'publishing' | 'published' | 'failed';
  caption: string;
  createdAt: string;       // ISO 8601 UTC dari server, masuk draf
  updatedAt: string;       // ISO 8601 UTC
  publishedAt: string | null; // hanya ada bila status published
  permalink: string | null;  // URL https Instagram /p/… atau /reel/…
  publishError: string | null; // pesan aman untuk admin, tanpa token/provider payload
}
```

Frontend menolak respons `published` tanpa `publishedAt` valid, atau waktu terposting terisi pada status lain. Jangan mengirim waktu submit sebagai waktu terposting. Simpan provider media ID dan job ID di server; frontend tidak memerlukan token/container credential.

`PublicationPage = { items: InstagramPost[], nextCursor: string | null, total: number }`.

### PublicationSettings

```ts
{
  revision: number;
  mode: 'draft' | 'automatic';
  source: 'scan_reports';
  onlyVerified: true;
  format: 'feed';
  timezone: 'Asia/Jakarta';
  captionTemplate: string; // max 1.800 karakter
  hashtags: string;        // max 400 karakter, max 30 hashtag
}
```

Token template: `{jenis_sampah}` dan `{ringkasan_laporan}`. Frontend menyiapkan caption awal, lalu mengirim string caption lengkap dalam create draft. Server memvalidasi panjang akhir 1–2.200 dan membentuk caption sendiri untuk automasi. Template baru hanya berlaku untuk draf baru, tidak mengganti caption draf lama atau postingan terbit.

Settings contoh di frontend adalah **pratinjau**, tidak dianggap preferensi tersimpan dan tidak dikirim sebagai seed otomatis. Tidak ada persistence lokal untuk draf/settings.

## 5. Alur server yang perlu disiapkan

1. Tambahkan tabel/settings yang revisioned, post, job/outbox dan audit, plus migration yang dapat direview terpisah.
2. Endpoint sumber foto memeriksa sesi admin, keberadaan laporan, status eligible, dan keanggotaan `mediaId` dalam `publishedMediaIds`. Jangan menerima object key/URL bebas dari frontend.
3. Create draft memeriksa sumber dan menyimpan referensi serta ringkasan publik; `createdAt` ditetapkan server. Deduplicate per source/account sesuai keputusan produk; minimal idempotency tidak membuat duplikat.
4. Save draft hanya untuk `draft | failed`; revision tidak cocok → 409. Jangan mengubah postingan `publishing | published`.
5. Publish melakukan validasi ulang sumber/persetujuan, akun, caption, dan revision; membuat satu job secara atomik. Request ulang memakai key sama harus mengembalikan resource/job yang sama.
6. Worker melakukan upload/publish Instagram resmi. `publishedAt` baru ditetapkan ketika publikasi provider berhasil dikonfirmasi; kegagalan → `failed`, `publishedAt=null`, pesan aman dan jalur retry.
7. Retry yang timeout harus direkonsiliasi dengan job/container/provider ID yang sama. Jangan membuat postingan Instagram kedua akibat respons jaringan hilang. Frontend mempertahankan idempotency key untuk intent/payload yang sama; perlindungan lintas tab/reload tetap tanggung jawab server.
8. Mode otomatis berjalan hanya untuk sumber yang lolos aturan, memakai deduplication, audit dan worker di server. Timer atau tab browser bukan scheduler.
9. Jika laporan/foto dicabut persetujuannya, block publish baru, hentikan job bila mungkin, dan tentukan kebijakan postingan yang sudah terbit. Bukan sekadar menyembunyikan tombol frontend.

Frontend polling post `publishing` setiap 5 detik, maksimal 2 menit; tidak mengubah status menjadi sukses karena timeout. Setelah itu, pengguna bisa memperbarui status. HTTP 202 bukan bukti konten sudah tampil di Instagram.

## 6. OAuth dan media

- `authorizationUrl` hanya untuk redirect otorisasi resmi Meta. Frontend mengizinkan HTTPS host `www.facebook.com`, `facebook.com`, `www.instagram.com`, atau `api.instagram.com`.
- Server membuat/menyimpan state OAuth yang terikat sesi admin, memvalidasi callback, serta menentukan redirect URI. Callback, token exchange, refresh token, penyimpanan terenkripsi, disconnect, dan audit belum dibuat di patch frontend ini.
- Token, app secret dan konfigurasi provider tetap server side. Jangan membuat `NEXT_PUBLIC_*` berisi secret, jangan menaruh token di response overview, URL frontend, localStorage, file aset, atau commit.
- Signed URL pratinjau ditangani renderer foto yang sudah ada dan diperbarui sebelum kedaluwarsa; hanya disimpan sementara di memori komponen.
- Backend mengelola cara provider mengakses foto yang disetujui. URL pratinjau yang singkat masa berlakunya bukan pengganti strategi media publisher.
- Fallback endpoint foto owner dilakukan hanya setelah endpoint admin memberi 404; respons forbidden tidak dibypass. Bila foto tidak boleh diakses, UI menampilkan “Foto tidak tersedia”.

## 7. Error envelope dan konkurensi

Pakai pola SAP: `{ "error": { "code": "…", "message": "…", "fields": {} } }`.

| HTTP / code usulan | Perilaku frontend |
| --- | --- |
| 404 pada overview | Modul belum tersedia: tampil pratinjau dan informasi aktivasi, mutasi disabled. |
| 401 / 403 | Error sesi/role/CSRF ditampilkan; tidak memakai data demo. |
| 400 `VALIDATION_ERROR` | Pesan validasi; tetap menahan caption yang diketik. |
| 409 `REVISION_CONFLICT` | Minta muat versi terbaru; jangan menimpa diam-diam. |
| 409 `SOURCE_NOT_APPROVED`, `ALREADY_PUBLISHED` | Tolak create/publish; tetap tunjukkan status server. |
| 422/503 `INSTAGRAM_NOT_CONNECTED`, `PUBLISHER_UNAVAILABLE` | Tidak menyatakan sukses; pengguna mengelola koneksi. |
| 429 | Tampilkan pesan aman; server mempertahankan idempotency dan aturan retry. |

Endpoint publish, settings, dan OAuth tetap harus mengotorisasi di server walaupun tombol frontend sudah memeriksa role/capability. Rate limiting, permission Meta, idempotency retention dan sanitasi log mengikuti kebijakan backend.

## 8. Aset dan implementasi

`design/instagram-publication-v1/` berisi tiga mockup yang disetujui dan manifest pemecahan aset. Mockup tidak digunakan sebagai halaman atau data. `public/images/instagram/publication-empty.svg` adalah ilustrasi kosong terpisah. Logo SAP yang sudah ada dan ikon vektor lucide digunakan kembali. Foto publikasi berasal dari media laporan sebenarnya.

Komponen berada di `apps/web/components/instagram/`; adapter API terpisah dari UI. Dashboard memuat modul admin secara dinamis. MediaThumbnail menerima loader URL opsional; caller lama tetap memakai endpoint owner yang sama.

## 9. Status pemeriksaan

- TypeScript frontend lulus pada pemeriksaan implementasi awal. Pemeriksaan akhir dicatat di `contract.md`.
- Backend, migration, token Instagram, OAuth dan publikasi nyata belum dibuat/dijalankan pada patch ini.
- Skenario yang disarankan untuk review backend: otorisasi foto lintas pengguna, pencabutan persetujuan, sumber non-scan, CSRF, revision conflict, idempotent retry, worker timeout, status failed, token expired, cursor, pagination, dan UTC→WIB. Ini bukan daftar suite pengujian yang sudah dijalankan.

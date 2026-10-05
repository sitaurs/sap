# Bahasa antarmuka SAP

## Perubahan 5 Oktober 2026

Pengaturan mempunyai kartu **Bahasa** dengan pilihan **Bahasa Indonesia** (`id`) dan **English** (`en`). Pilihan langsung mengubah antarmuka tanpa mengirim form profil atau mengosongkan input pengguna. Kontrol memakai radio native, label terlihat, indikator pilihan, pesan status, dan fokus keyboard. Dua kolom ditumpuk pada layar kecil.

### Struktur

| Bagian | Lokasi |
| --- | --- |
| Pilihan bahasa | `apps/web/components/language-settings.tsx` |
| Konfigurasi locale | `apps/web/lib/i18n/config.ts` |
| Context dan sinkronisasi browser | `apps/web/lib/i18n/provider.tsx` |
| Fungsi terjemahan dan interpolasi | `apps/web/lib/i18n/translate.ts` |
| Pembacaan cookie pada server | `apps/web/lib/i18n/server.ts` |
| Kamus per fitur | `apps/web/lib/i18n/messages/` |
| Integrasi SSR | `apps/web/app/layout.tsx` |

Kamus memakai teks Indonesia sebagai kunci. `t(source, values?)` mengganti teks UI melalui kamus English; kunci belum terdaftar tetap ditampilkan dalam bahasa sumber. Placeholder `{0}`, `{name}`, dan seterusnya menerima nilai string/angka melalui React, bukan HTML. Untuk copy baru, tambahkan pasangan kamus lalu panggil `t` pada tempat tampilnya.

### Penyimpanan

- `localStorage["sap.locale.v1"]`: `id` atau `en`.
- Cookie publik `sap_locale`: nilai yang sama, `Path=/`, `SameSite=Lax`, umur satu tahun, `Secure` jika situs memakai HTTPS.
- Cookie dipakai server untuk locale HTML awal dan metadata; `html.lang` mengikuti pilihan. Tanpa cookie valid, default Indonesia. LocalStorage menjadi fallback setelah hydration jika cookie diblokir.
- Perubahan localStorage dari tab lain disinkronkan melalui event `storage`.
- Jika kedua penyimpanan diblokir, pilihan tetap berlaku pada sesi tampilan saat itu dan UI memberi tahu bahwa preferensi belum persisten.
- Preferensi berlaku di browser ini, bukan otomatis pada semua perangkat atau akun.

Membaca cookie pada root layout membuat halaman memakai rendering dinamis. URL, query navigasi dashboard, dan hash landing tetap memakai identifier existing; tidak ada prefix locale baru.

### Cakupan tampilan

Terjemahan terhubung ke Pengaturan, navigasi desktop/mobile, landing, auth, dashboard, scan dan kamera, riwayat, laporan, peta, bantuan, pencapaian, kegiatan/koordinator, Dampak, Publikasi Instagram, serta kontrol SAPA. Tanggal/angka yang diformat dinamis memakai `id-ID` atau `en-GB`. Zona waktu bisnis dan batas tanggal API tetap mengikuti aturan existing, termasuk WIB/Asia/Jakarta.

Nama, deskripsi laporan/kegiatan, bukti, catatan moderator, caption, isi percakapan, dan pesan yang berasal dari backend tidak diterjemahkan otomatis. Label kategori/status yang dikenal diterjemahkan saat ditampilkan. Teks yang sudah menjadi bagian gambar ilustrasi tetap berada di aset aslinya. Terjemahan jawaban AI SAPA mengikuti layanan backend, tidak diubah melalui penambahan field request.

### Kontrak backend

Tidak ada endpoint, DTO, schema database, migration, token, atau flag baru. `PATCH /users/me/preferences` tetap mengikuti kontrak existing (`sapaEnabled`); frontend tidak mengirim `locale` ke endpoint itu. Jika kelak dibutuhkan sinkronisasi antarperangkat, perlu kontrak backend eksplisit untuk field locale, validasi enum, default, dan pengambilan preferensi saat login.

Nilai teknis seperti status enum, role, categoryId, action, revision, idempotency key, template caption, dan konfirmasi literal **HAPUS AKUN** tetap memakai nilai kontrak existing. Input dan data yang dikirim tidak diganti dengan hasil terjemahan.

### Pemeriksaan pekerjaan

Typecheck dan build produksi frontend dijalankan. Tidak ada suite test/E2E baru atau eksekusi suite pada pekerjaan ini. Alur Settings yang memerlukan akun tidak dipastikan melalui login browser otomatis.

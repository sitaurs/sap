# Implementasi navigasi mobile SAP

Tanggal: 4 Oktober 2026. Acuan: mockup dua layar **Akun & menu** dan **Pusat admin** yang disetujui pemilik proyek. Implementasi berupa responsive web; tidak membuat paket APK.

## Batas tampilan

- ≤760 CSS px: header ringkas, navbar bawah, halaman akun/menu, pusat admin, serta pet SAPA animasi mengambang di atas navbar. Bilah bantuan juga dapat membuka chat yang sama.
- >760 CSS px: tampilan desktop yang sudah ada. CSS baru untuk shell/header/navbar/chat dibatasi media query mobile. Font utama DM Sans/Manrope, logo, dan navigasi desktop dipertahankan.
- Halaman konten, status, data, filter, dan tindakan masing-masing fitur tetap memakai komponen aslinya.
- Pada viewport pendek, konten dapat di-scroll. Padding bawah memberi ruang untuk navbar dan safe area. Saat input chat fokus pada viewport ≤500 px tinggi, deretan tombol navbar disembunyikan sementara untuk memberi ruang chat; bilah SAPA tetap ada.
- Viewport `device-width`, `initial-scale=1`, `viewport-fit=cover`, `interactive-widget=resizes-content`; zoom pengguna tidak dinonaktifkan. Browser yang belum mendukung `interactive-widget` tetap memakai perilaku bawaannya.

## Mapping navbar

| Label mobile | View | Komponen/fitur asli |
| --- | --- | --- |
| Beranda | `dashboard` / tanpa query view | Dashboard |
| Laporan | `reports` | Laporan saya |
| Scan | `scan` | Scan sampah / kamera |
| Peta | `map` | Peta area |
| Akun | `account` | MobileAccountMenu |

Riwayat scan, Pencapaian, Pengaturan, dan Bantuan berada di menu akun. Profil mengarah ke `settings`; tombol Keluar memakai `logout()` asli. Menu di luar empat tujuan utama tetap menandai tab Akun sebagai aktif.

## Mapping pusat admin

| Menu | View |
| --- | --- |
| Pusat admin | `admin-menu` |
| Moderasi laporan | `admin-moderation` |
| Kegiatan relawan | `admin-activities` |
| Dampak | `admin-impact` |
| Pengaturan scan | `admin-settings` |
| Publikasi Instagram | `admin-instagram` |

Daftar tujuan desktop/mobile berasal dari satu `navigation-data.ts`. Menu admin hanya terlihat bagi role `admin`. URL langsung untuk tujuan admin tetap melalui guard dashboard; backend tetap memeriksa otorisasi setiap request. Nama, avatar, dan status role menggunakan respons akun, bukan isi mockup.

Ketika URL `account` dibuka pada desktop, konten menggunakan Pengaturan. `admin-menu` pada desktop menggunakan Moderasi laporan. `pushState` mobile dan listener `popstate` menjaga perpindahan menu/Back; `replaceState` desktop tetap digunakan. Query detail kegiatan dan publikasi dibersihkan ketika berpindah keluar dari fitur tersebut sesuai handler sebelumnya.

## API yang digunakan

Tidak ada API mobile baru. Handler dashboard dan klien existing dipakai kembali:

- `getMe()` untuk nama, `role`, `avatarMediaId`, `sapaEnabled`.
- `mediaUrl()` melalui `MediaThumbnail` untuk URL foto profil yang ditandatangani, refresh URL dan fallback.
- `logout()` untuk mengakhiri sesi; pending/error mengikuti hasil API.
- `sendSapaMessage()` melalui SapaPet untuk percakapan SAPA yang sama.
- API masing-masing halaman konten mengikuti kontrak implementasi sebelumnya.

Tidak menyimpan token baru, tidak memindahkan pemeriksaan auth ke frontend, dan tidak mengganti layanan backend dengan data contoh pada aplikasi utama.

## Struktur perubahan

```text
apps/web/components/mobile/
  navigation-data.ts             # mapping view + role menu
  use-mobile-navigation.ts       # media query, useSyncExternalStore
  mobile-header.tsx              # logo, pencarian, avatar akun
  mobile-bottom-nav.tsx          # lima tab, Scan utama, bantuan fallback
  mobile-account-menu.tsx        # akun/menu + pusat admin
  mobile-navigation.module.css   # tampilan menu dan dock
apps/web/public/images/mobile/
  sapa-dock.webp                 # referensi ilustrasi bilah versi awal
  README.md                     # sumber dan prompt aset
```

Integrasi: `dashboard.tsx`, tambahan CSS mobile pada `dashboard.module.css`, prop opsional `mobileDock` dan CSS pada SapaPet, serta ekspor viewport pada `app/layout.tsx`. Tidak mengubah endpoint, payload, backend, schema, ataupun flag rilis.

## Adaptasi desain dan aset

Mockup dipisahkan menjadi referensi LayerDoc/aset melalui 12ui di `D:/projkwblampung/output/implementation-kits/mobile-navigation/approved`. Aset SAPA bilah versi awal dibuat melalui imagegen berdasarkan avatar SAPA yang sudah ada; trim/resize/kompresi WebP menggunakan Sharp. Versi pet saat ini memakai ulang sprite animasi desktop. Gambar mockup tidak dipakai sebagai satu screenshot halaman.

Logo asli dipakai ulang. Ikon kontrol memakai Lucide SVG agar tajam dan tetap konsisten dengan desktop. Bingkai HP, status bar sistem, latar daun, judul papan presentasi, dan badge “mockup” hanya milik papan referensi dan tidak menjadi bagian aplikasi. Gambar SAPA hasil generator menjadi referensi versi bilah awal; setelah permintaan berikutnya, pet mobile memakai sprite desktop dan bilah memakai ikon Sparkles. Lonceng dengan indikator unread pada acuan diganti pencarian dan avatar yang sudah mempunyai fungsi; tidak membuat notifikasi palsu tanpa API.

Perbandingan 12ui menggunakan LayerDoc asli tanpa perubahan, melalui papan pratinjau dua komponen asli dengan data sintetis di luar repo. Kit alignment dibaca untuk meninjau hierarki, warna, font, jarak, dan menu; skor coverage adalah keberhasilan pencocokan elemen, bukan skor kualitas atau verifikasi API. Patch global/font Inter serta elemen presentasi tidak diterapkan karena lingkupnya mobile dan font desktop harus dipertahankan.

## Pemeriksaan dan batas

TypeScript diperiksa dengan `npm run typecheck --workspace @sap/web`. Pratinjau komponen terisolasi menggunakan CSS, gambar, dan komponen React yang sama: akun diperiksa pada lebar 320, 360, 390, 430, 760 dan 1024 px; admin pada 320, 390 dan 430 px. Tidak ditemukan overflow horizontal pada ukuran tersebut. Pada 320×568, menu dapat di-scroll sampai tombol Keluar berada di atas dock; pada 1024 px dock mobile tidak muncul.

Pratinjau ini tidak memakai sesi login dan tidak mengirim pesan/mengeksekusi logout backend. Frontend utama port 3000 tetap berjalan, dan kunjungan dashboard tanpa sesi diarahkan ke login. Login aplikasi utama tetap diperlukan untuk memeriksa alur backend lengkap. Tidak menambah atau menjalankan suite test otomatis pada perubahan ini.

Nama profil panjang dan role pengguna biasa juga ditinjau pada 320 px: teks membungkus di dalam kartu dan Pusat admin tidak tampil. Panel SAPA ditinjau pada viewport pendek 390×360; input tetap berada di dalam layar dan deretan navbar disembunyikan sementara ketika input fokus. Ini pemeriksaan ruang viewport, bukan simulasi keyboard fisik setiap merek HP.

Bukti gambar komponen 390×844 tersimpan di luar repo:

- `D:/projkwblampung/output/implementation-kits/mobile-navigation/proof/final-account/capture/source.png`
- `D:/projkwblampung/output/implementation-kits/mobile-navigation/proof/final-admin/capture/source.png`

Review React: media-query subscription dan listener history/resize mempunyai cleanup; daftar tujuan berada di luar render; data akun/media memakai handler existing; ikon dekoratif dan tombol mempunyai label; input chat memakai state yang sama. Tipe view admin/mobile dipisahkan agar view baru tidak dikirim sebagai tab konten lama.

## Pet SAPA animasi pada mobile — 4 Oktober 2026

Permintaan berikutnya mengganti launcher karakter statis pada bilah dengan pet animasi yang sama seperti desktop. `SapaPet` dan `SapaSprite` memakai sprite `images/sapa/animation-v1/` yang sudah ada: idle/kedip, wave, curious, thinking, success, dan error. Playback tetap memakai durasi pose asli, pembaruan canvas maksimal 30 FPS, penghentian saat tab tersembunyi, serta `prefers-reduced-motion`.

- Pet 90×106 px muncul di atas navbar; area karakter 90×90 px. Dapat diketuk untuk membuka chat dan diseret. Batas seret membaca posisi navbar agar pet berhenti setidaknya 14 px di atasnya, serta menjaga area header dan tepi layar.
- Posisi mobile menggunakan key lokal `sap-pet-position-mobile`; posisi desktop tetap `sap-pet-position`. Pergantian ukuran layar memuat posisi sesuai mode dan membatasinya kembali.
- Bilah hijau tetap membuka percakapan yang sama, memakai ikon Sparkles. Pet disembunyikan sementara selama panel chat terbuka agar tidak menutupi input; tombol Minimalkan menampilkan pet lagi dan mengembalikan fokus ke tombol asal.
- Preferensi `sapaEnabled` serta penyembunyian saat wizard laporan tetap berlaku. Tidak menggandakan percakapan atau menambah panggilan backend.
- Peninjauan awal 390×844 menunjukkan canvas aktif dan jarak 14 px terhadap navbar, termasuk setelah pet diseret menuju navbar. Pada tinggi 360 px, input chat masih berada di dalam viewport dan navigasi utama disembunyikan saat input fokus. Peninjauan ini memakai komponen asli dengan data sintetis pada origin terisolasi, bukan sesi backend.

Perapian layout daftar kegiatan dibahas dalam [catatan kegiatan](FRONTEND_ACTIVITIES_IMPLEMENTATION.md#perbaikan-daftar-kegiatan-pada-mobile--4-oktober-2026).

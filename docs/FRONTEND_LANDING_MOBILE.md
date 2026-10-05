# Implementasi landing page mobile SAP

Tanggal: 5 Oktober 2026.

## Scope

Landing page publik `/` mengikuti mockup mobile yang disetujui. Tampilan baru aktif pada viewport **≤760 px**; aturan desktop existing digunakan di atas breakpoint ini. CSS dibatasi pada komponen landing page. Halaman auth, dashboard, admin, navbar bawah dashboard, SAPA, serta konfigurasi backend tidak diubah oleh pekerjaan landing ini.

## Struktur

| Bagian | Komponen / sumber |
| --- | --- |
| Header desktop dan menu mobile | `apps/web/components/landing/landing-header.tsx` |
| Hero, foto, dan empat pintu fitur mobile | `impact-hero.tsx`, `landing/mobile-hero-content.tsx` |
| Tiga tahap laporan mobile | `landing/mobile-workflow.tsx` |
| Peta publik, periode, dan state data | `public-map-section.tsx`, `landing/landing-mobile.module.css` |
| Tahapan verifikasi | `lower-section.tsx`, `lower-section.module.css` |
| Carousel cerita contoh dan CTA | `landing/mobile-stories.tsx`, `landing/content.ts` |
| Footer accordion | `landing/mobile-footer.tsx` |
| Aset terpisah dan manifest | `apps/web/public/images/landing-mobile/` |

Masing-masing komponen mobile mempunyai CSS Module tersendiri. Logo dan ikon mengikuti sistem existing. Delapan aset raster WebP dipisahkan sebelum integrasi; bukan satu screenshot halaman yang ditempel sebagai UI.

## Perilaku dan aksesibilitas

- Header mobile mempunyai menu layar penuh dengan lima tautan bagian, Coba Sekarang, dan Masuk. Dialog native menjaga fokus, mendukung Escape, memblokir scroll halaman sementara terbuka, dan ditutup saat berpindah ke viewport desktop.
- Hero mempunyai CTA Mulai scan dan Lihat peta, foto ilustrasi, serta kartu Scan, Laporan, Peta, dan Edukasi. Tautan scan/laporan tetap menuju dashboard dan mengikuti auth existing.
- Alur laporan disusun vertikal dengan nomor tahap. Kartu lokasi, foto, dan waktu bertanda contoh; tindakan membuat laporan membuka alur laporan existing, bukan mengirim form sintetis.
- Verifikasi memakai rail vertikal dan gambar terpisah; tombol penjelasan existing tetap berfungsi.
- Carousel cerita mendukung swipe, tombol sebelumnya/berikutnya, indikator aktif, tombol pemilih, dan panah keyboard ketika carousel memperoleh fokus. Perpindahan menghormati `prefers-reduced-motion`. Kutipan ditandai **Contoh tampilan** dan tidak menyatakan angka keberhasilan produk.
- Footer memakai elemen `details`/`summary` untuk accordion yang bisa dipakai dengan keyboard. Link dan dialog informasi existing dipakai kembali.
- Kontrol utama mobile mempunyai target sentuh minimal 44 px. Gutter 24 px, turun menjadi 20 px di bawah 350 px; lebar konten utama dibatasi 560 px. Teks dan kartu dapat bertambah tinggi mengikuti konten. Menu memperhitungkan tinggi viewport dinamis serta safe area.

## Kontrak untuk backend

Tidak ada endpoint, payload, database, flag fitur, izin, atau autentikasi baru.

Peta tetap membaca adapter existing:

| Operasi | Endpoint |
| --- | --- |
| Ringkasan area pada bounds/periode | `GET /api/v1/areas?bbox=...&from=...&to=...` |
| Detail area terpilih | `GET /api/v1/areas/:cellId?from=...&to=...` |

Peta menampilkan loading, kosong, error dengan Coba lagi, dan data aktual. Angka area saat loading/gagal ditampilkan sebagai `—`, bukan nol yang seolah sudah diverifikasi. Risiko memakai nilai API dan label Indonesia. Area ilustratif dalam mockup tidak menjadi fallback API. Integrasi tautan kejadian publik R1 existing dipertahankan.

Perubahan indikator loading/error peta berlaku juga pada desktop, sementara susunan desktop tidak didesain ulang. API nyata lokal mengembalikan HTTP 200 untuk permintaan daftar area saat pemeriksaan; daftar yang kosong tetap memakai state kosong.

## Acuan dan peninjauan

Mockup sumber lokal:

- `D:/projkwblampung/output/mockups/landing-mobile-2026-10-05/01-hero-menu.png`
- `D:/projkwblampung/output/mockups/landing-mobile-2026-10-05/02-alur-peta.png`
- `D:/projkwblampung/output/mockups/landing-mobile-2026-10-05/03-verifikasi-cerita-footer.png`

Enam panel dinormalisasi menjadi acuan 471 px. Konversi package 12ui menghasilkan ekstraksi enam panel, tetapi export responsive package gagal (`conversion_parked`). LayerDoc, HTML fixed, dan aset dipulihkan dari ID konversi existing; tidak memesan konversi ulang. Hasil pemulihan digunakan sebagai acuan raster dan layout.

Kit alignment terhadap LayerDoc original disimpan di `alignment-v2/`. Hero melewati coverage 82,4%; panel bawah/menu mempunyai overlap lebih rendah. Capture otomatis beberapa anchor mengambil bagian hero sebelum posisi scroll selesai, sehingga pemetaan selector lintasbagian tidak diterapkan. Hasil browser tiap bagian dibandingkan secara manual dengan panel sumber, sambil mempertahankan kontrol nyata, font existing, dan data API. Kit adalah bukti lokal di luar repo, bukan sumber aplikasi yang perlu dipublikasikan.

Peninjauan mencakup lebar 320, 360, 390, 430, 760, 1024, dan 1440 px serta landscape 844 × 390 px. Tidak ditemukan overflow horizontal halaman atau heading pada ukuran tersebut. Menu buka/tutup/Escape/tautan Peta, carousel dengan panah keyboard dan indikator, serta accordion/dialog footer ditinjau di browser. `npm run typecheck --workspace @sap/web` dan `npm run build --workspace @sap/web` berhasil setelah perubahan. Tidak menambah atau menjalankan suite E2E pada pekerjaan ini; pemeriksaan viewport Chromium tidak menggantikan pengujian perangkat fisik Safari/Android.

Pratinjau hasil disimpan sebagai `mobile-hero-final.png`, `mobile-menu-final.png`, `mobile-workflow-final.png`, `mobile-map-final.png`, `mobile-verification-final.png`, `mobile-stories-final.png`, dan `mobile-footer-final.png` dalam direktori mockup sumber. Screenshot desktop sebelum/sesudah tersedia untuk perbandingan tata letak.

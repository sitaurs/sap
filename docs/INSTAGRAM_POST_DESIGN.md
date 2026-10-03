# Acuan poster Instagram SAP

Instruksi Zamani, 3 Oktober 2026. [Referensi visual](research/assets/sap-instagram-post-reference.png). Melengkapi [kontrak](CONTRACT_ZAKA_ZAMANI.md) dan [rencana backend](BACKEND_EXECUTION_PLAN.md). Ketentuan ini mengatur poster, bukan layout dashboard Zaka.

**Status: implementasi dilanjutkan atas instruksi Zamani.** Template backend ada di `apps/worker/src/poster`; pemeriksaan visual dengan foto laporan nyata dan layanan peta belum dilakukan. Kemiripan final belum dinyatakan terverifikasi.

## Tampilan

Buat semirip mungkin dengan referensi: potret 4:5, latar krem bertekstur, hijau tua dan kuning; logo SAP kiri atas; judul besar/tebal dengan nama kawasan berwarna hijau; baris lokasi dengan ikon; foto lebar dengan potongan diagonal; panel hijau untuk waktu WIB, kategori, dan kode laporan; inset peta kanan bawah dengan bingkai krem; stempel status; CTA kuning “Pantau perkembangan di SAP”, panah, dan ornamen daun/geometris.

Pemenggalan judul mengikuti panjang data nyata tanpa menghilangkan nama lokasi atau menimpa foto. Logo/font/aset template dibundel dan diberi versi. Label simulasi, foto ilustrasi, peta ilustratif, nomor 03, dan SAP-024 tidak disalin ke poster produksi. Poster demo tetap harus ditandai sebagai demo.

## Foto nyata

Gunakan foto bukti yang benar-benar terkait laporan/update/hasil kegiatan dan telah memiliki consent Instagram pemilik, approval moderator, serta rendition siap. Jangan menggantinya dengan foto stok, gambar contoh, foto generatif, atau kejadian lain. Cropping harus tetap menunjukkan bukti utama; redaksi privasi yang disetujui tetap diterapkan. Jika foto/izin belum tersedia atau dicabut, draf tidak siap dan publish ditahan.

## Peta nyata

Jalan, batas wilayah, dan geometri kawasan memakai data geografis nyata untuk lokasi laporan. Warna hijau/kuning mengikuti referensi, tetapi bentuk geografis tidak dikarang. Atribusi sumber/lisensi harus tetap terbaca sesuai kewajiban penyedia.

Peta tetap mengikuti batas lokasi publik dalam kontrak: exact GPS privat tidak dibuka. Pin pada posisi representatif diberi keterangan “Area laporan”, bukan diklaim titik sampah tepat. Nama kawasan/kecamatan/kota harus berasal dari data lokasi yang benar dan disetujui; jangan menyalin Muharto ke laporan lain atau menggunakan H3 ID sebagai nama kawasan.

Simpan snapshot peta dan metadata sumber bersama revisi poster agar preview sama dengan hasil publish. Kegagalan mendapatkan peta nyata harus ditampilkan sebagai kegagalan render, tanpa fallback diam-diam ke peta ilustrasi.

## Data dan approval

Judul, lokasi, waktu, kategori, kode laporan, status, dan caption memakai sumber approved yang sama. Waktu adalah waktu kejadian/observasi, ditampilkan WIB, bukan waktu render. Stempel terverifikasi mengikuti keputusan manusia; hasil sebagian berlabel sebagian dan tidak mengaku kejadian selesai.

Perubahan foto, peta/lokasi, template, atau data relevan mengubah revisi dan membatalkan approval lama sesuai kontrak. Admin melihat poster lengkap dengan foto dan peta nyata sebelum publish. Kemiripan visual dan integrasi belum diperiksa.

## Implementasi peta dan aset

Template `sap-feed-reference-v2` menghasilkan JPEG sRGB 1080 × 1350, maksimum internal 7 MiB. Font Roboto Black dan Roboto Condensed Bold dibundel bersama lisensi Apache 2.0; deploy worker harus menyertakan folder `apps/worker/assets` di samping `dist`.

Peta memakai geometri jalan/sungai dan nama wilayah administratif OpenStreetMap melalui endpoint Overpass HTTPS yang dikonfigurasi operator. Posisi query hanya centroid H3 publik resolution9. Area kuning adalah area H3 laporan, bukan batas kelurahan atau titik sampah persis. Tidak ada exact GPS privat yang dikirim. Data gagal/tidak lengkap menahan render; tidak ada peta rekaan sebagai fallback.

Sumber disimpan dalam cache berversi dengan hash/timestamp; metadata snapshot disimpan bersama poster. Atribusi dan URL lisensi dicetak di inset. Untuk volume produksi gunakan kapasitas endpoint yang disiapkan operator, bukan menganggap layanan publik tanpa batas. Acuan: [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL), [pemakaian instance publik](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [lisensi OSM](https://www.openstreetmap.org/copyright).

Konfigurasi: `SAP_INSTAGRAM_RENDER_ENABLED`, `POSTER_OVERPASS_URL`, `POSTER_MAP_CACHE_HOURS`, dan `POSTER_MAP_DAILY_LIMIT`. Flag render default false. Menyalakan render tidak menyalakan publish; approval admin tetap diperlukan.

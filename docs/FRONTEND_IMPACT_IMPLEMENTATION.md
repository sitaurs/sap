# Frontend Dampak — 4 Oktober 2026

## Halaman dan desain

Admin membuka `/dashboard?view=admin-impact` melalui menu **Dampak**. Role admin tetap diperiksa oleh dashboard. Halaman menggunakan aset PNG yang dipisahkan dari mockup disetujui; CSS hanya berada di `components/impact/impact.module.css`. Shell dashboard dan fitur lain memakai implementasi yang sudah ada.

Susunan: judul → filter → empat metrik → berat per tahap dan cakupan bukti → respons penanganan dan dasar perhitungan. Desktop memiliki empat metrik sejajar; tablet/HP menggunakan dua kolom, dengan panel bukti dan panel penjelasan tersusun vertikal. Tombol **Lihat metode** membuka dialog yang mendukung keyboard dan Escape.

## Kontrak backend yang dipakai

Adapter `lib/api/impact.ts` menggunakan tipe `ImpactSummary` dari `lib/api/r1-schema.d.ts` dan `GET /api/v1/impact/summary?from=…&to=…&cellId=…`. Acuan: `docs/CONTRACT_ZAKA_ZAMANI.md` bagian 13 dan handler `apps/api/src/activities/impact.service.ts`. Tidak ada endpoint baru atau perubahan published contract 1.1.0.

| Tampilan | Field |
| --- | --- |
| Laporan terselesaikan | `resolvedIncidents` |
| Kegiatan disetujui | `approvedActivities` |
| Relawan unik | `uniqueVolunteers` |
| Total kehadiran | `volunteerAttendances` |
| Terkumpul / diserahkan / didaur ulang | `verifiedKg.collected` / `handedOver` / `recycled` |
| Cakupan bukti | `resultsWithVerifiedWeight / approvedResults` |
| Respons penanganan | `medianResolutionHours` |
| Waktu ringkasan / metode | `asOf` / `methodologyVersion` |

### Filter dan aturan angka

- Tanggal ditampilkan dalam Asia/Jakarta. Tanggal akhir di UI inklusif; adapter mengirim batas `to` eksklusif pada tengah malam hari berikutnya. Rentang maksimum 366 hari.
- Cakupan **Semua area** menghilangkan `cellId`. **Area tertentu** menerima ID H3 dari peta SAP; validitas sel penuh tetap diperiksa oleh backend. Tidak membuat daftar wilayah yang tidak tersedia dalam kontrak.
- Pilihan filter belum mengubah data sampai **Terapkan** ditekan. Permintaan sebelumnya dibatalkan saat filter diterapkan lagi atau halaman ditutup.
- `null` pada berat/median tampil **Belum ada data**, sedangkan angka nol yang sah tampil `0,0 kg` atau `0 jam`.
- Berat setiap tahap terpisah dan tidak dijumlahkan. Batang membandingkan tiap tahap terhadap nilai terbesar; bukan persentase penyelesaian dan bukan penjumlahan volume.
- Cakupan memakai hasil kegiatan disetujui yang memiliki berat **terkumpul** terverifikasi. Jika penyebut nol, ring menampilkan `—`, bukan 0%.
- Hasil kegiatan dihitung berdasarkan waktu persetujuan; berat berdasarkan waktu pengukuran, mengikuti handler. Perbedaannya dijelaskan dalam dialog metode.
- Tidak menghitung berat, emisi CO₂, atau nilai ekonomi dari foto. Kesalahan API tidak diganti diam-diam dengan angka contoh.
- Loading, layanan tidak aktif, permintaan gagal, belum ada hasil, sebagian bukti belum terukur, dan cakupan lengkap memiliki tampilan masing-masing.

## Mode contoh development

`NEXT_PUBLIC_SAP_IMPACT_MOCK=1` mengaktifkan adapter read-only khusus Dampak di development. Nilai default dalam `.env.example` adalah `0`; kondisi `NODE_ENV` menonaktifkannya pada production. Flag terpisah dari mock Kegiatan Relawan. Login, role admin, scan, moderasi, dan profil tetap asli.

Data sintetis September 2026 mengikuti mockup: 18 laporan, 12 hasil kegiatan, 86 relawan unik, 124 kehadiran, 684,5 kg terkumpul, 512,0 kg diserahkan, 9/12 hasil terukur, dan median 36 jam. Dua area contoh serta tanggal disaring dari record sintetis, sehingga memilih periode tanpa record menampilkan data kosong. Data ini merupakan fixture desain tersendiri, bukan agregat perubahan mock Kegiatan Relawan. Tidak menulis database, storage cloud, atau Instagram.

Mode ini selalu diberi label **Mockup · data contoh** dan catatan bahwa angka bukan data produksi. File `.env.local` lokal diabaikan Git. Untuk memakai API sebenarnya, set `NEXT_PUBLIC_SAP_IMPACT_MOCK=0` lalu restart frontend.

## Kesiapan backend

Endpoint membutuhkan `SAP_EXTENSION_ENABLED` dan `SAP_ACTIVITIES_ENABLED` serta database/migration yang sesuai. Flag rilis dan migration backend tidak diubah oleh implementasi frontend ini. Kehadiran handler dalam repo belum membuktikan akurasi agregasi pada runtime produksi. Review backend tetap diperlukan sebelum fitur R1 dirilis.

## Berkas utama

- `components/impact/impact-page.tsx`: filter, state API, dan dialog.
- `components/impact/impact-summary.tsx`: kartu, berat per tahap, ring dinamis, metode.
- `components/impact/impact-utils.ts`: tanggal Jakarta dan pemformatan angka.
- `components/impact/impact-assets.ts` dan `public/images/impact/`: aset terpisah.
- `lib/api/impact.ts`, `lib/api/impact-mock.ts`: adapter asli dan fixture khusus development.

TypeScript frontend diperiksa dengan `npm run typecheck -w @sap/web`. Tidak menambah atau menjalankan test suite, provider call, atau migration. Peninjauan visual memakai komponen halaman yang sama di origin preview terpisah dengan data contoh; tidak melewati login dashboard asli.

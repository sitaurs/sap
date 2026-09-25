# HOTSPOT_RULES — Area rawan SAP berdasarkan laporan

v1.0 · Method version `reports-h3-v1` · Pemilik perhitungan: backend. Nama UI: **Area rawan berdasarkan laporan**. Perhitungan ini murni dari laporan termoderasi dan tidak bergantung pada runtime ML/provider.

## 1. Arti keluaran

Area ditandai berdasarkan jumlah kejadian penumpukan unik yang telah diverifikasi dalam rentang waktu. Ini analisis deskriptif, tidak memakai model baru atau menjanjikan penumpukan di masa depan. Tanpa laporan eligible berarti belum ada data; tidak membuktikan area bersih. Banyak pengguna aktif dapat meningkatkan jumlah laporan; label metode menyebut keterbatasan tersebut.

## 2. Unit area dan periode

H3 resolution9 menghasilkan cellId dan polygon stabil, dihitung backend dari koordinat canonical report. Frontend hanya merender GeoJSON. Sel punya ukuran yang bervariasi secara geografis; jangan mengiklankan ukuran meter persegi tetap. Default from=30 hari sebelum to, to=now; filter `[from,to)` berdasarkan occurredAt, disimpan UTC. Batas rentang90 hari. Bbox hanya menyaring sel yang beririsan; hitungan dihitung seluruh isi sel agar angka tidak berubah karena pan/zoom atau pagination.

Jumlah berbeda hari dihitung memakai tanggal Asia/Jakarta. Pagination daftar area hanya untuk tampilan list; endpoint map membatasi bbox/area count dan mengembalikan MAP_BOUNDS_TOO_LARGE bila lebih dari2000 sel, bukan memotong hasil diam-diam. API mengembalikan methodVersion, from,to,asOf,isStale.

## 3. Kejadian eligible

Status verified/in_progress/resolved, canonicalId=null, tidak dibatalkan verifikasinya, occurredAt di periode, category filter cocok jika diberikan. Submitted/rejected/duplicate tidak dihitung. Resolved tetap termasuk historical incidentCount dalam periode; hanya verified/in_progress masuk openIncidentCount. Reopen sebuah kejadian mengubah status open, tidak menambah incidentCount. Scan bukan laporan dan tidak menambah count.

## 4. Tingkat kejadian (baseline produk)

| Kondisi dalam satu sel/periode | riskLevel | Label |
| --- | --- | --- |
| ≥ 5 kejadian unik pada ≥ 2 tanggal berbeda | high | Tinggi |
| ≥ 3 kejadian unik pada ≥ 2 tanggal berbeda, belum high | medium | Sedang |
| 1–2 kejadian, atau semua kejadian pada satu tanggal | low | Rendah |
| 0 kejadian eligible | Tidak ada feature | Belum ada data |

Syarat dua tanggal membedakan kejadian berulang dari beberapa laporan di hari yang sama. Threshold adalah aturan SAP untuk pengurutan perhatian, belum model statistik yang terkalibrasi. Tampilkan count dan periode bersama label. Perubahan threshold/resolution menaikkan methodVersion dan membutuhkan pengujian fixture.

## 5. Deduplikasi

Backend menyarankan kandidat dalam radius100meter dan selisih occurredAt≤ 24 jam, ditambah kesamaan checksum/foto jika ada. Gunakan PostGIS ST_DWithin dengan geography/meter. Kandidat bukan keputusan otomatis: kejadian berdekatan bisa berbeda. Admin membandingkan waktu, foto dan konteks, lalu menandai duplicate dan menunjuk canonical report.

Canonical harus sudah verified/in_progress/resolved, bukan duplicate, tidak boleh self/cycle. Alias duplicate tidak menambah area/poin. Bila canonical dibatalkan, semua alias menjadi perlu review internal dan tidak dihitung; admin dapat reopen alias ke submitted dengan audit sebelum memilih canonical baru. Penumpukan baru setelah pembersihan boleh menjadi report canonical baru bila bukti berbeda; jangan menggabungkan selamanya berdasarkan lokasi.

## 6. Privasi dan UI

Peta publik hanya polygon dan pusat sel, jumlah dan ringkasan teredaksi. Detail publik area berisi ID kejadian, tanggal, kategori, status, ringkasan publik dan media derivative yang disetujui; tidak berisi pelapor, alamat rumah, exact koordinat atau foto private. Pemilik/admin dapat melihat koordinat laporan melalui endpoint terotorisasi. Jangan menggeser pin acak yang menyiratkan lokasi kejadian salah; tampilkan area sebagai area.

## 7. Contoh penerimaan

A:5 laporan dari kejadian yang sama →1 canonical+4 duplicate →count1,low.
B:5 canonical pada3 tanggal →high;2 resolved→open3,resolved2,incident5.
C:5 canonical pada1 tanggal →low dan label "5 kejadian pada 1 hari".
D:3 canonical pada2 tanggal →medium; satu dibatalkan jadi rejected→count2,low.
E:area tak punya laporan→tidak ada polygon risiko, UI "Belum ada data".

Agregasi diperbarui setelah moderasi dan terjadwal tiap5 menit. Cache key memuat from/to/category/cell/methodVersion, bukan seluruh laporan mentah. Saat refresh gagal, tampilkan snapshot terakhir dengan isStale=true dan asOf; jika tak ada snapshot beri503. Algoritme wajib menghasilkan angka identik untuk map, list dan detail area.

## Rujukan implementasi

[H3 indexing dan cell boundary](https://h3geo.org/docs/api/indexing/) menjelaskan pemetaan titik ke sel dan boundary; [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html) untuk radius geography dalam meter. Validasi cellId dengan library H3 dan resolution9, bukan hanya regex; ubah urutan lat/lng hasil library ke lon/lat GeoJSON secara eksplisit.

# Aset halaman komunitas publik

Aset dipisahkan dari gambar referensi yang diberikan pengguna pada 8 Oktober 2026 sebelum implementasi halaman. File WebP mempertahankan piksel sumber; bukan gambar seluruh halaman yang dipakai sebagai antarmuka. Batas potongan asli dicatat dalam manifest.json.

| File | Penggunaan |
| --- | --- |
| incidents-river.webp | Latar hero kejadian publik |
| volunteer-hero.webp | Ilustrasi hero kegiatan relawan, dipotong agar tidak memuat judul antarmuka |
| cleanup-closeup.webp | Ilustrasi kegiatan pengumpulan sampah |
| tree-planting.webp | Ilustrasi kegiatan penanaman |
| community-cleanup.webp | Ilustrasi kegiatan warga di sungai |
| foliage-left.webp, foliage-right.webp | Dekorasi latar desktop |

Logo memakai aset merek SAP yang sudah tersedia dalam proyek. Ikon tindakan memakai Lucide. Teks, filter, navigasi, dan kartu dibuat sebagai komponen React yang responsif.

Gambar kegiatan diberi keterangan **Ilustrasi kegiatan**. Gambar ini tidak menyatakan bahwa dokumentasi atau hasil kegiatan telah disetujui. Foto bukti kejadian tetap berasal dari API PublicEvidence, termasuk pemeriksaan masa berlaku URL. Judul, status, tanggal, kapasitas, dan jumlah dukungan berasal dari API yang sebenarnya.

Konversi awal gambar gabungan oleh 12ui gagal pada layanan upstream; engine lokal juga gagal memulai di Windows. Aset kemudian dipotong secara deterministik dari sumber asli. Setelah implementasi, konversi dan kit penyelarasan untuk masing-masing halaman berhasil diselesaikan di .improve/activities-alignment dan .improve/incidents-alignment-final. Proporsi kartu, warna, batas, ukuran logo, dan jarak diselaraskan dengan referensi. Pemetaan selektor yang memiliki kecocokan rendah ditinjau secara manual agar tidak mengganti konten API dengan teks contoh.

Plate keluaran konversi masih memuat teks dan kartu contoh; cutout logo juga memiliki artefak. Keduanya disimpan sebagai bukti audit, sementara antarmuka memakai potongan aset sumber yang bersih dan logo asli proyek. Kit dan target berada dalam direktori lokal .improve/ yang dikecualikan melalui .git/info/exclude.

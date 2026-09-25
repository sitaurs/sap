# PRD — SAP

v1.0 · Produk web lengkap · Pemilik produk/backend: Anda; UI/UX/frontend: teman Anda.

## 1. Tujuan

Membantu pengguna mengenali jenis sampah melalui foto, melaporkan penumpukan dengan lokasi, dan melihat area yang memiliki kejadian penumpukan berulang. Admin memverifikasi laporan serta mendokumentasikan penanganan. SAP membangun ulang pengalaman web EcoLens dengan brand baru dan model ML yang sama.

## 2. Pengguna

Pengunjung membaca landing dan peta agregat; pengguna terdaftar melakukan scan, melihat riwayat/statistik, melapor dan memantau laporannya; admin memverifikasi bukti, menggabungkan duplikat, memperbarui status dan meninjau area. Tidak diasumsikan ada kerja sama pemerintah atau petugas lapangan otomatis. Penanggung jawab admin ditunjuk saat peluncuran.

## 3. Cakupan rilis lengkap

| Modul | Perilaku |
| --- | --- |
| Akun | Registrasi, OTP verifikasi email, login/logout, lupa/reset password, profil dan hapus akun |
| Scan | Kamera/unggah, inferensi EcoLens ML melalui Gradio self-hosted secara asinkron, kandidat kategori, no_waste/unknown/error yang berbeda, riwayat |
| Dashboard pengguna | Jumlah scan, distribusi kategori, poin, streak, achievements, leaderboard |
| Pelaporan baru | Foto, pin lokasi, waktu kejadian, deskripsi, kategori opsional, status dan timeline |
| Peta baru | Sel area, tingkat kejadian, filter tanggal/kategori, detail kejadian terverifikasi yang teredaksi |
| Admin baru | Antrean laporan, keputusan, kandidat duplikat, bukti penanganan, audit tindakan |
| Fondasi | Aksesibilitas, error/loading states, otorisasi, observabilitas dan kontrak frontend/backend |

Tidak termasuk pekerjaan rilis: training/fine-tuning model, model prediksi penumpukan, pengukuran volume dari foto, marketplace, penjemputan, pemantauan CCTV/satelit, aplikasi native, atau pemindahan akun/data dari database EcoLens lama. Tidak ada janji dampak lingkungan fisik hanya karena pengguna melakukan scan.

## 4. Fitur dasar dan tambahan

Fitur dasar EcoLens yang diperiksa: kamera/unggah, proxy ML, auth, scan tersimpan, statistik, poin, streak, achievements dan leaderboard. Tambahan SAP: laporan geolokasi, moderasi, penanganan, agregasi area rawan. Lihat SOURCE_AUDIT untuk batas pemeriksaan sumber.

## 5. Alur utama

1. Scan: masuk → kamera/unggah → queued/processing → hasil atau kegagalan → riwayat dan aktivitas diperbarui tepat sekali.
2. Lapor: masuk → foto + deskripsi + pin + waktu → tinjau → submitted → admin verify/reject/duplicate → status terlihat oleh pelapor.
3. Peta: pilih kota/viewport dan rentang waktu → area rendah/sedang/tinggi atau tanpa data → detail ringkasan dan kejadian publik yang sudah disunting.
4. Penanganan: admin verified → in_progress → resolved dengan bukti dan catatan; reopen ke verified bila perlu, menyertakan alasan.

## 6. Kepercayaan produk

Satu foto klasifikasi tidak otomatis menjadi laporan lokasi. Model klasifikasi tidak menentukan apakah laporan benar atau sampah telah dibersihkan. Laporan submitted tidak masuk peta. Foto/koordinat rinci hanya untuk pemilik/admin sampai publikasi data yang aman. Area tanpa laporan diberi label belum ada data, tidak diartikan bersih. Ringkasan selalu memiliki periode, waktu pembaruan, jumlah kejadian unik, dan versi metode.

## 7. Gamifikasi dan statistik

Poin dihitung server lewat ledger idempoten. Baseline: +10 per scan classified yang lolos dedup, maksimal 5 scan per hari; +20 per laporan canonical yang pertama kali verified, maksimal 3 per hari. Hari memakai Asia/Jakarta. Scan gagal/unknown/no_waste, report rejected/duplicate tidak memberi poin. Reversal akibat pembatalan verifikasi dicatat sebagai entry kompensasi. Achievements dan leaderboard mengikuti poin bersih; statistik scan berhasil menghitung semua scan classified, termasuk yang melewati kuota poin. Streak memakai hari dengan aktivitas yang mendapat poin, tidak berubah akibat refresh halaman.

Badge rilis: first_scan (1 classified), scanner_10 (10 classified), first_verified_report (1 laporan verified canonical), streak_3 (3 hari aktivitas beruntun). Evaluasi ulang bila aktivitas dibatalkan; badge yang tidak lagi valid ditandai revoked. Angka/aturan ini keputusan SAP, bukan klaim aturan lama.

## 8. Metrik

Keberhasilan scan yang mencapai terminal, rasio unknown/no_waste/failure, waktu respons p95; laporan yang selesai diisi, verifikasi/penolakan/duplikat; usia antrean; persentase laporan verified yang resolved dengan bukti; jumlah area berulang; penyelesaian alur aksesibilitas. Pisahkan user action, status verified, dan aksi nyata. Jangan menampilkan angka dampak atau pertumbuhan rekaan.

## 9. Gerbang rilis

Seluruh FR/NFR wajib lulus. Integrasi nyata layanan EcoLens ML self-hosted, kondisi degradasi, dan jalur laporan manual diperiksa; Hugging Face hanya provenance source/model. Frontend memakai generated types dan fixture yang sama dengan backend. Auth, state laporan, perhitungan area, privasi publik, dedup/poin, audit dan pemulihan diuji. Teman menyetujui UI/frontend; Anda menyetujui backend; keduanya menerima demo alur penuh.

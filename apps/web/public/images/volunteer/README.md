# Aset Ruang relawan

Aset disiapkan dari gambar pertama pengguna sebelum implementasi, 8 Oktober 2026. Seluruh teks, status, tanggal, kapasitas, tombol, pendaftaran, dan penugasan tetap dirender sebagai HTML dari API sebenarnya.

| File | Asal dan penggunaan |
| --- | --- |
| workspace-background.webp | Latar bersih hasil pemisahan 12ui, tanpa judul, kartu, atau data pengguna |
| leaf-neutral.webp, leaf-green.webp, leaf-red.webp | Cutout transparan dekorasi kartu dari 12ui |
| registration-empty.webp | Ilustrasi daftar pendaftaran transparan, diperhalus dengan built-in imagegen |
| assignment-empty.webp | Ilustrasi folder penugasan transparan, diperhalus dengan built-in imagegen |

Konversi referensi 12ui: `4902c4a5-0b4e-4874-908f-1e30f2a9f2df`; responsive export: `02b4e5b2-c668-4afb-9cfb-772c3a4992e1`. Source: `codex-clipboard-a2d043d8-7526-40ca-bb1f-13bfb47a980f.png`, 952 × 626. Ikon tindakan memakai Lucide, bukan potongan teks atau tombol dari screenshot.

Prompt imagegen untuk masing-masing aset: extract and faithfully refine only the checklist document / open file folder illustration above the empty-state title. Keep the pale mint circular glow, soft gray outline, vivid emerald leaf at the lower right, sparse pale green leaves and diamond sparkles. Preserve the gentle watercolor and soft vector style. Output actual transparent alpha with no text, interface cards, screenshot background, rectangular tile, logos, or extra objects. Blend seamlessly into a white card.

Optimasi mempertahankan alpha dan membatasi ukuran ilustrasi untuk layar desktop dan mobile. Tidak ada data contoh dari gambar referensi yang disimpan sebagai isi kegiatan aplikasi.

## Pendaftaran dan penugasan terisi — 9 Oktober 2026

Referensi disetujui: `codex-clipboard-2dd826b7-a1d2-4a81-a9d4-537cdc241ae6.png`, 1402 × 1122. Konversi 12ui: `fe4708a6-c791-4034-ace4-a1caf4e5fa9c`; responsive export: `8f0439d6-11d0-49ab-a8e6-6146766b858f`.

| File | Ekstraksi | Penggunaan |
| --- | --- | --- |
| workspace-populated-background.webp | clean plate 0 | Latar alam dan kota yang bersih dari semua kartu, tulisan, dan data contoh |
| member-leaf.webp | cutout 67 | Dekorasi transparan kartu pendaftaran |
| assignment-leaf.webp | cutout 134 | Dekorasi transparan kartu penugasan |

Aset dioptimalkan ke WebP; daun mempertahankan alpha. Struktur panel, badge, ikon Lucide, jadwal, formulir persetujuan, dan tombol dibuat sebagai komponen HTML interaktif. Seluruh isi mengikuti API. Label data contoh, lokasi, waktu, nama, dan jumlah dari mockup tidak digunakan dalam aplikasi. Jadwal pada kartu publik dan pendaftaran berasal dari kegiatan yang sama; izin menampilkan nama koordinator tetap opsional dan tidak tercentang otomatis.

Perbandingan menggunakan target LayerDoc yang sama dengan `12ui improve`; plan melewati coverage gate DOM (87%). Warna, radius, susunan panel, dekorasi, dan hierarki mengikuti target. Font aplikasi dipertahankan agar konsisten dengan dashboard; ikon fungsi menggunakan Lucide. Penugasan yang tidak menyediakan lokasi pada respons API menampilkan referensi laporan, tanpa mengarang lokasi. Pengujian hanya memakai fixture sintetis; tidak membuat pendaftaran atau penugasan di produksi.

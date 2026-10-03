# SAPA — paket aset pose animasi v1

Dibuat pada 2 Oktober 2026 menggunakan skill **imagegen**, melalui tool image generation bawaan.

Karakter mengikuti SAPA yang sudah ada: robot hijau, wajah ivory, dua daun di kepala, aksen cyan pada telinga, tangan pendek dan emblem daun pada dada.

## Isi paket

| Berkas | Isi | Urutan |
| --- | --- | --- |
| sapa-master.png | Pose dasar seluruh tubuh | Satu gambar |
| sapa-idle-blink-sheet.png | Diam, napas kecil, kedipan | 8 pose |
| sapa-wave-sheet.png | Menyapa dengan satu tangan | 8 pose |
| sapa-curious-sheet.png | Menoleh dan memperhatikan | 8 pose |
| sapa-thinking-sheet.png | Bekerja dengan tablet | 8 pose |
| sapa-success-jump-sheet.png | Bersiap, melompat, mendarat | 8 pose |
| sapa-helpful-error-sheet.png | Ekspresi prihatin lalu ramah | 8 pose |
| manifest.json | Ukuran gambar, koordinat sel, timing usulan dan anchor per pose | Data untuk integrasi berikutnya |
| prompts.json | Prompt final untuk setiap gambar terpilih | Reproduksi dan revisi |
| inspect_assets.py | Membaca metadata dan menghitung anchor; tidak mengubah gambar | Utilitas analisis aset |

Total: satu master dan enam sprite sheet, berisi **48 pose**.

Seluruh PNG terpilih memiliki kanal alpha/transparansi. Aset lama pada aplikasi tidak ditimpa.

## Cara membaca sprite sheet

Setiap sheet berisi **4 kolom × 2 baris**:

1. Baris atas: frame 0, 1, 2, 3.
2. Baris bawah: frame 4, 5, 6, 7.

Gunakan ukuran aktual pada manifest. Output gambar berukuran 1774 × 887 piksel, sehingga sel matematisnya 443,5 × 443,5 piksel. Jangan menganggap selnya 256 atau 512 piksel; koordinat sumber dalam manifest menggunakan nilai pecahan agar batas sel tetap konsisten.

## Status dan penggunaan

Paket sudah diintegrasikan pada frontend `apps/web` melalui `sapa-sprite.tsx` dan `sapa-pet.tsx`. Salinan PNG asli berada di `apps/web/public/images/sapa/animation-v1/`; artwork tidak diubah. Timing pada manifest menjadi dasar pemutaran dengan jeda per pose, bukan delapan frame berdurasi sama.

`build-playback-data.py` membaca piksel asli untuk menghasilkan `sapa-motion-data.ts`. Registrasi memakai titik tengah kedua kaki dan baseline tetap. Ini memperbaiki pergeseran posisi antarpose, terutama pada sheet berpikir. Renderer menambahkan lintasan lompatan secara terpisah setelah registrasi.

Pemutar Canvas memakai waktu aktif, maksimal 30 redraw/detik, tanpa render React per frame. Ukuran launcher desktop 112 × 130 px, mobile 90 × 106 px; karakter berada pada kanvas persegi dan label SAPA di bawahnya. Sheet dimuat saat dibutuhkan dan digunakan kembali. Animasi berhenti saat tab tidak terlihat, saat diseret, atau ketika pengguna memilih pengurangan gerakan.

Anchor merupakan perkiraan dari piksel hijau yang cukup opak pada bagian bawah tubuh, bukan data rig asli. Manifest menyimpan perkiraan awal; metadata runtime memakai midpoint kedua kaki, bukan median yang dapat condong ke satu kaki.

Tetap gunakan kanvas tetap dengan ruang kosong di sekitar tubuh. Jangan memotong setiap pose berdasarkan siluetnya sendiri lalu memusatkan ulang, karena tinggi lompatan dan gerakan kepala dapat hilang.

## Timing awal

- **Idle:** siklus 8 detik, sebagian besar menahan pose; kedipan sekitar 170 ms. Jangan memutar delapan pose dengan durasi sama.
- **Menyapa:** sekitar 800 ms, sekali ketika panel dibuka.
- **Penasaran:** sekitar 800 ms, sekali saat hover/fokus; beri jeda sebelum mengulang.
- **Berpikir:** siklus 1,6 detik, berulang selama request AI masih berjalan.
- **Berhasil:** sekitar 640 ms, satu lompatan ketika hasil sukses diterima.
- **Gagal:** sekitar 900 ms, sekali setelah kegagalan request; tampilkan pesan error yang jelas di UI.

Keadaan berpikir/berhasil/gagal mengikuti request nyata. Tidak membutuhkan API per frame. Area klik dan drag tetap stabil.

## Prompt dan sumber

Prompt lengkap ada di prompts.json. Referensi sumber adalah dua gambar SAPA yang sudah tersimpan di proyek. Paket final dipilih setelah inspeksi bentuk, arah tangan dan keberadaan alpha; alternatif yang tidak dipilih tidak disertakan.

Chat langsung terbuka sambil SAPA melambaikan tangan. Hover/fokus memainkan pose penasaran dengan cooldown 5 detik. Request chat/scan yang berjalan memicu pose tablet; hanya hasil nyata yang memicu pose berhasil atau gagal. Scan berstatus queued/processing setelah batas polling tidak dianggap sukses. Preferensi akun dan endpoint backend tetap digunakan.

Status pemeriksaan implementasi dan catatan backend dicatat pada `contract.md`. Implementasi ini belum di-commit atau di-push.

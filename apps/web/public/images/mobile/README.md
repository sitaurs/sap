# Aset navigasi mobile SAP

`sapa-dock.webp` adalah ilustrasi transparan SAPA untuk bilah bantuan versi awal. Ukuran file 256 × 256 px. Aset dipertahankan sebagai referensi desain; launcher saat ini memakai sprite animasi desktop sesuai permintaan berikutnya dari pemilik proyek.

- Dibuat dengan imagegen menggunakan `../sapa/SAPA_Chat_Avatar.png` sebagai acuan identitas SAPA.
- Prompt: robot SAPA hijau zamrud, wajah krem, mata terbuka, senyum ramah, dua daun di kepala; tampak depan kepala dan bahu; latar transparan, tanpa teks, properti, atau bingkai. Sederhanakan detail agar terbaca pada 42 px.
- Master PNG disimpan pada output generator di luar repository. Sharp hanya memangkas margin transparan, menyesuaikan ukuran, dan mengompres WebP.
- Logo tetap menggunakan aset SAP asli. Ikon navigasi berupa Lucide SVG melalui komponen React agar tajam pada berbagai kepadatan layar.

Pet mobile dan desktop kini sama-sama memakai `../sapa/animation-v1/` melalui `SapaSprite`. Bilah bantuan memakai ikon Sparkles dan membuka percakapan yang sama, sehingga tidak menampilkan karakter kedua.

# Kamera SAP — implementasi

## Komponen dan aset

- `components/camera-capture.tsx`: dialog aksesibel, preview langsung, tombol kamera, tinjau foto/ambil ulang.
- `components/camera-capture.module.css`: modal desktop, layar penuh mobile, reduced motion, safe area.
- `components/use-camera.ts`: izin kamera, daftar webcam, ganti kamera, senter bila didukung, capture JPEG, pengelolaan MediaStream.
- `public/images/camera/focus-frame.svg`: empat sudut mint terpisah dan tajam pada berbagai ukuran.
- `public/images/camera/camera-idle.svg`: ilustrasi vektor untuk keadaan kamera belum tersedia.
- Ikon menggunakan sistem `lucide-react` dashboard. Foto botol dari mockup tidak digunakan sebagai kamera palsu.

## Alur

1. Buka kamera menampilkan dialog dan meminta izin video tanpa mikrofon.
2. Desktop menggunakan modal putih lebar dan pilihan webcam; HP menggunakan layar penuh dengan kontrol di bawah. Senter hanya tampil bila perangkat mendukungnya.
3. Ambil foto membuat JPEG lokal, maksimal sisi panjang 1600 px; kamera dihentikan dan foto ditinjau.
4. Ambil ulang membuka kamera kembali. Gunakan foto mengembalikan hasil ke halaman scan.
5. Pindai dengan AI menggunakan alur `createBackendScan` yang sudah ada. Tidak ada unggahan sebelum langkah ini dan tidak ada perubahan kontrak backend.
6. Keluar/Escape, navigasi halaman, atau berpindah aplikasi menghentikan kamera. Permintaan izin yang terlambat juga dibersihkan.

## Keadaan alternatif

- Izin ditolak: petunjuk izin situs, coba lagi, unggah foto.
- Kamera tidak tersedia/dipakai aplikasi lain: pesan yang sesuai dan alternatif unggah.
- Halaman tidak aman: penjelasan HTTPS/localhost. Jangan menghapus pengamanan browser atau mengandalkan file picker sebagai kamera langsung.
- Kamera dijeda saat aplikasi tidak aktif: tombol coba lagi.

## Referensi dan batasan

Desain mengikuti mockup kamera SAP yang disetujui. Konversi 12ui tidak dapat dipakai karena pemeriksaan persetujuan otomatis menolak pengiriman gambar ke layanan eksternal; elemen dipisahkan secara lokal sebagai komponen dan SVG.

Kamera langsung memerlukan HTTPS atau localhost dan izin perangkat. Dukungan torch/daftar kamera mengikuti browser dan hardware. Preview mobile menggunakan cover dan hasil tangkapan mengikuti area preview yang terlihat.

Dokumentasi: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

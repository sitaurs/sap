# Catatan perubahan frontend SAP

## 4 Oktober 2026 — Kegiatan relawan admin

Menu admin kegiatan relawan, daftar dan detail kegiatan, buat/edit draf, pengelolaan peserta/kehadiran, pengiriman hasil, serta tinjauan hasil/berat/versi foto publik telah ditambahkan. Empat aset status dipisahkan; foto bukti tetap berasal dari backend sesuai izin akses.

Mapping endpoint, payload, concurrency, idempotency, aturan privasi, kesiapan backend, dan batas implementasi dijelaskan dalam [catatan implementasi kegiatan](docs/FRONTEND_ACTIVITIES_IMPLEMENTATION.md).

Acuan bersama tetap [kontrak Zaka–Zamani](docs/CONTRACT_ZAKA_ZAMANI.md) dan [draft R1](contracts/r1/README.md). Published OpenAPI 1.1.0 tidak dipromosikan dalam perubahan ini. Konfigurasi secret, migration, dan flag rilis tidak diubah.

## 4 Oktober 2026 — Mode mock kegiatan pada frontend utama

Atas permintaan pemilik proyek, kegiatan relawan dapat dicoba di `/dashboard?view=admin-activities` pada server development port 3000 tanpa mengaktifkan backend R1. Mode ini diberi banner **Mode mock** dan diaktifkan lokal dengan `NEXT_PUBLIC_SAP_ACTIVITIES_MOCK=1`. Flag ditolak pada production.

- Adapter khusus kegiatan menyediakan data contoh, CRUD draf, perubahan status, peserta/kehadiran, hasil, keputusan berat, versi foto publik, pagination, revisi, dan idempotency.
- State contoh disimpan di `localStorage`; foto yang dipilih disimpan di IndexedDB browser. Tidak dikirim ke API, storage cloud, Instagram, atau database backend.
- Login dan role admin tetap menggunakan layanan asli. API scan, profil, moderasi, dan fitur lain tidak dialihkan ke mock.
- Persetujuan koordinator mempunyai tombol simulasi yang hanya muncul pada mode mock; persetujuan asli tetap dilakukan oleh koordinator melalui backend.
- Tidak menambah endpoint backend atau mengubah aturan rilis R1. Hapus/set `NEXT_PUBLIC_SAP_ACTIVITIES_MOCK=0` dan restart frontend untuk memakai adapter API asli.

Detail penyimpanan, aset, dan batas simulasi terdapat dalam [catatan implementasi kegiatan](docs/FRONTEND_ACTIVITIES_IMPLEMENTATION.md#mode-mock-development-di-port-3000).

## 4 Oktober 2026 — Perapian detail kegiatan relawan

Perubahan pada `activityScreen=detail`: kartu laporan sumber memisahkan ikon, label, dan ID; bagian titik kumpul, perlengkapan, aksesibilitas, dan serah terima memiliki jarak serta pemisah yang konsisten. Ringkasan, peserta, hasil kegiatan, dan riwayat menggunakan navigasi horizontal. Panel status, kuota, dan koordinator mengikuti lebar layar.

CSS baru berada di `apps/web/components/activities/activity-detail.module.css` dan hanya diimpor oleh komponen detail. Tindakan utama tetap mengikuti capability backend; tindakan lainnya tersedia melalui panel yang dapat dibuka. Tautan peta memakai koordinat titik kumpul yang sudah tersedia. Payload, endpoint, role, autentikasi, aturan status, dan revisi API tidak berubah.

## 4 Oktober 2026 — Halaman Dampak admin

Menu **Dampak** ditambahkan di `/dashboard?view=admin-impact` mengikuti mockup disetujui. Dua belas aset dipisahkan sebelum integrasi. Halaman mempunyai filter periode/area, empat metrik, berat per tahap, cakupan bukti, median respons, dan dialog dasar perhitungan dengan tampilan responsif.

Adapter membaca `GET /api/v1/impact/summary` memakai tipe draft R1 yang sudah ada. Batas tanggal dikonversi ke waktu Jakarta dengan `to` eksklusif. Berat `null` berbeda dari nol; tiap tahap tidak dijumlahkan; cakupan mengikuti pengukuran terkumpul. Endpoint, migration, autentikasi, secret, flag backend, dan published contract tidak diubah.

Mode pratinjau lokal memakai flag terpisah `NEXT_PUBLIC_SAP_IMPACT_MOCK=1`, hanya development, selalu berlabel data contoh. Angka sintetis Dampak bukan agregat perubahan mock Kegiatan Relawan dan tidak ditulis ke backend. Detail mapping dan aturan perhitungan untuk review backend ada dalam [catatan implementasi Dampak](docs/FRONTEND_IMPACT_IMPLEMENTATION.md).

## 4 Oktober 2026 — Tipografi dialog metode Dampak

Dialog **Lihat metode** memakai teks isi 14 px dengan kontras lebih jelas, judul bagian 15 px, jarak konsisten, dan paragraf lebih pendek. Definisi relawan unik serta total kehadiran ditampilkan sebagai daftar. Catatan berat yang belum diketahui versus nol dan metadata versi/waktu dirapikan; waktu tetap WIB. Semua perubahan CSS dibatasi pada dialog Dampak. Aturan perhitungan, data, dan kontrak API tetap sama.

## 4 Oktober 2026 — Navigasi mobile, Akun & menu, Pusat admin

Navigasi dashboard pada viewport **≤760 px** mengikuti mockup mobile yang disetujui. Navbar bawah mempunyai lima tujuan: **Beranda, Laporan, Scan, Peta, Akun**. Menu tambahan tersedia di `/dashboard?view=account`; akun admin mempunyai pintu **Pusat admin** di `/dashboard?view=admin-menu`. Di atas breakpoint tersebut, sidebar, header, halaman, tipografi, dan animasi SAPA desktop menggunakan tampilan sebelumnya.

- Nama, role, foto profil, dan preferensi SAPA tetap berasal dari akun asli. Foto menggunakan signed media URL yang sama; logout memakai handler/API yang sama. Tidak ada akun atau hak akses contoh dalam dashboard utama.
- Pusat admin mengarah ke Moderasi laporan, Kegiatan relawan, Dampak, Pengaturan scan, dan Publikasi Instagram melalui view yang sudah ada. Visibility dan guard mengikuti `user.role === "admin"`; otorisasi backend tetap wajib.
- Bilah SAPA mobile memakai aset transparan baru `sapa-dock.webp` yang dibuat terpisah melalui imagegen. Ketukan membuka chat SAPA asli. Jika preferensi SAPA mati, bilah menampilkan tautan Bantuan.
- Navigasi mobile memakai native history agar Back browser/Android dapat kembali antar menu. URL tetap dibatasi daftar view yang valid. Menu mobile pada layar desktop dipetakan ke Pengaturan/Moderasi yang sudah ada.
- Safe area, area scroll di atas navbar, input 16 px, pengurangan animasi, dan layout chat pada viewport pendek ditambahkan. Navbar dan SAPA tetap disembunyikan ketika wizard laporan aktif.

**Dampak backend:** tidak menambah atau mengubah endpoint, payload, schema, auth/CSRF, feature flag, database, model ML, atau aturan perhitungan. Adaptor mock Kegiatan/Dampak sebelumnya tetap terpisah dan tidak diubah oleh navigasi ini. Mapping komponen, rute, aset, dan batas pemeriksaan ada dalam [catatan navigasi mobile](docs/FRONTEND_MOBILE_NAVIGATION.md).

## 4 Oktober 2026 — Perbaikan mobile kegiatan relawan dan pet SAPA

Daftar kegiatan mobile sebelumnya mewarisi area grid dua kolom serta tujuh kolom tabel desktop. Pada ≤760 px, daftar, ringkasan, dan antrean kini disusun vertikal; setiap kegiatan menjadi kartu dengan foto, judul, status, jadwal, jumlah peserta, serta koordinator. Tidak ada perubahan data atau handler kegiatan. Capture daftar pada desktop 1920×1080 sebelum/sesudah identik. Detail ada dalam [catatan kegiatan](docs/FRONTEND_ACTIVITIES_IMPLEMENTATION.md#perbaikan-daftar-kegiatan-pada-mobile--4-oktober-2026).

Sesuai permintaan berikutnya, pet SAPA mobile tampil mengambang dengan karakter dan sprite animasi desktop yang sama. Pet dapat diketuk dan diseret, dengan batas di atas navbar. Bilah SAPA membuka chat yang sama melalui ikon Sparkles; ilustrasi bilah statis sebelumnya menjadi referensi. Posisi pet mobile dan desktop disimpan terpisah di browser. Preferensi pengguna, autentikasi, chat API, dan guard wizard tetap sama. Detail ada dalam [catatan navigasi mobile](docs/FRONTEND_MOBILE_NAVIGATION.md#pet-sapa-animasi-pada-mobile--4-oktober-2026).

**Untuk backend:** tidak ada endpoint, payload, schema, migration, auth/CSRF, role, feature flag, atau model ML yang berubah. Pemeriksaan visual menggunakan komponen asli dengan data sintetis di luar repo; tidak menjalankan mutasi backend atau suite test.

## 4 Oktober 2026 — Chat SAPA gagal karena kuota Redis

Log backend pada 21.20–21.21 WIB mencatat `POST /api/v1/assistant/chat` gagal di penyimpanan/rate limiter Redis: `max requests limit exceeded`, batas 500.000, pemakaian 500.002. Kegagalan terjadi sebelum panggilan provider AI. Penyebab ini terpisah dari sprite dan posisi pet mobile.

- `apps/api/src/assistant/assistant-store.ts` menangani kegagalan Redis pada pembacaan, penyimpanan, penghapusan percakapan, serta rate limiter sebagai **503 `ASSISTANT_UNAVAILABLE`**. Envelope tetap `{ error: { code, message }, meta: { requestId } }`.
- Waktu tunggu koneksi/perintah dibatasi 5 detik; retry koneksi dibatasi dua kali, retry per request satu kali, dan replay otomatis perintah yang belum mendapat jawaban dimatikan. Saat gagal ada cooldown 30 detik per proses. Kuota provider habis menghentikan koneksi SAPA agar tidak terus reconnect.
- Log SAPA hanya memuat event `sapa_store_unavailable` dan kategori `quota_exceeded`, `timeout`, atau `connection_unavailable`. Tidak mencatat URL Redis, kredensial, ID akun, atau isi chat.
- `apps/web/components/sapa-client.ts` menampilkan pesan bahasa Indonesia untuk respons server 5xx. Input yang gagal tetap dipertahankan oleh panel chat agar dapat dikirim ulang oleh pengguna.
- Rate limit akun, TTL percakapan, session/CSRF, preferensi SAPA, serta pemisahan percakapan per pengguna tetap berlaku. Kegagalan Redis tidak menghasilkan jawaban contoh atau melewati limiter.

**Tindak lanjut operasional backend:** periksa Usage/Billing database Redis pada Upstash dan pulihkan kuota, atau sediakan konfigurasi Redis development yang terpisah. Build tidak dapat memulihkan kuota cloud. Redis URL, paket berbayar, database, worker, dan konfigurasi secret tidak diubah. Respons 503 memakai kode SAPA yang sudah tersedia dalam OpenAPI 1.1.0; tidak menambah endpoint/payload baru.

**Pemeriksaan:** build TypeScript backend dan typecheck frontend berhasil; backend direstart dengan hasil build baru dan kembali listen pada port 3001, frontend tetap pada 3000. Percakapan AI yang berhasil belum dapat dikonfirmasi selama kuota Redis belum dipulihkan. Tidak menjalankan suite test atau mengirim pesan melalui akun pengguna.

## 4 Oktober 2026 — Sinkronisasi sebelum commit dan push

Perubahan digabungkan di atas dua commit backend terbaru `bde4350` dan `a8fc966` dari `origin/main`. Konflik SAPA diselesaikan dengan mempertahankan lease/token percakapan, operasi append/delete atomik, dan rate counter Lua milik backend; penanganan Redis 503 diterapkan juga pada acquire/renew/release lease. Catatan status backend terbaru dalam `docs/SAPA_ASSISTANT.md` tetap dipertahankan. Types frontend R1 diregenerasi dari kontrak terbaru teman backend.

Commit mencakup frontend Kegiatan Relawan, Dampak, navigasi mobile, pet SAPA, aset terpisah, adapter mock development, penanganan error SAPA, dan dokumentasi handoff. File `.env` asli serta `.env.local` tetap diabaikan Git; hanya `.env.example` berisi contoh konfigurasi yang disertakan. Isi yang akan dikirim diperiksa terhadap pola kredensial dan nilai secret dari konfigurasi lokal tanpa menampilkan nilainya. Tidak mengubah konfigurasi secret atau menjalankan migration.

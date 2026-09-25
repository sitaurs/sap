# SAPA — Pet Chatbot Assistant (Fitur Tambahan)

> **Status:** usulan fitur tambahan yang diminta **Zaka** (UI/UX + frontend) untuk melengkapi SAP. MVP bersifat **read-only** dan **opsional** — tidak mengubah alur inti. Endpoint di dokumen ini **belum ada di `contracts/openapi.json` v1.0**; perlakukan sebagai proposal yang harus masuk lewat PR kontrak (lihat §13) sebelum diimplementasikan. Nama dan konvensi mengikuti paket handoff: **Zaka = frontend, Zamani = backend**.

## 1. Konsep

**SAPA** adalah teman virtual kecil untuk membantu pengguna memahami fitur SAP (Sustainable AI Platform). Bentuknya maskot sederhana yang menggabungkan daun dan bingkai scan, mengikuti logo serta palet hijau-biru SAP.

Konsep ini cocok karena SAP punya beberapa alur—scan, laporan, peta, riwayat, dan pencapaian—yang mungkin perlu dijelaskan. SAPA dibuat **opsional dan tidak menghalangi pekerjaan utama**.

## 2. Perilaku utama

| Aksi pengguna | Perilaku SAPA |
|---|---|
| SAPA aktif | Ikon maskot kecil tampil di pojok kanan bawah halaman setelah pengguna masuk. |
| Ikon SAPA ditekan | Membuka panel chat kecil dengan sapaan singkat dan pertanyaan cepat. |
| Panel ditutup atau diminimalkan | Chat menghilang; pilihan SAPA tetap aktif. |
| SAPA dinonaktifkan di Pengaturan | Ikon dan sapaan SAPA disembunyikan. Pengguna tetap bisa membuka halaman Bantuan. |
| SAPA diaktifkan lagi | Ikon muncul kembali, tetapi chat tidak terbuka sendiri. |

Di **Pengaturan**, tambahkan baris “Teman virtual SAPA” dengan sakelar aktif/nonaktif dan keterangan: “Tampilkan pintasan bantuan SAPA di halaman aplikasi.”

## 3. Tampilan

### Desktop

- Ikon pet berukuran sekitar 52–56 px, menempel di kanan bawah dengan jarak aman dari tombol utama.
- Saat ditekan, tampilkan panel sekitar 360 × 480 px di atas ikon.
- Kepala panel: “SAPA · Asisten SAP”, status “Siap membantu”, tombol minimalkan dan tutup.
- Area percakapan sederhana, maksimal 2–3 gelembung pesan terlihat sebelum dapat digulir.
- Bagian bawah memuat kolom “Tanya tentang SAP…” dan tombol kirim.
- Sediakan chips awal: “Cara scan”, “Buat laporan”, dan “Baca peta”.

### Ponsel

- Ikon tetap kecil di kanan bawah dan tidak menutupi tombol kamera, kirim, atau navigasi.
- Saat ditekan, panel menjadi bottom sheet setinggi sekitar 70–80% layar.
- Kolom ketik tetap terlihat saat keyboard dibuka; tombol tutup mudah dijangkau.

## 4. Bantuan kontekstual

SAPA dapat menampilkan saran sesuai halaman yang sedang dibuka:

- **Scan:** “Bagaimana cara mengambil foto yang jelas?”
- **Laporan saya:** “Apa arti status laporan?”
- **Peta area:** “Mengapa area ini belum memiliki data?”
- **Riwayat scan:** “Jelaskan hasil scan.”
- **Pencapaian:** “Bagaimana cara membuka lencana?”
- **Pengaturan:** “Bagaimana foto dan lokasi saya digunakan?”
- **Bantuan:** pintasan ke FAQ yang sesuai.

Contoh jawaban:

> **Pengguna:** Mengapa laporan saya belum muncul di peta?
> **SAPA:** Peta menampilkan laporan yang sudah diverifikasi. Laporan yang baru dikirim masih menunggu pemeriksaan. Buka **Laporan saya** untuk melihat statusnya.

Jawaban harus singkat, ramah, dan memberi langkah berikutnya. SAPA boleh mengarahkan pengguna ke halaman terkait, tetapi tidak mengirim laporan, mengubah status, atau memutuskan validitas laporan atas nama pengguna.

## 5. Privasi dan batas fungsi

- Jangan meminta akses foto, kamera, lokasi, atau akun hanya untuk membuka chat.
- Gunakan informasi halaman yang sedang dilihat hanya untuk memberi petunjuk yang relevan.
- Lokasi dan foto laporan bersifat privat sampai publikasi data yang aman; SAPA tidak boleh membocorkan rincian laporan.
- Percakapan MVP disimpan sementara di sesi aktif. Riwayat permanen hanya ditambahkan jika nanti ada keputusan privasi dan persetujuan pengguna.
- Jika jawaban tidak diketahui, katakan demikian dan arahkan ke Bantuan; jangan membuat data, statistik, atau kepastian lingkungan.

## 6. Gaya visual dan aksesibilitas

- Maskot sederhana dan dewasa: daun kecil, aksen scan, ekspresi tenang; hindari animasi ramai atau tampilan kekanak-kanakan.
- Ikuti warna SAP: hijau hutan, biru laut, latar netral hangat, dan permukaan putih.
- Animasi pembuka singkat dan dapat dihentikan; hormati preferensi reduced motion.
- Semua fungsi bisa diakses dengan keyboard, memiliki label pembaca layar, fokus terlihat, dan kontras teks yang memadai.
- Chat dapat ditutup dengan tombol yang jelas dan tombol Escape.

## 7. Kriteria MVP

1. Pengguna dapat mengaktifkan atau menonaktifkan SAPA dari Pengaturan.
2. Menekan ikon membuka chat; menutup chat tidak menonaktifkan SAPA.
3. SAPA tidak muncul otomatis dan tidak menutupi aksi utama.
4. Saran mengikuti halaman yang sedang dibuka.
5. Isi jawaban mengikuti aturan SAP tentang status scan, laporan, peta, dan privasi.
6. Jika chatbot gagal, pengguna tetap dapat memakai halaman Bantuan.

---

# Handoff Backend: SAPA

Bagian ini adalah spesifikasi tambahan untuk **Zamani** (backend SAP). Paket SAP menetapkan NestJS, PostgreSQL, Redis, cookie session, CSRF, dan OpenAPI sebagai sumber kontrak. Endpoint di bawah adalah **usulan baru**; endpoint ini **belum ada di `contracts/openapi.json` v1.0** dan harus masuk lewat PR kontrak dulu.

## 8. Ruang lingkup backend

SAPA membantu navigasi dan menjelaskan aturan fitur. Pada MVP, SAPA bersifat **read-only**:

- Menjawab dari FAQ dan panduan SAP yang disetujui.
- Menyertakan saran halaman tujuan yang berasal dari daftar rute yang diizinkan.
- Tidak membuat atau mengubah scan/laporan, memverifikasi laporan, membaca foto, mengambil GPS, menghitung poin, atau mengubah data akun.
- Jika memakai model bahasa, gunakan adapter provider di server. Provider tidak ditentukan di brief ini; jangan mengunci kontrak API pada satu vendor.
- Mulai dari pencarian FAQ/intent yang terkurasi. Model bahasa dapat ditambahkan di belakang kontrak yang sama.

## 9. Perubahan kontrak API yang diusulkan

Semua route memakai prefix **/api/v1**, envelope respons, cookie session, validasi DTO, dan error format SAP yang sudah ditetapkan.

| Method dan route | Akses | Tujuan |
|---|---|---|
| GET /auth/me | Session | Tambahkan field `sapaEnabled` pada DTO User agar UI mengetahui preferensi saat bootstrap. |
| PATCH /users/me/preferences | Session + CSRF | Simpan sakelar SAPA untuk akun yang sedang login. |
| POST /assistant/chat | Session + CSRF | Kirim satu pesan dan menerima jawaban serta saran halaman. |
| DELETE /assistant/conversations/{conversationId} | Session + CSRF | Hapus konteks percakapan sementara milik pengguna. |

### DTO preferensi

Tambahkan **`sapaEnabled: boolean`** pada DTO User. Nilai awal yang disarankan **true**: ikon terlihat setelah login, tetapi panel chat tidak pernah terbuka sendiri.

Request PATCH hanya menerima:

    {
      "sapaEnabled": false
    }

Respons sukses mengikuti envelope SAP:

    {
      "data": { "sapaEnabled": false },
      "meta": { "requestId": "<request-id>" }
    }

Jangan menerima `userId` atau `role` dari body. Ambil identitas akun dari session server. Update hanya field preferensi yang diizinkan.

### Request chat

    {
      "message": "Kenapa laporan saya belum muncul di peta?",
      "pageContext": "my_reports",
      "conversationId": null
    }

Validasi:

- `message` wajib, trim whitespace, panjang 1–2000 karakter.
- `pageContext` adalah enum: `dashboard`, `scan`, `my_reports`, `areas`, `scan_history`, `achievements`, `settings`, `help`.
- `conversationId` opsional/null saat memulai percakapan; setelah itu gunakan ID opaque yang dikeluarkan server.
- Jangan menerima URL halaman bebas, `userId`, `role`, `reportId`, koordinat, token, foto, atau isi form privat dari frontend.
- Jika `sapaEnabled` false, kembalikan 403 dengan kode `ASSISTANT_DISABLED`.
- Bila pengguna mengirim ulang pesan, frontend menonaktifkan tombol kirim saat request berlangsung. Terapkan deduplikasi request di Redis jika provider berbayar perlu perlindungan tambahan dari retry ganda.

### Response chat

    {
      "data": {
        "conversationId": "<uuid-dari-server>",
        "reply": "Peta menampilkan laporan yang sudah diverifikasi. Laporan baru masih menunggu pemeriksaan.",
        "suggestedActions": [
          { "label": "Buka Laporan saya", "target": "my_reports" }
        ]
      },
      "meta": { "requestId": "<request-id>" }
    }

`target` hanya boleh berupa enum rute yang disetujui, bukan URL bebas. Frontend memetakan `target` ke route internal. Output provider harus divalidasi sebelum dikirim sebagai DTO.

### Hapus percakapan

DELETE hanya dapat menghapus `conversationId` yang dimiliki session saat ini. Respons memakai envelope standar. Percakapan yang tidak ditemukan atau bukan milik pengguna mengembalikan 404 tanpa membocorkan pemiliknya.

## 10. Penyimpanan, privasi, dan konfigurasi

- Tambahkan kolom `users.sapa_enabled BOOLEAN NOT NULL DEFAULT TRUE` melalui migration. Sertakan `sapaEnabled` pada schema OpenAPI User. Jangan masukkan percakapan ke tabel laporan, scan, atau audit moderasi.
- Simpan konteks multi-turn hanya sementara di Redis, terikat pada `userId` dari session dan `conversationId` server. Usulan TTL: 30 menit sejak aktivitas terakhir, maksimal 12 pesan terakhir. Hapus saat DELETE percakapan atau logout; TTL menjadi pembersihan cadangan.
- Jangan simpan transkrip di PostgreSQL untuk MVP. Jangan mencatat isi pesan, email, foto, koordinat, atau jawaban penuh di log aplikasi. Log metadata secukupnya: `requestId`, durasi, status provider, dan kode error.
- Rate limit chat per akun, dengan batas configurable di backend; gunakan error `RATE_LIMITED` dan `Retry-After`.
- Tambahkan feature flag server `SAPA_FEATURE_ENABLED` agar tim dapat mematikan fitur global. Jika flag mati, UI menyembunyikan pet dan route chat mengembalikan 503 `ASSISTANT_UNAVAILABLE`. Jangan mengubah preferensi akun saat kill switch dipakai.
- Jika memakai provider eksternal, API key hanya di secret manager/environment server. Terapkan timeout, batas input/output, dan fallback ke panduan FAQ.

## 11. Batas jawaban dan keamanan

- System instruction dan FAQ hanya berisi pengetahuan SAP yang disetujui: langkah scan, arti status, alur laporan, peta, pencapaian, pengaturan, dan bantuan.
- Jangan memberi angka/hasil klasifikasi yang tidak berasal dari API resmi. Jangan menyatakan area bersih hanya karena tidak ada laporan; sampaikan “belum ada data”.
- Jangan memberikan akses tool kepada model untuk membuat laporan, mengubah status, membaca media privat, mengakses GPS, atau mengambil data admin.
- `pageContext` hanya untuk memilih saran relevan. Role dan identitas diambil dari session server; keduanya tidak dipercaya dari prompt atau body.
- Jika pertanyaan di luar panduan atau provider gagal, jawab singkat bahwa SAPA belum dapat membantu dan berikan tautan ke Bantuan.

## 12. Error yang disarankan

| HTTP | Kode | Kondisi |
|---|---|---|
| 401 | AUTH_REQUIRED / SESSION_EXPIRED | Session tidak ada atau kedaluwarsa. |
| 403 | CSRF_INVALID | Token CSRF mutasi tidak valid. |
| 403 | ASSISTANT_DISABLED | Pengguna mematikan SAPA. |
| 404 | CONVERSATION_NOT_FOUND | `conversationId` tidak ada atau bukan milik pengguna. |
| 422 | ASSISTANT_MESSAGE_INVALID | Pesan kosong, terlalu panjang, atau `pageContext` tidak dikenal. |
| 429 | RATE_LIMITED | Batas request tercapai; sertakan `Retry-After`. |
| 503 | ASSISTANT_UNAVAILABLE | Feature flag mati atau provider tidak tersedia. |

Gunakan envelope error standar: `error.code` untuk logika UI, `error.message` untuk manusia, `meta.requestId` untuk pelacakan.

## 13. Susunan modul dan uji penerimaan

Usulan modul NestJS: `assistant.controller` untuk parse/guard, `assistant.service` untuk konteks dan aturan, `assistant-knowledge` untuk FAQ, dan `assistant-provider` sebagai adapter opsional. Controller mengikuti pola backend SAP: validate → session/CSRF guard → service → serializer. Unknown fields ditolak.

Sebelum implementasi:

1. Tambahkan route, DTO, enum, status, dan schema User ke `contracts/openapi.json`.
2. Tambahkan fixtures request/response termasuk disabled, invalid input, rate limit, dan provider unavailable.
3. Regenerasi client frontend, update `X-Contract-Version` sesuai kebijakan kontrak tim, lalu jalankan contract test.
4. Buat migration `sapa_enabled` dan unit/integration test.

Acceptance backend:

- `getMe` mengembalikan `sapaEnabled=true` untuk akun baru.
- PATCH hanya mengubah preferensi akun pemilik session dan bertahan setelah login ulang.
- Chat tanpa session mendapat 401; chat setelah SAPA dimatikan mendapat 403.
- Request invalid mendapat 422; throttle mendapat 429; provider gagal mendapat 503/fallback yang ditentukan.
- Pengguna tidak dapat membaca atau menghapus `conversationId` pengguna lain.
- Tidak ada transkrip chat di PostgreSQL atau log isi pesan.
- Chatbot tidak menjalankan aksi domain, membuka media privat, atau menghasilkan data laporan/peta palsu.

## 14. Catatan integrasi untuk frontend

Frontend (Zaka) membaca `sapaEnabled` dari `getMe`. Saat sakelar di Pengaturan berubah, kirim PATCH; tampilkan error bila penyimpanan gagal dan kembalikan nilai sebelumnya. Klik pet membuka panel lalu POST chat dengan `pageContext` enum. Tombol saran hanya menavigasi ke `target` yang sudah dipetakan frontend. Tutup/minimalkan panel tidak memanggil PATCH dan tidak mematikan SAPA.

## 15. Status di paket handoff

- Fitur ini adalah **addendum v1.1** di luar cakupan rilis inti v1.0. Backlog inti backend (B-01..B-12 + R-03) sudah selesai; SAPA adalah pekerjaan baru terpisah.
- Belum ada baris di `contracts/openapi.json`, `contracts/fixtures.json`, `DATABASE.md`, atau `TASKS.md` untuk SAPA. Langkah §13 harus dijalankan sebagai PR kontrak sebelum kode ditulis.
- Konvensi keamanan SAP tetap berlaku penuh: session live dari DB, CSRF double-submit + origin check, envelope error standar, tidak pernah membocorkan PII/koordinat/foto privat, rahasia hanya di environment.





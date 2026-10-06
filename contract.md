# Catatan perubahan frontend SAP

## 6 Oktober 2026 — Pull perbaikan media dan penyelarasan frontend

Commit lokal disimpan sebelum pull. Perubahan `3fe22ff` dari GitHub kemudian digabung dengan penyelesaian konflik pada sepuluh berkas frontend. Backend, pengujian backend existing, kontrak R1, dan perbaikan media dari teman dipertahankan. Tipe R1 diregenerasi dari OpenAPI terbaru; tidak ada perubahan schema database atau migration yang dijalankan dalam penyelarasan ini.

Selama proses push, GitHub menerima commit tambahan `935c9c5`. Commit tersebut juga dipull dan diselaraskan: tautan kronologi publik tersedia pada laporan berstatus terverifikasi/dalam penanganan/selesai yang memiliki ringkasan publik, walaupun belum memiliki foto publik. Terjemahan, portal dialog, dan pembatasan akses foto tetap digunakan. Push menggunakan akun GitHub **Nexuszzz** sesuai arahan pemilik proyek.

- Foto sumber admin menggunakan adapter terpisah. Peserta diterima memakai `GET /api/v1/activities/{id}/source-photo/url`; pemeriksaan izin tetap dilakukan server. Form koordinator memakai mode non-admin, dan foto privat tidak menjadi fallback publik.
- Pemilih sumber Instagram menggunakan `GET /api/v1/admin/instagram/reports` untuk pencarian ringkasan, kategori, tanggal, dan ID dengan cursor pagination. Pencarian dibatasi debounce 250 ms, request lama dibatalkan, dan halaman berikutnya tidak digabung ke query baru. Laporan manual tanpa scan tetap dapat ditemukan. Pemeriksaan lifecycle, consent/aset, milestone, sourceRevision, dan riwayat penggantian draf tetap digunakan sebelum pemilihan.
- Retry terbatas serta pembaruan signed URL pada thumbnail/avatar dipertahankan. Dialog detail laporan memakai portal, kunci scroll, pengembalian fokus, keyboard Tab/Escape, serta format tanggal sesuai locale. Teks dan alt tetap mengikuti Indonesia/English.
- Desain mobile, halaman Pengaturan bahasa, alur approval/publish R1, dan keputusan penghapusan menu sebelumnya dipertahankan. Tidak mengembalikan Aktivitas warga atau Antrean review.

Typecheck semua workspace, build config/API/worker, dan build produksi frontend berhasil setelah penggabungan. Suite test/E2E tidak dijalankan; test backend dari GitHub tetap disertakan tanpa klaim telah dieksekusi pada sesi ini. Audit staged files sebelum commit memeriksa secret lokal, pola credential, dan file environment. File `.env` asli serta output runtime tidak disertakan; pemeriksaan tidak mencetak credential.

## 6 Oktober 2026 — Startup lokal sebelum sinkronisasi GitHub

Frontend development dijalankan di `http://localhost:3000`, API di `http://localhost:3001`, dan worker melalui script workspace existing. Respons landing, health/readiness API langsung serta melalui proxy frontend, dan endpoint CSRF berhasil diterima. Health melaporkan database dan object storage tersedia. Pemeriksaan ini merupakan probe startup, bukan verifikasi seluruh alur pengguna.

Konfigurasi email lokal memilih `MAIL_TRANSPORT=smtp` karena kredensial SMTP sudah tersedia sementara Resend belum dikonfigurasi. Perubahan tersebut hanya berada dalam `.env` yang diabaikan Git; nilai credential tidak disalin ke contract. Transport production tetap mengikuti aturan config existing.

Worker menemukan penolakan kuota Redis Upstash. Respons Redis PING pada health tidak membuktikan operasi antrean tersedia; status worker perlu diperiksa terpisah. Redis dipasang melalui repository resmi Ubuntu WSL untuk menyiapkan antrean development lokal, setelah startup Docker Desktop gagal. API/worker kemudian dijalankan dengan override proses `REDIS_URL=redis://127.0.0.1:6380`; Redis hanya bind loopback dan menyimpan data antrean lokal terpisah. URL Redis cloud asli tetap dalam konfigurasi lokal yang diabaikan Git.

**Blocker backend:** sesudah koneksi Redis lokal tersedia, polling worker melaporkan tabel `scan_outbox` belum ada pada database yang dikonfigurasi. Proses worker berjalan, tetapi relay antrean scan belum dapat berfungsi lengkap. Pemilik backend perlu menyiapkan migration yang sesuai pada lingkungan database tujuan; sesi ini tidak menjalankan migration secara otomatis. Tidak mengubah flag rilis, mengirim email, atau memublikasikan Instagram. Script, log, dan data Redis startup disimpan di folder output di luar repo; tidak disertakan dalam commit.

## 6 Oktober 2026 — Ringkasan perubahan untuk commit dan handoff backend

Perubahan lokal sejak `beebfdd` mencakup:

- Landing page mobile dengan komponen/aset WebP terpisah, menu, alur laporan/verifikasi, cerita contoh, CTA, dan footer responsif.
- Pilihan Indonesia/English di Pengaturan, provider/kamus per fitur, preferensi browser, metadata, serta format tanggal dan angka sesuai locale.
- Perapian judul English agar tidak bertumpuk dan layout Kata sandi mobile agar deskripsi tidak menyempit.
- Tombol kembali ke Pusat admin pada halaman admin mobile; penghapusan Antrean review dan Aktivitas warga sesuai keputusan pemilik, termasuk penanganan URL lama.
- Frontend detail kejadian publik, kontribusi kondisi dari kejadian, jelajah/detail relawan, dan pengelolaan koordinator; adapter/tipe Instagram R1 dengan preview final, approval, operasi pending, cancel/retract, konflik revisi, dan riwayat. Batas scope terbaru mengikuti [handoff R1](docs/FRONTEND_R1_HANDOFF.md).
- Fixture/runner browser frontend yang sudah dibuat pada pekerjaan R1 sebelumnya; skenario untuk halaman yang dihapus dikeluarkan. Hasil browser terdahulu tetap bukti historis, bukan eksekusi baru pada commit ini.
- **Backend email development:** `MailerService` dan config bersama mendukung `MAIL_TRANSPORT=smtp` secara eksplisit. SMTP memerlukan host, port, user, dan password; menggunakan TLS, koneksi lazy, timeout terbatas, serta log error generik. Resend tetap default dan SMTP ditolak pada production. Dependency `nodemailer`/tipenya dan lockfile disertakan; contoh konfigurasi serta [deployment](docs/DEPLOYMENT.md) diperbarui. Tidak ada pengiriman OTP yang dipalsukan.

Nilai konfigurasi asli tetap lokal. Git mengabaikan `.env`/`.env.*`, selain template `.env.example`; template SMTP berisi nilai kosong. Preferensi bahasa tidak menambah field pada API akun. Penghapusan menu tidak menghapus endpoint atau data backend. Catatan setiap fitur dan alasan perubahan dijabarkan pada bagian berikut serta dokumen implementasinya.

**Sinkronisasi GitHub:** pekerjaan diselaraskan dengan `bb29e10` dari `origin/main`. Perubahan backend, migration, worker, deployment, API relawan, dan kontrak bersama dari commit tersebut dipertahankan. Tipe frontend R1 diregenerasi, termasuk `resolutionReviewRequired` dan jenis notifikasi baru. Menu **Relawan** terpisah dari commit teman dipertahankan dan dihubungkan ke provider Indonesia/English; tautan kronologi publik dari detail laporan juga dipertahankan. Kode review komunitas milik teman tetap tersimpan, tetapi menu/halamannya tidak dihubungkan ke dashboard sesuai penghapusan Antrean review; URL lama `admin-community` membuka Moderasi laporan. Adapter komunitas mempertahankan ekspor kompatibilitas untuk komponen handoff tersebut. Penyelarasan ini tidak menjalankan migration atau mengaktifkan layanan R1.

**Pemeriksaan sebelum push:** typecheck workspace config/API/worker/frontend berhasil; build config, API, worker, serta produksi Next.js berhasil sesudah penyelesaian konflik. Pemeriksaan isi index Git membandingkan berkas dengan nilai secret dari konfigurasi lokal dan memeriksa pola credential serta file environment. Tidak ditemukan kecocokan secret lokal atau credential pada berkas yang disiapkan; `.env` asli diabaikan Git dan hanya dua template `.env.example` yang terlacak. Output build/log, laporan audit lokal, ZIP sumber, dan konfigurasi asli tidak disertakan. Pemeriksaan ini tidak menjalankan suite test, migration, atau operasi API/Instagram nyata; hasil browser R1 sebelumnya tetap bersifat historis.

## 6 Oktober 2026 — Penghapusan Aktivitas warga atas permintaan pemilik

Menu **Aktivitas warga** dan halaman dashboard terkait dihapus. Sidebar desktop serta Akun mobile tidak lagi menampilkan menu tersebut. URL lama `view=community` membuka Dashboard dan membersihkan parameter `view`/`community` saat dimuat atau dipulihkan dari history. Tautan dari halaman publik, form kondisi, serta halaman koordinator diarahkan ke Dashboard atau detail kejadian/kegiatan yang sesuai.

Daftar Kabar saya, Kejadian diikuti, Kontribusi saya, Kegiatan saya, dan Tugas koordinator yang berada dalam halaman tersebut dikeluarkan dari scope frontend. Detail kejadian publik, dukung/follow, form kondisi, jelajah/detail relawan, dan pengelolaan koordinator langsung tetap menggunakan rute existing. Empat skenario browser yang membutuhkan halaman yang dihapus juga dikeluarkan; suite tidak dijalankan ulang dalam perubahan ini. Mapping terbaru ada pada [handoff R1](docs/FRONTEND_R1_HANDOFF.md). Backend, database, dan kontrak API tidak dihapus atau diubah.

## 6 Oktober 2026 — Perapian bagian kata sandi pada Pengaturan mobile

Pada viewport ≤760 px, ikon dan informasi kata sandi menggunakan dua kolom dengan area teks fleksibel. Tombol **Ganti kata sandi** ditempatkan pada baris berikutnya dengan lebar penuh, margin kiri nol, dan tinggi sentuh minimal 46 px. Ini mengatasi deskripsi yang menyempit menjadi satu kata per baris akibat layout flex tiga elemen. Aturan CSS dibatasi pada `passwordRow` di Pengaturan; teks Indonesia/English serta handler, dialog, dan API perubahan kata sandi tetap digunakan.

## 6 Oktober 2026 — Perapian judul landing page English

Judul hero English sebelumnya melampaui kolom tengah karena `white-space: nowrap` dan pemisah baris mengikuti panjang teks Indonesia. Judul English kini dibagi menjadi tiga baris pada desktop dengan lebar kolom, ukuran font, dan jarak baris yang sesuai ruang di antara kartu. Judul dapat membungkus sesuai layar; pada mobile pemisah baris desktop disembunyikan dan label tombol dapat membungkus agar tetap muat. Susunan kartu serta aset existing tetap digunakan. Perubahan dibatasi pada komponen/CSS hero dan dua entri kamus; tidak ada perubahan kontrak API atau backend.

## 5 Oktober 2026 — Bahasa Indonesia dan English

Kartu **Bahasa** ditambahkan ke Pengaturan. Radio Indonesia/English mengganti copy antarmuka langsung dan menyimpan preferensi di browser melalui `sap.locale.v1` serta cookie publik `sap_locale`. Provider bersama dipakai desktop/mobile, halaman publik, auth, dashboard, scan/laporan/peta, fitur admin, dan kontrol SAPA. Kamus dipisahkan per fitur; format tanggal/angka serta bahasa HTML mengikuti locale. Root layout membaca cookie untuk SSR dan metadata sehingga halaman menggunakan rendering dinamis.

Pilihan ini bukan preferensi yang disinkronkan pada akun. API preferensi tetap `sapaEnabled`; tidak mengirim field locale, mengubah DTO/migration, atau mengubah `.env`. Input pengguna, konten backend, caption, kode pemulihan, identifier navigasi/status, dan literal **HAPUS AKUN** tetap mengikuti data/kontrak existing. Teks dalam ilustrasi dan jawaban AI tidak diterjemahkan otomatis. Rincian integrasi dan batas scope tersedia dalam [implementasi dua bahasa](docs/FRONTEND_I18N.md).

## 5 Oktober 2026 — Landing page publik versi mobile

Landing page `/` pada viewport ≤760 px mengikuti mockup mobile: hero dengan foto dan empat kartu fitur, menu layar penuh, alur laporan serta verifikasi vertikal, peta interaktif, carousel cerita contoh, CTA, dan footer accordion. Delapan aset WebP dipisahkan ke `apps/web/public/images/landing-mobile/` dengan manifest; komponen dan CSS mobile dipisahkan dalam `apps/web/components/landing/`. Tampilan desktop mengikuti susunan existing.

Menu mendukung Escape, fokus dialog, safe area, dan penutupan saat resize ke desktop. Carousel mendukung swipe/panah keyboard serta reduced motion; kontrol utama berukuran minimal 44 px. Peta memakai API asli dan menampilkan loading/kosong/error/retry; data ilustratif mockup tidak digunakan sebagai fallback. Contoh form dan cerita diberi label. Endpoint, payload, role, auth, flag, database, serta `.env` tidak berubah dalam pekerjaan landing ini.

Mapping komponen, aset, interaksi, state peta, dan catatan peninjauan tersedia dalam [implementasi landing mobile](docs/FRONTEND_LANDING_MOBILE.md). Peninjauan browser pada lebar 320–1440 px dilakukan; typecheck dan build produksi berhasil. Suite E2E tidak ditambahkan atau dijalankan.

## 5 Oktober 2026 — Penghapusan Antrean review atas permintaan pemilik

Menu **Antrean review** dihapus dari sidebar desktop dan Pusat admin mobile. Halaman serta adapter frontend khusus antrean dihapus; tautan lama `view=admin-reviews` membuka **Moderasi laporan** melalui resolver navigasi existing. Saat halaman dimuat atau history browser dipulihkan, URL lama juga diganti menjadi `view=admin-moderation` tanpa menambah entri history baru. Tombol kembali mobile berlaku untuk lima menu admin yang tersisa.

Tiga skenario browser yang khusus menguji layar antrean dihapus dari suite karena layar tersebut sudah dikeluarkan dari scope. Tes tidak dijalankan ulang pada perubahan ini; hasil verifikasi sebelumnya merupakan bukti historis sebelum penghapusan. Tidak ada penghapusan data, tabel, endpoint review/Hermes backend, atau perubahan kontrak shared. FE-09 untuk UI antrean khusus kini dikeluarkan dari scope frontend, bukan dipindahkan otomatis ke Moderasi laporan. Mockup antrean tidak diimplementasikan.

## 5 Oktober 2026 — Tombol kembali halaman admin mobile

Semua halaman yang terdaftar di `adminNav` mempunyai tombol **Kembali ke pusat admin** di atas konten pada viewport ≤760 px: Antrean review, Moderasi laporan, Kegiatan relawan, Dampak, Pengaturan scan, dan Publikasi Instagram. Tombol menggunakan navigasi dashboard existing menuju `view=admin-menu`, sehingga URL detail kegiatan/hasil dan publikasi dibersihkan oleh alur existing. Area sentuh minimal 44 px, label teks terlihat, dan fokus keyboard mempunyai outline. Aturan bersama berada di `dashboard.tsx` dan CSS mobile dashboard; halaman desktop dan kontrak API tidak berubah. Tombol ini tidak menjalankan mutasi backend.

## 5 Oktober 2026 — Penutupan celah frontend kontrak R1

Ditambahkan detail kejadian publik/timeline/bukti, support dan follow terpisah, kabar serta kontribusi pengguna, pembaruan kondisi dengan upload/consent/draft/conflict, jelajah dan keikutsertaan relawan, acknowledgement jadwal, serta pengelolaan coordinator. Antrean review warga/hasil menggunakan saran Hermes sebagai pendamping dan keputusan moderator eksplisit. Komponen auth, peta, moderasi, kegiatan admin, Dampak, dan navigasi existing dipakai kembali.

Adapter/UI Instagram diselaraskan dengan DTO R1: delapan status, preview gambar final, altText/contentRevision, approval terpisah dari publish, operasi 202/pending/uncertain, cancel/retract/manual confirmation, history, koneksi/disconnect dan capability reasons. Credential tidak masuk UI. Mock E2E terisolasi dari backend dan produksi.

Mapping endpoint, semantik revisi/izin, batas scope, kesiapan dan blocker backend: [handoff frontend R1](docs/FRONTEND_R1_HANDOFF.md). Bukti browser/typecheck/build: [verifikasi frontend R1](docs/FRONTEND_R1_VERIFICATION.md). Backend R1 belum siap menurut pengguna; implementasi ini tidak mengubah published OpenAPI, readiness, migration, flag, `.env`, atau backend.

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

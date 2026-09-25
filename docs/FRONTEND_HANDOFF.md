# FRONTEND_HANDOFF — Pekerjaan Zaka — SAP

v1.0 · Zamani memegang UI/UX dan implementasi frontend SAP. Backend ditangani pemilik proyek.

## 1. Stack dan struktur

Next.js App Router + TypeScript strict + Tailwind CSS. TanStack Query untuk server state, React Hook Form untuk form, MapLibre untuk peta. `packages/api-client` dihasilkan dari OpenAPI menggunakan openapi-typescript/openapi-fetch. MSW membaca contracts/fixtures.json untuk pengembangan sebelum backend tersedia; jangan menyisipkan fixture di build produksi.

Struktur: `app/(public)`, `app/(auth)`, `app/(user)`, `app/admin`; `features/auth|scans|reports|areas|gamification`; `components/ui`; `lib/api`; `mocks`. Lokasi route berikut adalah baseline UX yang boleh disusun ulang dengan persetujuan, tetapi pemetaan operasi tetap.

## 2. Peta halaman dan operasi

| Route UI | Kebutuhan | OperationId API utama |
| --- | --- | --- |
| / | Landing SAP, CTA scan/lapor/peta | listCategories |
| /login, /register, /verify-email | Akun dan OTP | getCsrf,register,verifyEmail,resendVerification,login,getMe |
| /forgot-password, /reset-password | Challenge dan reset | forgotPassword,resetPassword |
| /dashboard | Aktivitas, poin, kategori, streak | getStats,getAchievements |
| /scan, /scans/[id] | Kamera/unggah, antrean dan hasil | uploadMedia,createScan,getScan |
| /history | Riwayat scan | listScans |
| /reports/new | Form foto/pin/waktu/deskripsi | uploadMedia,createReport |
| /reports, /reports/[id] | Laporan saya/detail/edit submitted | listMyReports,getReport,updateReport |
| /map, /areas/[cellId] | Map/list/detail kejadian publik | listAreas,getArea,listAreaReports |
| /leaderboard, /achievements | Peringkat dan badge | getLeaderboard,getAchievements |
| /account | Profil/logout/hapus | updateMe,logout,reauthenticate,deleteMe,getDeletionStatus |
| /admin/reports, /admin/reports/[id] | Antrean, periksa, keputusan/bukti | listAdminReports,getReport,listDuplicateCandidates,decideReport |
| /admin | Ringkasan operasi | getAdminStats |
| /admin/audit | Riwayat keputusan | listAuditEvents |

## 3. Auth dan fetch

Browser selalu `/api/v1` via proxy origin yang sama; `credentials: include`. Jangan memakai arbitrary `NEXT_PUBLIC_BACKEND_URL` lintas origin. Bootstrap GET csrf lalu me; simpan CSRF value di memori dan refresh setelah login/logout. Jangan menyimpan session/JWT/refresh token di localStorage. Semua mutation memakai X-CSRF-Token. `Idempotency-Key` hanya wajib untuk createScan, createReport, decideReport dan deleteMe; auth mutation dan upload tidak memakainya. Key bertahan selama retry canonical payload yang sama; generate key baru hanya ketika user memulai aksi baru. Update report dan keputusan admin memakai If-Match.

401: kosongkan cache pribadi dan login dengan returnTo allowlist.403: akses ditolak.409: tampilkan konflik dan muat ulang terbaru tanpa menimpa input.422: field/domain error.429: countdown Retry-After.503: layanan tidak tersedia; tombol retry. Jangan memakai pesan server string sebagai kontrol percabangan, gunakan error.code.

## 4. Scan dan form laporan

Stop stream kamera saat meninggalkan layar/unmount; preview sebelum submit; file invalid tidak dikirim. Upload memakai multipart melalui API; jangan mengirim base64 JSON atau memanggil endpoint legacy `/api/predict`. Scan asynchronous: create202 → poll2/4/8 detik, hentikan di terminal/unmount/401. Soft wait15 detik memberi pesan sabar; deadline tetap server. Jangan menulis ulang threshold EcoLens ML di frontend. classified menampilkan kandidat, unknown meminta foto lain/kategori manual untuk laporan, no_waste memberi keterangan netral, failed menampilkan retry.

Laporan tidak mensyaratkan hasil scan. Pengguna wajib mengonfirmasi pin dan waktu kejadian, bukan otomatis menganggap lokasi perangkat sebagai lokasi sampah. GPS ditolak → pin manual. Severity berasal pilihan pelapor, bukan ML. categoryId boleh null. Date picker menampilkan waktu lokal, payload UTC. Sebelum submit tampilkan ringkasan foto/lokasi/deskripsi dan penjelasan moderasi. Draft hanya di memori selama navigasi form; jangan persistenkan foto/token/koordinat pribadi di localStorage.

## 5. Peta dan cache

Gunakan GeoJSON server, koordinat lon/lat. Tampilkan filter periode, legenda, asOf, methodVersion dan label tanpa data. Detail per sel memakai filter sama dengan map; batalkan request lama saat filter berubah. Debounce moveend300ms; hindari reload saat setiap frame drag. MAP_BOUNDS_TOO_LARGE → ajak zoom; jangan membuat heatmap dari subset hasil yang kebetulan terambil. Tiles gagal → list area tetap berfungsi.

Cache keys mencakup identitas session+filter untuk data pribadi tanpa menerima arbitrary userId dari browser; invalidasi me/stats/history setelah scan terminal, laporan setelah create/edit/decision, map setelah moderasi bila sedang dibuka admin. Logout menghapus semua query pribadi. Poin, streak, badge, achievement, status dan hotspot selalu dihitung backend; frontend tidak membawa registry/aturan bisnis legacy.

## 6. Batas reuse EcoLens legacy

Kode web EcoLens boleh menginspirasi alur kamera, preview, loading, empty/error state, dashboard dan pola interaksi OTP. Jangan menyalin API route/Mongo model, `/api/predict`, payload base64, JWT refresh/auto-rotation, legacy API types, hitungan poin/streak/badge di client, atau metrik CO2/air/energi. Source legacy bukan dependency, subtree, submodule, atau bagian repository SAP.

## 7. Syarat selesai frontend

Semua layar+state di DESIGN-UI-UX; keyboard/pembaca layar dan mobile; generated types tanpa any; fixture dan API staging nyata; tidak ada secret/direct call Gradio; formulir menampilkan error yang sesuai schema; 409 dan double click diuji. Source frontend hanya masuk target repo `sitaurs/sap`, tanpa checkout `ecoLens`/`ecoLens_ML`. Zaka menyerahkan Figma, component library, source frontend, bukti e2e dan daftar isu yang belum ditutup.

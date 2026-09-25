# API_SPEC — SAP REST API

v1.0 · Sumber mesin: [contracts/openapi.json](contracts/openapi.json). Base URL `/api/v1`; tanggal UTC dan hari Asia/Jakarta. Kontrak ini untuk implementasi, belum endpoint berjalan.

## 1. Envelope dan autentikasi

Sukses `{data,meta:{requestId}}`; error `{error:{code,message,fields?},meta:{requestId}}`. Kontrak mesin saat ini mendeklarasikan `X-Contract-Version: 1.0.0` pada respons sukses, belum pada seluruh respons error. Penambahan header pada error adalah perubahan kontrak terkoordinasi yang masih pending dan harus mengubah OpenAPI, generated client, fixture/test, serta implementasi bersama; dokumen ini tidak menganggapnya sudah berlaku. Cookie `sap_session` opaque, HttpOnly; GET auth/csrf memberi token untuk X-CSRF-Token pada mutasi. Login akun belum terverifikasi mengembalikan403 EMAIL_UNVERIFIED, frontend membuka resend/verify; verify sukses memulai sesi. Reset password mencabut semua sesi dan meminta login ulang. recent reauth diperlukan untuk delete account.

`Idempotency-Key` wajib tepat pada createScan, createReport, decideReport dan deleteMe; auth mutation dan uploadMedia tidak memakainya. Key sama + canonical payload sama mengembalikan respons original selama 24 jam; key sama + payload berbeda menghasilkan409 IDEMPOTENCY_CONFLICT. PATCH report dan keputusan admin wajib If-Match integer revision. User tidak pernah menentukan userId/role/points/status lewat payload create umum. Header wajib yang hilang menghasilkan400, expired session401, role403, resource bukan pemilik404.

## 2. Endpoint (dihasilkan dari OpenAPI yang sama)

Public berarti tanpa login; user memerlukan session; admin juga memerlukan role; receipt memakai cookie sap_deletion. Semua mutasi tetap memerlukan CSRF. Input/output adalah nama schema di kontrak.

| Method | Path | operationId | Akses | HTTP sukses | Input | Output data |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/auth/csrf` | `getCsrf` | public | 200 | — | Csrf |
| POST | `/auth/register` | `register` | public | 202 | RegisterInput | Challenge |
| POST | `/auth/verify-email` | `verifyEmail` | public | 200 | VerifyInput | User |
| POST | `/auth/resend-verification` | `resendVerification` | public | 202 | EmailInput | Challenge |
| POST | `/auth/login` | `login` | public | 200 | LoginInput | User |
| POST | `/auth/forgot-password` | `forgotPassword` | public | 202 | EmailInput | Challenge |
| POST | `/auth/reset-password` | `resetPassword` | public | 200 | ResetInput | Ack |
| POST | `/auth/logout` | `logout` | user | 200 | — | Ack |
| GET | `/auth/me` | `getMe` | user | 200 | — | User |
| POST | `/auth/reauthenticate` | `reauthenticate` | user | 200 | ReauthInput | Ack |
| PATCH | `/users/me` | `updateMe` | user | 200 | ProfileInput | User |
| DELETE | `/users/me` | `deleteMe` | user | 202 | DeleteInput | Deletion |
| GET | `/account-deletion` | `getDeletionStatus` | receipt | 200 | — | Deletion |
| GET | `/categories` | `listCategories` | public | 200 | — | CategoryPage |
| POST | `/media` | `uploadMedia` | user | 201 | multipart | Media |
| GET | `/media/{mediaId}/url` | `getMediaUrl` | user | 200 | — | MediaUrl |
| POST | `/scans` | `createScan` | user | 202 | ScanInput | Scan |
| GET | `/scans` | `listScans` | user | 200 | — | ScanPage |
| GET | `/scans/{scanId}` | `getScan` | user | 200 | — | Scan |
| GET | `/users/me/stats` | `getStats` | user | 200 | — | Stats |
| GET | `/users/me/achievements` | `getAchievements` | user | 200 | — | AchievementPage |
| GET | `/leaderboard` | `getLeaderboard` | public | 200 | — | LeaderboardEntryPage |
| POST | `/reports` | `createReport` | user | 201 | ReportInput | Report |
| GET | `/reports/mine` | `listMyReports` | user | 200 | — | ReportPage |
| GET | `/reports/{reportId}` | `getReport` | user | 200 | — | Report |
| PATCH | `/reports/{reportId}` | `updateReport` | user | 200 | ReportUpdateInput | Report |
| GET | `/areas` | `listAreas` | public | 200 | — | Areas |
| GET | `/areas/{cellId}` | `getArea` | public | 200 | — | AreaDetail |
| GET | `/areas/{cellId}/reports` | `listAreaReports` | public | 200 | — | PublicReportPage |
| GET | `/admin/reports` | `listAdminReports` | admin | 200 | — | ReportPage |
| GET | `/admin/reports/{reportId}/duplicates` | `listDuplicateCandidates` | admin | 200 | — | DuplicateCandidatePage |
| POST | `/admin/reports/{reportId}/decisions` | `decideReport` | admin | 200 | DecisionInput | Report |
| GET | `/admin/stats` | `getAdminStats` | admin | 200 | — | AdminStats |
| GET | `/admin/audit` | `listAuditEvents` | admin | 200 | — | AuditEventPage |
| GET | `/health` | `getHealth` | public | 200 | — | Health |

## 3. Semantik domain tambahan

- Register/resend/forgot202 menyertakan challengeId/expiry/cooldown. OTP6 digit dan single-use; batas usaha/rate limit ditentukan TECH_SPEC. Login/verifikasi mengatur cookie, tidak menambahkan token ke JSON.
- Upload multipart file+purpose, maksimum10 MiB; response data.id sebagai mediaId sebelum scan/report. Satu media terkait owner; pemilik report juga boleh membaca media evidence/resolution yang terhubung ke laporannya, dan admin hanya membaca media relevan tugas moderasi. URL read berlaku5 menit, tidak di-cache publik.
- POST scans202 menghasilkan queued; polling200 berisi status job, termasuk failed. Unknown/no_waste adalah sukses inferensi tanpa kategori, bukan error HTTP. Score0..1 dan status terminal mengikuti INTEGRATION_CONTRACT.
- ReportInput categoryId dan scanId opsional; media1–3; occurredAt tidak boleh di masa depan dan harus ≤ 30 hari sebelum submit. Update submitted dapat mengganti evidence/kategori/lokasi/deskripsi, menaikkan revision; scanId historis tidak diubah.
- Status hanya diubah admin via decideReport, sesuai DATABASE. Reason wajib. Duplicate membutuhkan duplicateOfId; resolved membutuhkan1–3 resolutionMediaIds purpose resolution. publishMediaIds hanya derivative yang sudah ditinjau; publicSummary tidak memuat PII. Verifikasi awal wajib publicSummary. Keputusan same-status hanya untuk metadata/media publik pada verified/in_progress/resolved; wajib If-Match, menaikkan revision dan diaudit, tanpa award/reversal poin.
- GET report detail hanya pemilik/admin; pemilik melihat timeline dengan reason yang aman. GET areas dan listAreaReports tidak pernah mengembalikan ReportDto private.
- Query bbox west,south,east,north dalam derajat; backend memvalidasi range dan west<east,south<north. Default periode30 hari, maksimum90 hari, `[from,to)`. Invalid filter400; >2000 cells422 MAP_BOUNDS_TOO_LARGE; detail area tanpa kejadian eligible404 AREA_NO_DATA. Parameter periode/filter yang sama harus diteruskan ke detail/list area.
- Public listAreaReports hanya verified/in_progress/resolved canonical; publicMediaUrl nullable. List APIs memakai opaque cursor dan nextCursor=null saat habis; limit20/max100. List kategori/achievement tidak dipaginasi dan nextCursor selalu null.
- DELETE users/me202 menetapkan cookie receipt sap_deletion7 hari, merevoke session dan mengantrekan cleanup. GET account-deletion hanya menerima receipt ini dan tidak membocorkan identitas. Hapus akun tidak menghapus audit publik yang sudah dianonimkan; kebijakan diberitahukan sebelum konfirmasi.

## 4. Error code yang dipakai UI

VALIDATION_ERROR400; AUTH_REQUIRED/SESSION_EXPIRED401; EMAIL_UNVERIFIED/FORBIDDEN/CSRF_INVALID403; NOT_FOUND/AREA_NO_DATA404; REVISION_CONFLICT/IDEMPOTENCY_CONFLICT409; IMAGE_TOO_LARGE413; UNSUPPORTED_IMAGE415; REPORT_INVALID/INVALID_TRANSITION/MEDIA_INVALID/MAP_BOUNDS_TOO_LARGE422; RATE_LIMITED429 dengan Retry-After; ML_UNAVAILABLE/DEPENDENCY_UNAVAILABLE503; INTERNAL_ERROR500. Scan failed memakai errorCode domain pada ScanDto, status HTTP polling tetap200.

## 5. Contoh dan uji

Fixture request/response berada di contracts/fixtures.json. Fixture scan/report/map bersifat sintetis; bukan hasil layanan. State report fixture adalah contoh tampilan independen, bukan replay timeline lengkap. Schema validation tidak mencakup semua aturan conditional (misalnya resolutionMediaIds wajib saat resolved), sehingga unit/domain+integration test wajib memeriksanya. Lihat TEST_PLAN.

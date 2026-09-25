# DATABASE — SAP PostgreSQL/PostGIS

v1.0 · Pemilik: backend. SQL migrations dibuat saat implementasi; API tidak mengekspos row database langsung.

## 1. Konvensi dan relasi

UUID untuk PK, UTC timestamptz, snake_case kolom. Tabel mutable memakai timestamp audit yang relevan; `revision` hanya wajib pada aggregate yang memakai optimistic concurrency, terutama `reports`. Tabel lain mengandalkan row lock, unique constraint, atau append-only sesuai invariannya dan tidak wajib memiliki revision. Category memakai text ID taxonomy EcoLens ML/Hugging Face provenance. Role user/admin; status dan outcome mengikuti OpenAPI. API serializer memetakan camelCase. Password hash tidak pernah masuk DTO.

User memiliki sessions, media, scans, reports dan point ledger. Report memiliki banyak report_media dan status_events; duplicate_of_id menunjuk report canonical. Scan opsional direferensikan report, tanpa syarat scan harus berhasil. Geo point sumber adalah koordinat report; h3_cell dihitung server. Point ledger append-only diturunkan menjadi statistik/leaderboard, bukan sumber kedua yang dihitung frontend.

## 2. Akun dan media

| Tabel | Kolom utama | Constraint/indeks |
| --- | --- | --- |
| users | id,email_normalized,password_hash,display_name,role,email_verified_at,deleted_at | unique email; role defaultuser; pseudonym setelah delete |
| sessions | id,user_id,token_hash,expires_at,last_seen_at,reauthenticated_at | unique token_hash; index expiry; cascade user |
| auth_challenges | id,user_id nullable,email_hash,purpose,code_hash,expires_at,attempts,resend_after,consumed_at | purpose verify_email/reset_password; max5 attempts dan single-use transaksi |
| media | id,owner_id,purpose,object_key,mime,size_bytes,sha256,width,height,state,expires_at,deleted_at,public_derivative_key nullable | unique object_key; index owner/expiry; purpose scan/report/resolution; private default |
| categories | id,name_id,sort_order,active | ID persis10 kategori; tidak diubah editor menjadi taxonomy baru tanpa kontrak |

Challenge ID dikirim ke client; OTP asli tidak disimpan. Untuk forgot/reset akun yang tidak ada, respons memiliki opaque challenge dummy dan pesan sama; tidak mengungkap status akun.

## 3. Scan dan aktivitas

| Tabel | Kolom utama | Aturan |
| --- | --- | --- |
| scans | id,user_id,media_id,status,outcome nullable,category_id nullable,predictions jsonb,error_code nullable,provider_revision,started_at,finished_at,points_awarded | queued/processing/succeeded/failed; outcome dan error konsisten dengan INTEGRATION_CONTRACT |
| point_ledger | id,user_id,event_key,source_type,source_id,delta,reason,activity_day | unique event_key; kompensasi reversal tidak overwrite entry |
| user_daily_activity | user_id,activity_day,scan_award_count,report_award_count,net_points | unique(user_id,activity_day); day Asia/Jakarta; row lock pada award cap |
| achievement_definitions | id,name,description,criteria_version | first_scan/scanner_10/first_verified_report/streak_3 |
| user_achievements | user_id,achievement_id,unlocked_at,revoked_at | unique(user_id,achievement_id); revocation setelah recalculation |

Scan indexes(user_id,created_at,id), (status,created_at); poin dihitung net sum delta. Dedup scan eligible poin memakai user+sha256+activity_day; simpan `scan_dedup_keys` dengan unique kombinasi tersebut dan awarded_scan_id. Statistik cached harus bisa direkonsiliasi dari scans/ledger, serta satu serializer untuk semua halaman.

## 4. Pelaporan dan moderasi

| Tabel | Kolom utama | Aturan |
| --- | --- | --- |
| reports | id,reporter_id nullable,scan_id nullable,category_id nullable,description,reported_severity,occurred_at,location geography(Point,4326),h3_cell,status,duplicate_of_id nullable,public_summary nullable,verified_at,resolved_at,revision | date bukan masa depan; canonical graph tanpa self/cycle; user hanya edit submitted |
| report_media | report_id,media_id,sort_order,kind | unique(report_id,media_id); kind evidence/resolution; evidence1–3 |
| report_status_events | id,report_id,actor_id nullable,from_status,to_status,reason,evidence_media_ids,occurred_at | append-only; timeline diproyeksikan publik/pemilik/admin sesuai izin |
| moderation_decisions | id,report_id,actor_id,request_key,revision_before,decision_payload,created_at | unique request_key scoped actor; simpan bukti dan audit transaksi |
| audit_events | id,actor_id nullable,action,target_type,target_id,changes_redacted,request_id | append-only; tidak menyimpan secret/foto/base64 |

Indeks GiST(location); btree(h3_cell,occurred_at), (status,occurred_at), (reporter_id,created_at), duplicate_of_id. ST_DWithin memakai geography/meter untuk saran duplicate; query selalu parameterized. Category laporan dapat berasal konfirmasi pengguna, tidak otomatis ditentukan model. Constraint eligibility dan status transition diterapkan service+transaksi dengan row lock, bukan hanya tombol UI.

Untuk publikasi foto admin menyetujui derivative yang sudah dibersihkan dari EXIF dan informasi pribadi; original tetap private. Tidak ada field email/reporterId di PublicReportDto. Catatan alasan internal dibedakan dari public_summary.

## 5. Agregat dan infrastruktur

- area_snapshots: id,cache_key,method_version,from_at,to_at,category_id nullable,as_of,payload jsonb,expires_at; dapat dibangun ulang dari reports. Snapshot tidak menjadi fakta terpisah.
- outbox_events: id,topic,aggregate_id,payload_minimal,state,attempts,next_attempt_at; unique dedup_key. Transaksi membuat outbox bersama mutasi yang harus memicu worker.
- idempotency_keys: actor_scope,route,key,request_hash,status_code,response_json,expires_at; unique(scope,route,key), TTL24 jam. Dipakai tepat untuk createScan, createReport, decideReport dan deleteMe; auth mutation/upload tidak memerlukannya. Hash berasal dari canonical payload; key+payload sama mereplay hasil, key sama+payload berbeda menghasilkan409. Nilai sensitif tidak disimpan dalam response_json.
- deletion_requests: id,user_id nullable,subject_hash,status,receipt_hash,receipt_expires_at,requested_at,completed_at,last_error_code; satu request aktif/user. Receipt7 hari hanya untuk status; receipt tidak memberi hak API lain.
- deletion_tombstones: subject_hash,completed_at,expires_at untuk replay cleanup pada restore backup.

## 6. Status transition

submitted→verified/rejected/duplicate; verified→in_progress/rejected/duplicate; in_progress→resolved/verified/rejected/duplicate; resolved→verified/rejected/duplicate; rejected/duplicate→submitted untuk review ulang. Verify canonical membutuhkan foto/lokasi/waktu valid. Duplicate membutuhkan target canonical verified/in_progress/resolved. Resolved membutuhkan evidence foto dan reason. Semua keputusan admin memakai If-Match dan event immutable.

Keputusan same-status hanya diizinkan untuk memperbarui metadata publik (`public_summary`/media publik) pada status yang eligible dipublikasikan: verified, in_progress, atau resolved. Operasi ini wajib If-Match, diaudit, menulis event/decision, dan menaikkan revision walau status tidak berubah. Operasi tidak mengubah eligibility kejadian serta tidak memberikan atau membalik poin.

Satu transaksi moderasi: lock report, validate revision+transition/eligible same-status+target, write status/event, increment revision, apply/reverse ledger hanya bila eligibility berubah, update badge/statistics atau tandai rebuild, enqueue aggregate refresh bila proyeksi publik/agregat terdampak, audit. UI melihat status sukses hanya setelah commit.

## 7. Penghapusan dan migrasi

Deletion job memblokir mutasi user, revoke sessions, hapus identitas/scan media, pseudonimkan aktivitas dan laporan publik, hapus foto/report private sesuai kebijakan, lalu simpan receipt tanpa PII. Media di Cloudflare R2 melalui S3-compatible API harus dihapus eksplisit; cascade SQL saja tidak cukup. Backup expiry usulan30 hari; tombstone direplay sebelum hasil restore dibuka ke pengguna.

Migration expand/backfill/switch/contract dan rollback aplikasi yang kompatibel; jangan drop kolom sebelum deploy lama berhenti. Uji migrations dari database kosong dan upgrade staging. Seed hanya kategori, definisi badge, admin dev dan laporan sintetis dengan label; data demo tidak dipublikasikan ke produksi.

# INTEGRATION_CONTRACT — Pencegahan mismatch SAP

v1.0 · Wajib dibaca kedua orang sebelum coding. Tujuannya mendeteksi perbedaan lebih awal; dokumen saja tidak menjamin implementasi bebas bug.

**Scope:** aturan ini mendokumentasikan baseline API existing 1.1.0. Extension komunitas/relawan/Hermes/Instagram memakai [kontrak Zaka–Zamani](CONTRACT_ZAKA_ZAMANI.md) dan [rencana backend](BACKEND_EXECUTION_PLAN.md), termasuk pagination max50, header IK/IM per operasi, enum, DTO, serta gate promosi schema. Kontrak mesin existing tetap disimpan; extension belum otomatis tersedia karena tercantum di Markdown.

## 1. Satu kontrak bersama

`contracts/openapi.json` menjadi sumber endpoint, tipe, enum, required/null dan HTTP status. `contracts/fixtures.json` menggunakan schema itu. Backend mengimplementasikan kontrak; frontend menghasilkan tipe/client darinya. Jangan menyalin tipe manual ke dua repo. Gunakan commit kontrak yang sama. Kontrak mesin v1.1.0 saat ini mendeklarasikan `X-Contract-Version: 1.1.0` pada respons sukses; perlu PR kontrak terkoordinasi sebelum header itu diwajibkan juga pada semua error.

Gap yang wajib ditutup sebelum coding auth: dokumentasikan efek response `Set-Cookie` untuk `sap_csrf`, `sap_session`, dan `sap_deletion` di OpenAPI. Perubahan harus melalui review kontrak serta regenerasi client, bukan hanya dicatat dalam dokumentasi naratif.

## 2. Konvensi yang tidak boleh berbeda

| Aspek | Kesepakatan |
| --- | --- |
| Base URL browser | `/api/v1` melalui origin yang sama |
| ID | UUID string; cellId H3 string |
| Field | camelCase API; snake_case hanya DB |
| Success | `{data, meta}`; meta.requestId wajib; daftar memakai data.items dan data.nextCursor |
| Error | `{error:{code,message,fields?},meta:{requestId}}`; kode untuk logic, message untuk manusia |
| Auth | Cookie `sap_session`; tidak memakai bearer/localStorage token |
| CSRF | GET `/auth/csrf`, header `X-CSRF-Token` pada mutasi |
| Tanggal | ISO8601 UTC; tanggal kalender memakai Asia/Jakarta |
| Koordinat | Request `{latitude,longitude}`; GeoJSON `[longitude,latitude]` |
| Skor ML | Number 0..1; persentase hanya format tampilan dan bukan jaminan ketepatan |
| Missing vs null | Field required selalu ada; null artinya diketahui kosong; optional artinya dapat dihilangkan menurut schema |
| Pagination | Baseline: limit default20, max100 sesuai operasi; extension: default20/max50. Opaque cursor dan sort stabil server |
| Retry idempoten | Baseline: IK wajib createScan/createReport/decideReport/deleteMe; auth/upload sesuai schema existing. Extension: wajib pada operasi bertanda IK dalam kontrak baru. Same key+canonical payload mereplay hasil; beda payload409. Intent publisher bertahan sepanjang operasi, melampaui TTL request umum24 jam |
| Update concurrency | Report/edit dan keputusan admin memakai If-Match integer revision; stale→409, frontend minta muat ulang/perbandingan |

## 3. Status dan taxonomy

Scan.status: queued/processing/succeeded/failed. Scan.outcome: classified/unknown/no_waste/null; null hanya saat belum sukses. categoryId=null jika outcome bukan classified; predictions kosong boleh untuk unknown/no_waste/failed. failed.errorCode wajib; succeeded.errorCode=null. Hasil mentah Gradio/EcoLens ML tidak boleh langsung dipasang sebagai DTO publik; Hugging Face hanya provenance model.

Report.status: submitted/verified/in_progress/resolved/rejected/duplicate. Display label Indonesia dipetakan dari enum yang sama. Severity reported small/medium/large adalah perkiraan pelapor, tidak sama dengan riskLevel area. Area.riskLevel: low/medium/high; area tanpa kejadian eligible tidak dikirim, UI menyebut belum ada data. Jangan memakai status laporan untuk warna tingkat area.

Category IDs tetap: battery, biological, cardboard, clothes, glass, metal, paper, plastic, shoes, trash. no_waste dan Unknown/Mixed adalah hasil layanan, bukan kategori. Semua nama Indonesia berasal GET /categories; jangan membuat klasifikasi organic atau other secara sepihak.

## 4. Workflow perubahan

1. Siapkan perubahan kontrak + alasan + fixture dan mapping UI yang terdampak. Untuk extension buat schema draft BE-00; published OpenAPI diperbarui bersama handler saat gate siap.
2. Keduanya review perubahan required/null, enum, auth dan semantik. Menambah nilai enum juga perlu koordinasi exhaustive switch.
3. Generate api-client; gunakan MSW dengan fixture baru; backend menambah DTO validation dan handler.
4. Pada tahap implementasi, lengkapi gate validasi schema/fixture, generate+diff, contract tests respons dan build frontend sesuai rencana backend. Hasil pemeriksaan dicatat pada perubahan terkait.
5. Deploy staging API kompatibel dahulu, lalu frontend; tes alur nyata. Breaking change memakai versi API baru atau transisi kompatibel, bukan mengganti v1 diam-diam.

Review bersama berlaku sebelum push ke main sesuai arahan pengguna. PR dapat digunakan sebagai sarana review bila diperlukan; bukan keharusan membuat branch publikasi baru.

## 5. Gate otomatis yang harus dibuat

Script existing: root `contracts:lint` menjalankan scripts/check-contracts.mjs, `contracts:check` saat ini alias lint, dan `contracts:routes` memeriksa route. Generate frontend tersedia melalui `npm run contracts:types -w @sap/web`; generated output berada di apps/web/lib/api/schema.d.ts. `contracts:check` belum berarti generated diff atau semua respons handler telah diperiksa. Gate extension untuk fixture tambahan, generated diff, contract tests handler dan alur integrasi direncanakan pada BE-00/13/14. TypeScript tidak memvalidasi JSON runtime: parse server output/provider dengan validator. Dokumen ini tidak menyatakan gate tersebut sudah dijalankan.

## 6. Mock dan integrasi

Fixture berlabel sintetis; tidak pernah ditampilkan sebagai laporan/hasil AI produksi. Frontend boleh bekerja mandiri memakai MSW, tetapi acceptance fitur harus melewati staging backend nyata. Simulasikan minimal 401,403,409,422,429,503; queued/processing; unknown/no_waste; daftar kosong; area stale; duplicate; rejected dan resolved. Mock menggunakan operationId dari kontrak agar handler konsisten.

## 7. Checklist merge bersama

- [ ] Endpoint/field/status cocok OpenAPI; tidak ada type `any` untuk respons API.
- [ ] Request permission/error/loading/empty state ada.
- [ ] Tidak ada asumsi auth berdasarkan localStorage.
- [ ] Tombol submit dikunci sementara tetapi backend tetap idempoten.
- [ ] UI tidak menghitung poin/status/hotspot sendiri.
- [ ] Tidak ada format mentah Gradio/provider ML yang bocor ke frontend.
- [ ] Bukti pemeriksaan fixture/live API tersimpan pada catatan integrasi/perubahan; PR bila digunakan.

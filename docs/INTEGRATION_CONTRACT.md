# INTEGRATION_CONTRACT — Pencegahan mismatch SAP

v1.0 · Wajib dibaca kedua orang sebelum coding. Tujuannya mendeteksi perbedaan lebih awal; dokumen saja tidak menjamin implementasi bebas bug.

## 1. Satu kontrak bersama

`contracts/openapi.json` menjadi sumber endpoint, tipe, enum, required/null dan HTTP status. `contracts/fixtures.json` menggunakan schema itu. Backend mengimplementasikan kontrak; frontend menghasilkan tipe/client darinya. Jangan menyalin tipe manual ke dua repo. Gunakan commit kontrak yang sama. Kontrak mesin v1.0.0 saat ini mendeklarasikan `X-Contract-Version: 1.0.0` pada respons sukses; perlu PR kontrak terkoordinasi sebelum header itu diwajibkan juga pada semua error.

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
| Pagination | limit default20, max100; opaque cursor; sort stabil server |
| Retry idempoten | Idempotency-Key UUID wajib hanya untuk createScan, createReport, decideReport dan deleteMe; tidak untuk auth mutation/upload. Same key+canonical payload mereplay hasil selama24 jam; beda payload409 |
| Update concurrency | Report/edit dan keputusan admin memakai If-Match integer revision; stale→409, frontend minta muat ulang/perbandingan |

## 3. Status dan taxonomy

Scan.status: queued/processing/succeeded/failed. Scan.outcome: classified/unknown/no_waste/null; null hanya saat belum sukses. categoryId=null jika outcome bukan classified; predictions kosong boleh untuk unknown/no_waste/failed. failed.errorCode wajib; succeeded.errorCode=null. Hasil mentah Gradio/EcoLens ML tidak boleh langsung dipasang sebagai DTO publik; Hugging Face hanya provenance model.

Report.status: submitted/verified/in_progress/resolved/rejected/duplicate. Display label Indonesia dipetakan dari enum yang sama. Severity reported small/medium/large adalah perkiraan pelapor, tidak sama dengan riskLevel area. Area.riskLevel: low/medium/high; area tanpa kejadian eligible tidak dikirim, UI menyebut belum ada data. Jangan memakai status laporan untuk warna tingkat area.

Category IDs tetap: battery, biological, cardboard, clothes, glass, metal, paper, plastic, shoes, trash. no_waste dan Unknown/Mixed adalah hasil layanan, bukan kategori. Semua nama Indonesia berasal GET /categories; jangan membuat klasifikasi organic atau other secara sepihak.

## 4. Workflow perubahan

1. Buat PR perubahan OpenAPI + alasan + fixture dan contoh UI yang terdampak.
2. Keduanya review perubahan required/null, enum, auth dan semantik. Menambah nilai enum juga perlu koordinasi exhaustive switch.
3. Generate api-client; gunakan MSW dengan fixture baru; backend menambah DTO validation dan handler.
4. CI validate OpenAPI, validate fixtures, generate+diff, contract tests respons dan build frontend.
5. Deploy staging API kompatibel dahulu, lalu frontend; tes alur nyata. Breaking change memakai versi API baru atau transisi kompatibel, bukan mengganti v1 diam-diam.

## 5. Gate otomatis yang harus dibuat

`contracts:lint` validasi OpenAPI; `contracts:types` generate; `contracts:fixtures` schema validation; `contracts:check` pastikan generated files bersih; `test:contract` menguji handler terhadap schema termasuk error; `test:e2e` alur inti. Script ini merupakan pekerjaan pada TASKS, belum tersedia sebagai repo aplikasi dalam ZIP. TypeScript tidak memvalidasi JSON runtime: parse server output/provider dengan validator dan contract tests.

## 6. Mock dan integrasi

Fixture berlabel sintetis; tidak pernah ditampilkan sebagai laporan/hasil AI produksi. Frontend boleh bekerja mandiri memakai MSW, tetapi acceptance fitur harus melewati staging backend nyata. Simulasikan minimal 401,403,409,422,429,503; queued/processing; unknown/no_waste; daftar kosong; area stale; duplicate; rejected dan resolved. Mock menggunakan operationId dari kontrak agar handler konsisten.

## 7. Checklist merge bersama

- [ ] Endpoint/field/status cocok OpenAPI; tidak ada type `any` untuk respons API.
- [ ] Request permission/error/loading/empty state ada.
- [ ] Tidak ada asumsi auth berdasarkan localStorage.
- [ ] Tombol submit dikunci sementara tetapi backend tetap idempoten.
- [ ] UI tidak menghitung poin/status/hotspot sendiri.
- [ ] Tidak ada format mentah Gradio/provider ML yang bocor ke frontend.
- [ ] Bukti tes fixture dan live API tersimpan di PR.

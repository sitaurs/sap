# ML_INTEGRATION — Model EcoLens untuk SAP

v1.0 · Pemilik: backend. Tidak ada training, fine-tuning atau model baru dalam cakupan.

## 1. Provenance dan model

Source EcoLens/Hugging Face memakai MobileNetV3 Small untuk `waste`/`no_waste` dan EfficientNet-B0 untuk 10 jenis sampah. File aktif: `CNN/best_mobilenetv3_binary.pth` dan `CNN/best_model_weights.pth`; `CNN/model.pth` bukan path aktif. Commit dan kondisi checkout ada di [SOURCE_AUDIT.md](SOURCE_AUDIT.md).

Runtime produksi adalah Gradio self-hosted, bukan HF Space. HF tetap provenance. Ketiga `.pth` checkout lokal masih pointer Git LFS 133 byte; identitas bobot runtime VPS harus dibuktikan terpisah. Threshold source: binary `0.4`, multiclass `0.53`, top-k `3`; ini bukan klaim probabilitas terkalibrasi.

## 2. Taxonomy

| Label provider | categoryId SAP | Label UI |
| --- | --- | --- |
| battery | battery | Baterai |
| biological | biological | Sampah organik |
| cardboard | cardboard | Kardus |
| clothes | clothes | Pakaian |
| glass | glass | Kaca |
| metal | metal | Logam |
| paper | paper | Kertas |
| plastic | plastic | Plastik |
| shoes | shoes | Sepatu |
| trash | trash | Sampah lainnya |
| no_waste | null, `outcome=no_waste` | Sampah tidak teridentifikasi |
| Unknown/Mixed | null, `outcome=unknown` | Jenis belum dikenali |

Label asing/`error`, response invalid, atau provider failure menjadi failed dengan `ML_INVALID_RESPONSE`, `ML_UNAVAILABLE`, atau `ML_TIMEOUT`. Score harus finite 0..1 dan tidak disebut probabilitas terkalibrasi. ML failure tidak pernah diubah menjadi `no_waste`.

## 3. Runtime dan konfigurasi

```env
ML_INFERENCE_URL=
ML_API_NAME=/predict_gradio
ML_USERNAME=
ML_PASSWORD=
ML_TIMEOUT_MS=90000
```

Nilai URL/credential hanya di secret manager atau `.env` runtime; tidak di docs, log, fixture, browser bundle atau repo.

| Properti | Nilai/schema ditemukan |
| --- | --- |
| Gradio | `6.26` (`6.26.0` pada runtime audit) |
| API prefix | `/gradio_api` |
| Named endpoint | `/predict_gradio` |
| Input | `img`, Image/Buffer melalui upload Gradio client |
| Output | satu `LabelData`: `label` dan `confidences[]` |

`ML_INFERENCE_URL` adalah base URL, bukan `/gradio_api/call/predict_gradio`. Call Gradio mencakup upload, submit job, `event_id`, lalu result/event; gunakan `@gradio/client`, jangan merakit protokol manual.

HTTP Basic Auth diterapkan reverse proxy, bukan `verify.py` legacy/native login Gradio. Client memasang custom header:

```ts
const token = Buffer.from(`${username}:${password}`).toString('base64');
const client = await Client.connect(baseUrl, {
  headers: { Authorization: `Basic ${token}` },
});
```

Jangan gunakan native `auth` option untuk reverse-proxy Basic Auth dan jangan log header tersebut.

## 4. Adapter worker

- Ambil `mediaId` milik user yang sudah melalui MIME/size/decode/re-encode/checksum; jangan menerima URL/base64 arbitrer.
- Kirim byte hasil normalisasi melalui upload `@gradio/client`; panggil `ML_API_NAME`, bukan `/run/predict` atau `/api/predict` legacy.
- Pastikan `result.data` berisi tepat satu `LabelData`; validasi string label dan array confidences.
- Tolak score null/nonfinite/di luar `[0,1]`, label asing/`error`, dan payload ambigu.
- Sortir deterministik, maksimum tiga prediction, lalu normalisasi outcome/category.
- Simpan latency, attempt dan `providerRevision`, bukan credential/raw response ke frontend.
- Sebelum completion, pastikan scan belum terminal/dihapus dan media masih valid; late result tidak boleh menyelesaikan scan.
- Baseline concurrency provider adalah 1.

Frontend hanya membuat scan dan polling `ScanDto`. Deduplikasi memakai owner+checksum+calendar day; create idempoten dan ledger event unik.

## 5. Job dan error

`queued → processing → succeeded|failed`; create 202. Soft wait 15 detik, deadline baseline 90 detik. Maksimum satu retry otomatis untuk network/provider transient. 401/403 adalah configuration failure tanpa retry berulang. Invalid response tidak boleh ditebak. User tetap dapat melapor tanpa klasifikasi.

Error publik: `ML_UNAVAILABLE`, `ML_TIMEOUT`, `ML_INVALID_RESPONSE`, `MEDIA_INVALID`. Cold start adalah state menunggu sampai deadline. Circuit breaker membatasi outage. Poin hanya diberikan untuk outcome `classified` yang lolos dedup dan transaksi completion pertama.

## 6. Readiness model-aware

HTTP 200 UI hanya liveness. Readiness wajib memeriksa:

1. Binary dan multiclass keduanya loaded.
2. Checkpoint hash/revision cocok dan tidak ada missing/unexpected key yang tidak diizinkan.
3. Known-positive menghasilkan kategori sah, bukan `no_waste`.
4. Known-negative menghasilkan `no_waste`.
5. Discovery endpoint/input/output cocok dengan adapter.
6. Dependency/runtime cocok dengan versi yang dipin.

Risiko source: `timm` tidak ada di requirements; `strict=False` dapat menyembunyikan mismatch; path `./CNN` bergantung working directory; dependency belum dipin; bobot checkout masih pointer LFS; multiclass tidak loaded dapat salah menjadi `no_waste`.

`providerRevision` minimal terdiri dari commit source ML, hash kedua checkpoint dan versi Gradio/runtime. Python baseline 3.10; dependency dikunci, path/working directory eksplisit, dan startup/readiness gagal bila artefak tidak lengkap.

VPS baseline 4 GB/2 vCPU, CPU-only, satu process dan concurrency 1. Benchmark RSS idle/peak, cold/warm latency, CPU saturation, timeout, queue age dan 2–5 scan bersamaan masih wajib. Swap hanya proteksi OOM.

## 7. Status penerimaan

Terverifikasi: Basic Auth, discovery/`view_api`, upload, `/predict_gradio`, inferensi dasar dan bentuk `LabelData`.

Pending: fixture 10 kelas; unknown/no_waste/invalid/malformed/`error`; model hilang/mismatch; timeout/polling/late result/restart; benchmark; dan bukti `providerRevision`. Lihat [ENVIRONMENT_READINESS.md](ENVIRONMENT_READINESS.md). Service dapat dihubungi atau source berhasil di-clone belum berarti integrasi selesai.

Rujukan: [Gradio JS client](https://www.gradio.app/main/docs/js-client) dan [source EcoLens](https://huggingface.co/spaces/wahb-amir/ecoLens/blob/3d41e0d13f1199eb34d2cd803914db49f6458904/utils/predict.py).

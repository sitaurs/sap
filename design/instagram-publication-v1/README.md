# Aset Publikasi Instagram v1

Tiga mockup disetujui pengguna, disimpan sebagai referensi layout tanpa perubahan:

| Referensi | Isi |
| --- | --- |
| `postingan-reference.png` | Daftar sumber foto, status, masuk draf, terposting. |
| `detail-reference.png` | Drawer foto sumber, caption, tanggal dan aksi. |
| `pengaturan-reference.png` | Alur draf/otomatis, tujuan akun, template caption. |

## Pemecahan aset runtime

| Aset/elemen | Lokasi/sumber | Cara dipakai |
| --- | --- | --- |
| Logo SAP | BrandLogo/aset SAP yang sudah ada | Identitas pada shell dashboard; tidak digandakan. |
| Foto laporan / scan | `PublicationPhoto` → endpoint signed URL | Media asli yang disetujui; bukan foto contoh dari mockup. |
| Ilustrasi empty state | `apps/web/public/images/instagram/publication-empty.svg` | SVG terpisah, 210×150, tidak memuat teks/data pengguna. |
| Ikon Instagram, sumber laporan, status, waktu, simpan, kirim | Ikon vektor lucide dalam komponen | Tajam pada semua resolusi; interaksi bukan bagian dari bitmap. |
| Status dan tanggal | `publication-ui.tsx`, `publication-utils.ts` | Elemen HTML semantik dan data server. |
| Sidebar, topbar, profil, SAPA | Shell SAP yang sudah ada | Menjaga konsistensi seluruh dashboard. |

Foto sampah, nama akun, angka dan tanggal dalam PNG hanyalah contoh desain. Tidak dimasukkan sebagai seed atau data frontend. Teks/tombol tidak dipotong menjadi gambar; dibuat sebagai kontrol yang dapat digunakan keyboard.

## Komponen

- `publication-page.tsx`: orkestrasi, tab, capability dan koneksi akun.
- `publication-list.tsx`: ringkasan, filter, daftar/pagination.
- `report-picker.tsx`: pemilih laporan asli dan foto yang disetujui.
- `publication-detail.tsx`: caption, timestamps, save/publish, status processing.
- `publication-settings.tsx`: formulir preferensi dan token template.
- `publication-photo.tsx`: pembacaan media sesuai scope laporan.
- `dialog-shell.tsx`: portal, focus trap, close/escape, scroll dan footer.
- `instagram.module.css`: spacing, warna, drawer dan layout responsif.
- `apps/web/lib/api/instagram.ts`: adapter endpoint usulan, tidak berisi credential.

Ruang panel 24–29 px, gap panel 20–28 px, tombol utama minimal 48 px. List berubah menjadi kartu saat lebar kontainer kurang dari 1.080 px; pengaturan menjadi satu kolom di bawah 860 px. Panel detail lebar maksimal 670 px dan penuh pada HP.

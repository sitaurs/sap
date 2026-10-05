export const dynamic: Record<string, string> = Object.fromEntries(`
Terapkan|Apply
Cadangan|Waitlisted
Berlangsung|In progress
Publikasikan kegiatan|Publish activity
Minta hasil kegiatan|Request activity results
Tunda kegiatan|Postpone activity
Lanjutkan kegiatan|Resume activity
Kecil|Small
Sedang|Medium
Besar|Large
Plastik|Plastic
Kertas|Paper
Kardus|Cardboard
Logam|Metal
Kaca|Glass
Organik|Organic
Baterai|Battery
Pakaian|Clothes
Sepatu|Shoes
Residu|Residual waste
Tidak diketahui|Unknown
Fitur kegiatan relawan belum diaktifkan oleh pengelola SAP.|Volunteer activities have not been enabled by the SAP administrator.
Data berubah sejak Anda membuka halaman. Muat versi terbaru, periksa kembali input, lalu simpan ulang.|The data has changed since you opened the page. Load the latest version, review your input, and save again.
Kuota telah penuh. Muat peserta terbaru atau pilih cadangan.|Capacity is full. Load the latest participants or choose the waiting list.
Laporan sumber belum memenuhi syarat publikasi atau izinnya sudah berubah.|The source report does not meet publishing requirements or its consent has changed.
Laporan ini sudah memiliki kegiatan aktif. Kelola kegiatan tersebut terlebih dahulu.|This report already has an active activity. Manage that activity first.
Tindakan ini tidak tersedia pada status terbaru. Muat ulang informasinya.|This action is unavailable for the latest status. Reload the information.
Tunda kegiatan terlebih dahulu sebelum mengganti koordinator.|Postpone the activity before changing its coordinator.
Periksa hubungan foto, versi publik, dan izin pemilik sebelum menyimpan.|Review photo links, public versions, and owner consent before saving.
Hasil selesai memerlukan foto sesudah untuk web yang siap dan mempunyai izin pemilik.|Completed results require a ready after photo for the web with owner consent.
Lengkapi persyaratan dan pastikan koordinator menerima penugasan.|Complete the requirements and make sure the coordinator accepts the assignment.
Perubahan peserta tidak tersedia pada status atau jadwal saat ini.|Participant changes are unavailable for the current status or schedule.
Anda tidak mempunyai izin untuk tindakan ini.|You do not have permission for this action.
Permintaan belum berhasil. Coba kembali.|The request was unsuccessful. Try again.
Waktu tidak tersedia|Time unavailable
Laporan sumber #{0} · diperbarui {1}|Source report #{0} · updated {1}
{0} tempat tersedia|{0} places available
Selesai {0}|Ends {0}
{0} tempat|{0} places
Tambahkan maksimal {0} foto pada bagian ini.|Add up to {0} photos in this section.
Bukti {0}|Evidence {0}
Hapus {0} {1}|Remove {0} {1}
Pratinjau {0}|Preview {0}
Hapus bukti {0}|Remove evidence {0}
{0} laporan · {1}|{0} reports · {1}
{0} area memiliki data.|{0} areas have data.
Masukkan enam digit kode yang dikirim ke {0}.|Enter the six-digit code sent to {0}.
Kamera {0}|Camera {0}
Lihat detail laporan {0}|View report details: {0}
Foto laporan {0}|Report photo: {0}
Buka menu akun {0}|Open account menu for {0}
Foto profil {0}|Profile photo of {0}
{0} hari|{0} days
{0}%: {1} dari {2} hasil memiliki berat terkumpul terverifikasi|{0}%: {1} of {2} results have verified collected weight
{0} dari {1} hasil|{0} of {1} results
{0} hasil belum memiliki berat terverifikasi.|{0} results do not have verified weight yet.
{0} jam|{0} hours
{0}: {1}, tampilkan daftar|{0}: {1}, show list
Detail {0}, {1}|Details of {0}, {1}
Menampilkan {0}–{1} dari {2} postingan|Showing {0}–{1} of {2} posts
{0} dari {1}|{0} of {1}
Baca contoh cerita {0}|Read sample story {0}
Cerita {0}: {1}|Story {0}: {1}
Baca cerita {0}|Read story {0}
Kelola profil {0}|Manage profile for {0}
Akun {0}|Account of {0}
Diperbarui: {0}|Updated: {0}
{0} area|{0} areas
Bukti laporan {0}|Report evidence {0}
Mengunggah foto {0} dari {1}…|Uploading photo {0} of {1}…
Foto bukti {0}|Evidence photo {0}
Hapus foto {0}|Remove photo {0}
Bukti temuan {0}|Finding evidence {0}
{0} chat SAPA · Seret untuk memindahkan|{0} SAPA chat · Drag to move
Material dikelompokkan ke kategori {0}.|The material is classified as {0}.
Lihat detail {0}, {1}, {2}|View details: {0}, {1}, {2}
Menampilkan {0} dari {1} hasil scan|Showing {0} of {1} scan results
Menampilkan {0} hasil scan|Showing {0} scan results
Foto yang dipilih: {0}|Selected photo: {0}
`.trim().split("\n").map(line => line.split("|")));

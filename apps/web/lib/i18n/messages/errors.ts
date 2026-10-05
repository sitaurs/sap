export const errors: Record<string, string> = Object.fromEntries(`
Preferensi SAPA belum tersimpan di akun.|The SAPA preference could not be saved to your account.
Chat SAPA sementara tidak tersedia. Coba lagi nanti atau buka Bantuan.|SAPA chat is temporarily unavailable. Try again later or open Help.
Respons SAPA tidak sesuai kontrak.|The SAPA response does not match the contract.
Pemuatan terlalu lama. Coba muat ulang.|Loading took too long. Try reloading.
Hasil permintaan belum diketahui. Periksa versi terbaru sebelum mencoba lagi.|The request outcome is unknown. Check the latest version before retrying.
Fitur belum tersedia. Pengelola perlu menyiapkan dan mengaktifkan layanan R1.|This feature is unavailable. The administrator needs to prepare and enable the R1 service.
Layanan belum dapat dihubungi. Coba muat ulang atau hubungi pengelola SAP.|The service cannot be reached. Try reloading or contact the SAP administrator.
Sesi berakhir. Masuk kembali untuk melanjutkan.|Your session has ended. Sign in again to continue.
Verifikasi email diperlukan. Masuk kembali dan selesaikan verifikasi.|Email verification is required. Sign in again and complete verification.
Sesi keamanan tidak valid. Muat ulang halaman sebelum melanjutkan.|The security session is invalid. Reload the page before continuing.
Akun Anda tidak memiliki izin untuk tindakan ini.|Your account does not have permission for this action.
Informasi publik telah dicabut. Foto dan ringkasan sebelumnya tidak lagi ditampilkan.|Public information has been withdrawn. Previous photos and summaries are no longer displayed.
Informasi tidak ditemukan atau tidak tersedia untuk akun Anda.|The information was not found or is unavailable to your account.
Anda sudah memiliki pembaruan yang menunggu tinjauan. Buka Kontribusi saya untuk melengkapinya.|You already have an update awaiting review. Open My contributions to complete it.
Versi informasi telah berubah. Tinjau versi terbaru; input Anda tetap disimpan.|The information version has changed. Review the latest version; your input is preserved.
Sumber laporan berubah. Perbarui sumber dan tinjau ulang gambar final sebelum melanjutkan.|The report source changed. Refresh the source and review the final image before continuing.
Masih ada penarikan yang belum selesai. Periksa operasi penarikan sebelum memutuskan koneksi.|Retractions are still in progress. Check retraction operations before disconnecting.
Kuota kegiatan telah penuh. Perbarui informasi untuk melihat status dan tempat yang tersedia.|Activity capacity is full. Refresh the information to see the status and available places.
Bukti belum memenuhi izin, versi, atau hubungan dengan sumber yang dipilih. Periksa kembali bukti.|Evidence does not meet consent, version, or selected source requirements. Review the evidence.
Gambar final dan konten terkini perlu disetujui sebelum diposting.|The final image and current content must be approved before posting.
Akun Instagram belum terhubung.|Instagram account is not connected.
Otorisasi Instagram kedaluwarsa; hubungkan ulang akun.|Instagram authorisation has expired; reconnect the account.
Izin publikasi Instagram belum lengkap; periksa otorisasi akun.|Instagram publishing permissions are incomplete; check account authorisation.
Gambar final belum siap.|The final image is not ready.
Pembuatan draf otomatis belum diaktifkan.|Automatic draft creation is not enabled.
Tindakan ini memerlukan koordinator yang telah menerima penugasan.|This action requires a coordinator who has accepted the assignment.
Fitur belum diaktifkan.|The feature is not enabled.
Konten terkini perlu persetujuan moderator.|Current content needs moderator approval.
Sumber laporan belum memenuhi syarat publikasi.|The source report does not meet publishing requirements.
Pendaftaran telah ditutup.|Registration has closed.
Kuota kegiatan sudah penuh.|Activity capacity is full.
Kejadian sudah ditutup untuk tindakan ini.|This incident is closed for this action.
Tindakan belum tersedia pada status saat ini.|The action is unavailable for the current status.
Akun ini bukan koordinator kegiatan.|This account is not the activity coordinator.
Tindakan belum tersedia. Hubungi pengelola untuk memeriksa izin dan kesiapan layanan.|The action is unavailable. Contact the administrator to check permissions and service readiness.
Respons API SAP tidak lengkap.|The SAP API response is incomplete.
Tanggal akhir harus sama atau setelah tanggal mulai.|The end date must be on or after the start date.
Pilih periode paling lama 366 hari.|Choose a period of up to 366 days.
Masukkan ID sel H3 yang valid dari peta area SAP.|Enter a valid H3 cell ID from the SAP area map.
Respons publikasi tidak sesuai kontrak R1. Hubungi pengelola SAP.|The publishing response does not match the R1 contract. Contact the SAP administrator.
`.trim().split("\n").map(line => line.split("|")));

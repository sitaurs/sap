export const impact: Record<string, string> = Object.fromEntries(`
Ringkasan dampak belum diaktifkan oleh pengelola SAP.|Impact summaries have not been enabled by the SAP administrator.
Layanan dampak belum tersedia. Coba muat ulang beberapa saat lagi.|The impact service is unavailable. Try reloading shortly.
Ringkasan dampak belum dapat dimuat.|The impact summary could not be loaded.
Isi ID sel H3 untuk memilih area tertentu.|Enter an H3 cell ID to select a specific area.
ADMIN SAP · DAMPAK|SAP ADMIN · IMPACT
Dampak|Impact
Pantau hasil aksi lingkungan dari bukti yang telah disetujui.|Track environmental action results using approved evidence.
Mockup · data contoh|Mockup · sample data
Ringkasan terverifikasi|Verified summary
Filter dampak|Impact filters
Periode|Period
Pilih tanggal sendiri|Custom dates
Cakupan|Scope
Semua area|All areas
Area contoh 1|Sample area 1
Area contoh 2|Sample area 2
Area tertentu (ID H3)|Specific area (H3 ID)
Dari tanggal|From date
Sampai tanggal|To date
ID sel area H3|Area H3 cell ID
Contoh: 8928308280fffff|Example: 8928308280fffff
Gunakan ID sel dari peta area SAP.|Use a cell ID from the SAP area map.
Memuat ringkasan dampak…|Loading impact summary…
Ringkasan belum tersedia|Summary not available yet
Ringkasan diperbarui untuk periode|Summary updated for the period
Belum ada sumber publik yang disetujui dalam periode dan area ini. Pilih filter lain untuk melihat data.|No approved public sources for this period and area. Choose other filters to view data.
Angka contoh untuk pratinjau desain · tidak berasal dari data produksi.|Sample figures for design preview · not production data.
Ringkasan hanya mencakup sumber publik yang disetujui.|The summary includes only approved public sources.
METODE DAMPAK SAP|SAP IMPACT METHOD
Angka yang dapat ditelusuri|Traceable figures
Tutup metode perhitungan|Close calculation method
Ringkasan mengikuti periode dan area yang dipilih. Hanya sumber publik yang memenuhi ketentuan SAP yang dihitung.|The summary follows the selected period and area. Only public sources meeting SAP requirements are counted.
Laporan terselesaikan|Resolved reports
Laporan publik yang bukan duplikat dan berstatus selesai dalam periode terpilih.|Public, nonduplicate reports resolved within the selected period.
Kegiatan, relawan, dan kehadiran|Activities, volunteers, and attendance
Kegiatan dihitung jika hasilnya disetujui dalam periode terpilih.|Activities count when their results are approved within the selected period.
Relawan unik:|Unique volunteers:
setiap orang dihitung satu kali.|each person is counted once.
Total kehadiran:|Total attendance:
dihitung pada setiap kegiatan yang diikuti.|counted for every activity attended.
Hanya pengukuran terverifikasi yang dilakukan dalam periode terpilih yang dihitung.|Only verified measurements taken within the selected period are counted.
Berat terkumpul, diserahkan, dan didaur ulang dicatat|Collected, handed over, and recycled weights are recorded
terpisah dan tidak dijumlahkan|separately and are not added together
. Panjang batang membandingkan setiap tahap terhadap berat terbesar.|. Bar lengths compare each stage with the largest weight.
Cakupan bukti|Evidence coverage
Persentase hasil kegiatan yang disetujui dan memiliki setidaknya satu pengukuran berat terkumpul terverifikasi, dibandingkan seluruh hasil kegiatan yang disetujui.|The percentage of approved activity results with at least one verified collected weight measurement, out of all approved activity results.
Jika belum ada hasil kegiatan yang disetujui, persentase belum tersedia.|The percentage is unavailable until activity results have been approved.
Respons penanganan|Response time
Nilai tengah (median) waktu sejak laporan dibuat hingga selesai, untuk laporan yang masuk dalam ringkasan.|The median time from report creation to resolution, for reports included in the summary.
Berat yang belum diketahui berbeda dari 0 kg.|Unknown weight is different from 0 kg.
Berat dan emisi tidak diperkirakan dari foto.|Weight and emissions are not estimated from photos.
Versi metode|Method version
Waktu ringkasan:|Summary time:
 · Data contoh| · Sample data
Mengerti|Got it
Keputusan penyelesaian disetujui|Resolution decision approved
Kegiatan disetujui|Approved activities
Hasil kegiatan dalam periode ini|Activity results in this period
Relawan unik|Unique volunteers
Dihitung satu kali per pengguna|Counted once per user
Total kehadiran|Total attendance
Kehadiran pada kegiatan disetujui|Attendance at approved activities
Ringkasan dampak|Impact summary
Berat sampah terverifikasi|Verified waste weight
Pengukuran yang telah ditinjau dan disetujui.|Measurements that have been reviewed and approved.
Belum ada data|No data yet
Belum ada pengukuran terverifikasi.|No verified measurements yet.
Setiap tahap dicatat terpisah dan tidak dijumlahkan.|Each stage is recorded separately and is not added together.
Belum ada hasil disetujui untuk menghitung cakupan|No approved results to calculate coverage
Belum ada hasil|No results yet
Memiliki berat terkumpul terverifikasi.|Have verified collected weight.
Cakupan dihitung setelah hasil kegiatan disetujui.|Coverage is calculated after activity results are approved.
Semua hasil memiliki berat terkumpul terverifikasi.|All results have verified collected weight.
Median waktu penyelesaian|Median resolution time
Dari laporan masuk hingga keputusan selesai yang disetujui.|From report submission to the approved resolution decision.
Dasar perhitungan|Calculation basis
Sumber publik yang disetujui|Approved public sources
Periode dan cakupan mengikuti filter|Period and scope follow the filters
Tanpa estimasi berat dari foto|No weight estimates from photos
Lihat metode|View method
`.trim().split("\n").map(line => line.split("|")));

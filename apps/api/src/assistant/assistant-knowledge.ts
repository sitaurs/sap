/**
 * SAPA starter knowledge base (SAPA_ASSISTANT.md §18). This is the ONLY source
 * of truth the model may answer from: the service retrieves the entries most
 * relevant to the page + question and injects them as a KONTEKS block. Entries
 * carry no PII, coordinates, media, or invented statistics. Items still marked
 * `TODO-VERIFIKASI` deliberately steer to Bantuan instead of quoting a number.
 */
import type { PageContext, SuggestedAction } from './assistant.types.js';

export interface KnowledgeEntry {
  readonly id: string;
  /** Retrieval tag: the page this entry is most relevant to. */
  readonly pageContext: PageContext;
  readonly question: string;
  readonly answer: string;
  readonly suggestedActions: SuggestedAction[];
}

export const KNOWLEDGE_BASE: readonly KnowledgeEntry[] = [
  // Scan
  {
    id: 'scan-cara',
    pageContext: 'scan',
    question: 'Bagaimana cara scan sampah?',
    answer:
      'Buka halaman Scan, ambil atau unggah satu foto sampah yang jelas dan cukup terang, lalu tunggu hasilnya. SAPA tidak memindai untukmu — kamu yang mengambil fotonya.',
    suggestedActions: [{ label: 'Buka Scan', target: 'scan' }],
  },
  {
    id: 'scan-foto-jelas',
    pageContext: 'scan',
    question: 'Bagaimana foto yang baik untuk scan?',
    answer:
      'Pastikan objek terlihat penuh, pencahayaan cukup, dan tidak buram. Satu foto per scan sudah cukup.',
    suggestedActions: [{ label: 'Buka Scan', target: 'scan' }],
  },
  {
    id: 'scan-hasil',
    pageContext: 'scan_history',
    question: 'Apa arti hasil scan saya?',
    answer:
      "Hasil bisa berupa satu kategori sampah yang dikenali, 'tidak ada sampah', atau 'tidak dikenali/campuran' bila model ragu. Riwayat scan menyimpan hasil-hasil sebelumnya.",
    suggestedActions: [{ label: 'Riwayat scan', target: 'scan_history' }],
  },
  {
    id: 'scan-gagal',
    pageContext: 'scan',
    question: 'Kenapa scan saya gagal?',
    answer:
      'Scan bisa gagal bila foto tidak didukung atau layanan pengenalan sedang tidak tersedia. Coba lagi dengan foto lain; jika terus gagal, buka Bantuan.',
    suggestedActions: [
      { label: 'Coba lagi', target: 'scan' },
      { label: 'Bantuan', target: 'help' },
    ],
  },
  // Laporan
  {
    id: 'report-buat',
    pageContext: 'my_reports',
    question: 'Bagaimana cara membuat laporan penumpukan sampah?',
    answer:
      'Buka menu Laporan, isi lokasi dan foto penumpukan, lalu kirim. Laporan baru berstatus menunggu pemeriksaan sebelum tampil di peta publik.',
    suggestedActions: [{ label: 'Laporan saya', target: 'my_reports' }],
  },
  {
    id: 'report-status',
    pageContext: 'my_reports',
    question: 'Apa arti status laporan?',
    answer:
      'Menunggu pemeriksaan: baru dikirim. Terverifikasi: sudah dicek admin. Sedang ditangani: dalam penanganan. Selesai: sudah ditangani. Duplikat: sama dengan laporan lain di dekatnya.',
    suggestedActions: [{ label: 'Laporan saya', target: 'my_reports' }],
  },
  {
    id: 'report-belum-peta',
    pageContext: 'my_reports',
    question: 'Kenapa laporan saya belum muncul di peta?',
    answer:
      'Peta hanya menampilkan laporan yang sudah diverifikasi. Laporan yang baru dikirim masih menunggu pemeriksaan. Cek statusnya di Laporan saya.',
    suggestedActions: [{ label: 'Laporan saya', target: 'my_reports' }],
  },
  // Peta area
  {
    id: 'map-baca',
    pageContext: 'areas',
    question: 'Bagaimana cara membaca peta area rawan?',
    answer:
      'Peta merangkum kejadian dari laporan terverifikasi per area. Warna/intensitas menandai tingkat kerawanan berdasarkan jumlah kejadian, bukan ramalan masa depan.',
    suggestedActions: [{ label: 'Buka Peta', target: 'areas' }],
  },
  {
    id: 'map-belum-data',
    pageContext: 'areas',
    question: 'Mengapa area ini belum punya data?',
    answer:
      'Artinya belum ada laporan terverifikasi di area itu pada rentang waktu yang dipilih. Ini bukan berarti area pasti bersih — hanya belum ada data.',
    suggestedActions: [{ label: 'Buka Peta', target: 'areas' }],
  },
  {
    id: 'map-risiko',
    pageContext: 'areas',
    question: 'Bagaimana tingkat kerawanan dihitung?',
    answer:
      'Kerawanan dihitung dari banyaknya kejadian terverifikasi dan seberapa sering terjadi di area itu; makin banyak dan makin sering, makin tinggi. Untuk ambang pastinya, lihat halaman Bantuan.',
    suggestedActions: [{ label: 'Buka Peta', target: 'areas' }],
  },
  // Poin & pencapaian. Nilai/ambang pasti sengaja TIDAK dikutip (TODO-VERIFIKASI
  // PRD §7); jawaban mengarahkan ke Bantuan agar tidak ada angka yang ditebak.
  {
    id: 'poin-scan',
    pageContext: 'achievements',
    question: 'Bagaimana cara dapat poin dari scan?',
    answer:
      'Scan yang berhasil mengenali kategori sampah memberi poin, dengan batas harian. Untuk nilai dan batas pastinya, lihat halaman Bantuan.',
    suggestedActions: [{ label: 'Pencapaian', target: 'achievements' }],
  },
  {
    id: 'poin-laporan',
    pageContext: 'achievements',
    question: 'Bagaimana poin dari laporan?',
    answer:
      'Laporan yang terverifikasi memberi poin, dengan batas harian. Untuk nilai dan batas pastinya, lihat halaman Bantuan.',
    suggestedActions: [{ label: 'Pencapaian', target: 'achievements' }],
  },
  {
    id: 'badge',
    pageContext: 'achievements',
    question: 'Bagaimana cara membuka lencana?',
    answer:
      'Lencana terbuka dari aktivitas dan poin yang terkumpul. Untuk daftar dan syarat lencana, lihat halaman Bantuan.',
    suggestedActions: [{ label: 'Pencapaian', target: 'achievements' }],
  },
  // Pengaturan & privasi
  {
    id: 'privasi-foto-lokasi',
    pageContext: 'settings',
    question: 'Bagaimana foto dan lokasi saya digunakan?',
    answer:
      'Foto dan lokasi laporanmu bersifat privat. Data yang tampil publik hanya ringkasan area dan informasi yang aman; foto dan koordinat tepatmu tidak dibagikan.',
    suggestedActions: [
      { label: 'Pengaturan', target: 'settings' },
      { label: 'Bantuan', target: 'help' },
    ],
  },
  {
    id: 'sapa-toggle',
    pageContext: 'settings',
    question: 'Bagaimana mematikan atau menyalakan SAPA?',
    answer:
      "Buka Pengaturan lalu ubah sakelar 'Teman virtual SAPA'. Mematikannya menyembunyikan ikon SAPA; kamu tetap bisa membuka halaman Bantuan.",
    suggestedActions: [{ label: 'Pengaturan', target: 'settings' }],
  },
  // Bantuan / fallback (selalu disertakan sebagai pengaman)
  {
    id: 'fallback-unknown',
    pageContext: 'help',
    question: 'Pertanyaan di luar KONTEKS',
    answer:
      'Maaf, aku belum punya informasi soal itu. Coba buka halaman Bantuan untuk panduan lebih lengkap.',
    suggestedActions: [{ label: 'Buka Bantuan', target: 'help' }],
  },
  {
    id: 'luar-lingkup',
    pageContext: 'help',
    question: 'SAPA bisa buatkan/kirim laporan untukku?',
    answer:
      'Aku tidak bisa membuat, mengubah, atau memverifikasi laporan. Kamu melakukannya sendiri lewat halaman Laporan; aku bantu menjelaskan caranya.',
    suggestedActions: [
      { label: 'Laporan saya', target: 'my_reports' },
      { label: 'Bantuan', target: 'help' },
    ],
  },
];

/** Safety-net entries always injected regardless of page/query (§18 note). */
const SAFETY_NET_IDS = ['fallback-unknown', 'luar-lingkup'] as const;

/** Max KB entries injected per call — keep KONTEKS small to save tokens & focus. */
const MAX_RETRIEVED = 6;

const STOPWORDS = new Set([
  'yang', 'untuk', 'dari', 'dan', 'atau', 'ke', 'di', 'apa', 'apakah', 'kah',
  'bagaimana', 'kenapa', 'mengapa', 'saya', 'aku', 'itu', 'ini', 'dengan', 'cara',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Retrieve the KB entries most relevant to the active page and the user's
 * question. Page-tagged entries get a boost so suggestions match the current
 * screen; a lightweight token overlap ranks the rest. The two safety-net entries
 * are always present so the model can fall back or refuse without inventing text.
 */
export function retrieveKnowledge(message: string, pageContext: PageContext): KnowledgeEntry[] {
  const queryTokens = new Set(tokenize(message));
  const scored = KNOWLEDGE_BASE.map((entry) => {
    const entryTokens = tokenize(`${entry.question} ${entry.answer}`);
    let overlap = 0;
    for (const token of entryTokens) if (queryTokens.has(token)) overlap += 1;
    const pageBoost = entry.pageContext === pageContext ? 3 : 0;
    return { entry, score: overlap + pageBoost };
  });

  const selected = new Map<string, KnowledgeEntry>();
  for (const id of SAFETY_NET_IDS) {
    const entry = KNOWLEDGE_BASE.find((item) => item.id === id);
    if (entry) selected.set(entry.id, entry);
  }

  scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .forEach(({ entry }) => {
      if (selected.size < MAX_RETRIEVED) selected.set(entry.id, entry);
    });

  return [...selected.values()];
}

/** Render retrieved entries as the `KONTEKS` block prepended to the user turn. */
export function buildContextBlock(entries: KnowledgeEntry[], pageContext: PageContext): string {
  const lines = entries.map((entry) => {
    const actions = entry.suggestedActions.map((action) => `${action.label}->${action.target}`).join(', ');
    return `- (${entry.id}) T: ${entry.question}\n  J: ${entry.answer}\n  saran: [${actions}]`;
  });
  return [
    `KONTEKS (pageContext aktif: ${pageContext}) — jawab HANYA dari entri di bawah:`,
    ...lines,
  ].join('\n');
}

/**
 * Indonesian stop-word list + stripping helper, shared by SAPA retrieval.
 *
 * Neon's managed Postgres does not ship an Indonesian text-search configuration
 * and forbids loading native `.stop` dictionary files, so the FTS column uses the
 * `simple` config over text that has already had stop words removed HERE, in the
 * application, before it is stored or queried. The same list backs the in-memory
 * token-overlap fallback so both retrieval paths agree on what counts as a term.
 *
 * The list is the Snowball Indonesian stop-word set (function words, pronouns,
 * conjunctions, and common question words) — high-frequency tokens that carry no
 * topical signal for "how do I use feature X" style questions.
 */
export const INDONESIAN_STOPWORDS: ReadonlySet<string> = new Set([
  'ada', 'adalah', 'adanya', 'adapun', 'agak', 'agaknya', 'agar', 'akan', 'akankah',
  'akhir', 'akhiri', 'akhirnya', 'aku', 'akulah', 'amat', 'amatlah', 'anda', 'andalah',
  'antar', 'antara', 'antaranya', 'apa', 'apaan', 'apabila', 'apakah', 'apalagi',
  'apatah', 'atau', 'ataukah', 'ataupun', 'bagai', 'bagaikan', 'bagaimana',
  'bagaimanakah', 'bagaimanapun', 'bagi', 'bahkan', 'bahwa', 'bahwasanya', 'baik',
  'bakal', 'bakalan', 'balik', 'banyak', 'bapak', 'baru', 'bawah', 'beberapa', 'begini',
  'beginian', 'beginikah', 'beginilah', 'begitu', 'begitukah', 'begitulah', 'begitupun',
  'belum', 'belumlah', 'benar', 'benarkah', 'benarlah', 'berapa', 'berapakah',
  'berapalah', 'berapapun', 'berarti', 'berbagai', 'bermacam', 'bersama', 'bertanya',
  'betul', 'betulkah', 'biasa', 'biasanya', 'bila', 'bilakah', 'bisa', 'bisakah', 'boleh',
  'bolehkah', 'bolehlah', 'buat', 'bukan', 'bukankah', 'bukanlah', 'bukannya', 'bung',
  'cara', 'caranya', 'cukup', 'cukupkah', 'cukuplah', 'cuma', 'dahulu', 'dalam', 'dan',
  'dapat', 'dari', 'daripada', 'dekat', 'demi', 'demikian', 'demikianlah', 'dengan',
  'depan', 'di', 'dia', 'dialah', 'diantara', 'dini', 'dong', 'dulu', 'entah', 'gimana',
  'guna', 'hanya', 'hanyalah', 'harus', 'haruslah', 'harusnya', 'hendak', 'hendaklah',
  'hendaknya', 'hingga', 'ia', 'ialah', 'ibarat', 'ingin', 'inginkah', 'inginkan', 'ini',
  'inikah', 'inilah', 'itu', 'itukah', 'itulah', 'jadi', 'jangan', 'jangankan', 'janganlah',
  'jika', 'jikalau', 'juga', 'justru', 'kah', 'kalau', 'kalaulah', 'kalaupun', 'kalian',
  'kami', 'kamilah', 'kamu', 'kamulah', 'kan', 'kapan', 'kapankah', 'kapanpun', 'karena',
  'karenanya', 'ke', 'kecil', 'kembali', 'kemudian', 'kena', 'kepada', 'kepadanya',
  'ketika', 'khususnya', 'kini', 'kira', 'kita', 'kok', 'ku', 'lagi', 'lah', 'lain',
  'lainnya', 'lalu', 'lama', 'lebih', 'lewat', 'macam', 'maka', 'makanya', 'makin',
  'malah', 'malahan', 'mampu', 'mana', 'manakala', 'manalagi', 'masih', 'masing', 'mau',
  'maupun', 'melainkan', 'melalui', 'memang', 'mempunyai', 'mengapa', 'mereka',
  'merekalah', 'merupakan', 'meski', 'meskipun', 'mungkin', 'mungkinkah', 'nah', 'namun',
  'nanti', 'nyaris', 'oleh', 'olehnya', 'pada', 'padahal', 'padanya', 'pak', 'paling',
  'para', 'pasti', 'per', 'pernah', 'pula', 'pun', 'punya', 'rupanya', 'saat', 'saja',
  'sajalah', 'saling', 'sama', 'sambil', 'sampai', 'sana', 'sang', 'saya', 'sayalah',
  'se', 'sebab', 'sebagai', 'sebagaimana', 'sebagainya', 'sebaiknya', 'sebaliknya',
  'sebelum', 'sebelumnya', 'sebenarnya', 'sebesar', 'sebetulnya', 'sebisanya', 'sebuah',
  'secara', 'sedang', 'sedangkan', 'sedemikian', 'sedikit', 'segala', 'segera',
  'sehingga', 'sejak', 'sejenak', 'sekadar', 'sekali', 'sekalian', 'sekaligus',
  'sekalipun', 'sekarang', 'sekitar', 'selain', 'selalu', 'selama', 'seluruh', 'semacam',
  'semakin', 'semasa', 'semaunya', 'sementara', 'semisal', 'semua', 'semuanya', 'sendiri',
  'seolah', 'seorang', 'sepanjang', 'seperti', 'sepertinya', 'seraya', 'sering',
  'serta', 'sesaat', 'sesama', 'sesegera', 'sesekali', 'seseorang', 'sesuatu', 'sesudah',
  'setelah', 'setiap', 'setidaknya', 'sewaktu', 'siapa', 'siapakah', 'sini', 'situ',
  'suatu', 'sudah', 'sudahkah', 'sudahlah', 'supaya', 'tadi', 'tanpa', 'tapi', 'telah',
  'tentang', 'tentu', 'tentulah', 'tentunya', 'terhadap', 'terlalu', 'terlebih', 'ternyata',
  'tersebut', 'tetap', 'tetapi', 'tiap', 'tidak', 'tidakkah', 'tidaklah', 'toh', 'tuh',
  'tak', 'untuk', 'wah', 'waktu', 'walau', 'walaupun', 'yaitu', 'yakni', 'yang',
]);

/**
 * Lowercase, drop non-alphanumeric characters, and remove stop words + very short
 * tokens. Returns the surviving content terms in order. Used both to build the
 * corpus `content_search` column and to normalize incoming queries so the FTS and
 * trigram matches operate on the same reduced vocabulary.
 */
export function stripStopwords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !INDONESIAN_STOPWORDS.has(token));
}

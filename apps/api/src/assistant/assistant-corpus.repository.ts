import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import {
  corpusRowToEntry,
  type CorpusRow,
  type KnowledgeEntry,
} from './assistant-knowledge.js';

/** Reciprocal-rank-fusion constant. Larger k = flatter weighting across ranks. */
const RRF_K = 60;
/** Fusion weights: dense (semantic) leads, lexical supports, trigram guards typos. */
const WEIGHT_DENSE = 0.6;
const WEIGHT_LEXICAL = 0.3;
const WEIGHT_TRIGRAM = 0.1;
/** Trigram similarity floor for a row to enter the typo-tolerant candidate list. */
const TRIGRAM_MIN = 0.1;
/** Small additive boost so entries tagged to the active page surface, like the KB path. */
const PAGE_BONUS = 0.02;
/** Per-list candidate cap and overall row cap. The corpus is small; these are guards. */
const CANDIDATES = 50;
const ROW_CAP = 50;

/** A fused-scored corpus row: the mapped entry plus retrieval metadata. */
export interface ScoredEntry {
  entry: KnowledgeEntry;
  score: number;
  isSafetyNet: boolean;
}

/** A corpus row that still needs (or needs to refresh) its embedding vector. */
export interface EmbeddingBackfillRow {
  id: string;
  question: string;
  answer: string;
}

type HybridRow = CorpusRow & { score: string | number; is_safety_net: boolean };

/**
 * Data access for the `sapa_corpus` table (SAPA Step 4). Hybrid retrieval fuses
 * three ranked candidate lists — pgvector dense cosine, Postgres full-text, and
 * pg_trgm similarity — with Reciprocal Rank Fusion. Text is stored/queried with
 * stop words already removed app-side because Neon's managed Postgres has no
 * Indonesian FTS dictionary (see indonesian-stopwords.ts).
 */
@Injectable()
export class SapaCorpusRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /** True when at least one embedded row exists, i.e. the corpus is usable. */
  async hasEmbeddedRows(): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM sapa_corpus WHERE embedding IS NOT NULL) AS exists
    `;
    return rows[0]?.exists ?? false;
  }

  /**
   * Retrieve fused candidates for a query. `queryVector` is a pgvector text
   * literal (already L2-normalized) or null when embeddings are unavailable — in
   * which case the dense list is empty and results fall back to lexical+trigram.
   * `queryText` is the stop-word-stripped query. Safety-net rows and rows tagged
   * to the active page are always returned so the caller can guarantee their
   * presence; ranking/capping is applied by the caller to mirror the KB path.
   */
  async hybridSearch(
    queryVector: string | null,
    queryText: string,
    pageContext: string,
  ): Promise<ScoredEntry[]> {
    const rows = await this.sql<HybridRow[]>`
      WITH dense AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${queryVector}::vector) AS rnk
        FROM sapa_corpus
        WHERE ${queryVector}::text IS NOT NULL AND embedding IS NOT NULL
        ORDER BY rnk
        LIMIT ${CANDIDATES}
      ),
      lexical AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank(fts, qq.query) DESC) AS rnk
        FROM sapa_corpus, (SELECT plainto_tsquery('simple', ${queryText}::text) AS query) qq
        WHERE ${queryText}::text <> '' AND fts @@ qq.query
        ORDER BY rnk
        LIMIT ${CANDIDATES}
      ),
      trg AS (
        SELECT id, row_number() OVER (ORDER BY similarity(content_search, ${queryText}::text) DESC) AS rnk
        FROM sapa_corpus
        WHERE ${queryText}::text <> '' AND similarity(content_search, ${queryText}::text) > ${TRIGRAM_MIN}::float8
        ORDER BY rnk
        LIMIT ${CANDIDATES}
      )
      SELECT c.id, c.page_context, c.question, c.answer, c.suggested_actions, c.source, c.url,
             c.is_safety_net,
               ${WEIGHT_DENSE}::float8 * COALESCE(1.0 / (${RRF_K}::float8 + dense.rnk), 0)
             + ${WEIGHT_LEXICAL}::float8 * COALESCE(1.0 / (${RRF_K}::float8 + lexical.rnk), 0)
             + ${WEIGHT_TRIGRAM}::float8 * COALESCE(1.0 / (${RRF_K}::float8 + trg.rnk), 0)
             + CASE WHEN c.page_context = ${pageContext}::text THEN ${PAGE_BONUS}::float8 ELSE 0 END AS score
      FROM sapa_corpus c
      LEFT JOIN dense ON dense.id = c.id
      LEFT JOIN lexical ON lexical.id = c.id
      LEFT JOIN trg ON trg.id = c.id
      WHERE dense.id IS NOT NULL OR lexical.id IS NOT NULL OR trg.id IS NOT NULL
         OR c.is_safety_net OR c.page_context = ${pageContext}::text
      ORDER BY score DESC
      LIMIT ${ROW_CAP}
    `;
    return rows.map((row) => ({
      entry: corpusRowToEntry(row),
      score: Number(row.score),
      isSafetyNet: row.is_safety_net,
    }));
  }

  /** Rows whose embedding is missing or was produced by a different model. */
  async listNeedingEmbedding(model: string): Promise<EmbeddingBackfillRow[]> {
    return this.sql<EmbeddingBackfillRow[]>`
      SELECT id, question, answer
      FROM sapa_corpus
      WHERE embedding IS NULL OR embedding_model IS DISTINCT FROM ${model}
      ORDER BY id
    `;
  }

  /** Store an embedding (pgvector text literal) and record the model that made it. */
  async setEmbedding(id: string, vectorLiteral: string, model: string): Promise<void> {
    await this.sql`
      UPDATE sapa_corpus
      SET embedding = ${vectorLiteral}::vector, embedding_model = ${model}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  /** {total rows, rows with an embedding} — for CLI progress reporting. */
  async counts(): Promise<{ total: number; embedded: number }> {
    const rows = await this.sql<{ total: string; embedded: string }[]>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
      FROM sapa_corpus
    `;
    return { total: Number(rows[0]?.total ?? 0), embedded: Number(rows[0]?.embedded ?? 0) };
  }
}

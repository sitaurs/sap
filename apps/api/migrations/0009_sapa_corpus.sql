-- 0009_sapa_corpus
-- SAPA Step 4 hybrid retrieval (SAPA_FEATURE_PLAN.md). Persists the SAPA knowledge
-- corpus so retrieval can fuse three signals: pgvector dense cosine (semantic),
-- Postgres full-text (lexical), and pg_trgm similarity (typo tolerance), combined
-- with Reciprocal Rank Fusion in the corpus repository.
--
-- Neon's managed Postgres ships no Indonesian FTS dictionary and forbids loading
-- native `.stop` files, so stop words are removed in the application (see
-- indonesian-stopwords.ts) and `content_search` stores the already-stripped text.
-- The `fts` column therefore uses the `simple` configuration over that reduced text.
--
-- Embeddings are backfilled out-of-band by the sapa:embed CLI, so `embedding` is
-- nullable; text rows are seeded first and remain lexically searchable meanwhile.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE sapa_corpus (
  id                text PRIMARY KEY,
  page_context      text NOT NULL,
  question          text NOT NULL,
  answer            text NOT NULL,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source            text,
  url               text,
  is_safety_net     boolean NOT NULL DEFAULT false,
  -- Stop-word-stripped "question answer" text; source for both FTS and trigram.
  content_search    text NOT NULL DEFAULT '',
  fts               tsvector GENERATED ALWAYS AS (to_tsvector('simple', content_search)) STORED,
  -- 1536-dim L2-normalized vectors (gemini-embedding-001, reduced dims); < the
  -- pgvector 2000-dim HNSW ceiling. NULL until the backfill CLI populates it.
  embedding         vector(1536),
  embedding_model   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Lexical: GIN over the generated tsvector.
CREATE INDEX sapa_corpus_fts_idx ON sapa_corpus USING GIN (fts);
-- Typo tolerance: trigram GIN over the stripped search text.
CREATE INDEX sapa_corpus_content_trgm_idx ON sapa_corpus USING GIN (content_search gin_trgm_ops);
-- Semantic: HNSW over cosine distance. Vectors are normalized app-side.
CREATE INDEX sapa_corpus_embedding_idx ON sapa_corpus USING hnsw (embedding vector_cosine_ops);
-- Page-tagged lookups feed the small additive page boost during fusion.
CREATE INDEX sapa_corpus_page_idx ON sapa_corpus (page_context);

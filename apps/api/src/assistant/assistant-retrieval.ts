import { Injectable, Logger } from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import {
  AssistantEmbedder,
  EmbeddingUnavailableError,
  toVectorLiteral,
} from './assistant-embedding.js';
import {
  SapaCorpusRepository,
  type ScoredEntry,
} from './assistant-corpus.repository.js';
import {
  MAX_RETRIEVED,
  retrieveKnowledge,
  type KnowledgeEntry,
} from './assistant-knowledge.js';
import type { PageContext } from './assistant.types.js';
import { stripStopwords } from './indonesian-stopwords.js';

/**
 * Hybrid retriever for SAPA Step 4. Embeds the query, runs the fused
 * dense+lexical+trigram search in {@link SapaCorpusRepository}, then pins the
 * safety-net entries and fills the rest by fused score up to MAX_RETRIEVED —
 * the same selection contract the in-memory {@link retrieveKnowledge} provides,
 * so downstream context/citation code is unchanged.
 *
 * Degradation is deliberate: if embeddings are unavailable the dense signal is
 * dropped (lexical+trigram still answer); if the corpus is unseeded or the query
 * fails entirely, it falls back to the curated in-memory KB so SAPA keeps
 * working. Retrieved text is untrusted data and is never treated as instructions.
 */
@Injectable()
export class HybridRetriever {
  private readonly logger = new Logger(HybridRetriever.name);
  private readonly config: AppConfig = getConfig();

  constructor(
    private readonly embedder: AssistantEmbedder,
    private readonly corpus: SapaCorpusRepository,
  ) {}

  /** True only when the hybrid path is switched on and the gateway is configured. */
  isEnabled(): boolean {
    return this.config.SAPA_RETRIEVAL_HYBRID_ENABLED && this.embedder.isConfigured();
  }

  async retrieve(message: string, pageContext: PageContext): Promise<KnowledgeEntry[]> {
    try {
      if (!(await this.corpus.hasEmbeddedRows())) {
        // Corpus not backfilled yet — the KB path is the source of truth.
        return retrieveKnowledge(message, pageContext);
      }

      const queryVector = await this.embedQuery(message);
      const queryText = stripStopwords(message).join(' ');
      const scored = await this.corpus.hybridSearch(queryVector, queryText, pageContext);
      return this.select(scored);
    } catch (error) {
      this.logger.warn(`hybrid retrieval failed, falling back to KB: ${(error as Error).message}`);
      return retrieveKnowledge(message, pageContext);
    }
  }

  /** Embed the raw query; return null (dense signal skipped) if unavailable. */
  private async embedQuery(message: string): Promise<string | null> {
    try {
      const vector = await this.embedder.embed(message);
      return toVectorLiteral(vector);
    } catch (error) {
      if (error instanceof EmbeddingUnavailableError) {
        this.logger.warn(`query embedding unavailable (${error.message}); lexical-only`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Pin safety-net entries first, then fill by fused score up to MAX_RETRIEVED —
   * mirroring retrieveKnowledge so the KONTEKS block and citation resolution
   * behave identically regardless of retrieval path.
   */
  private select(scored: ScoredEntry[]): KnowledgeEntry[] {
    const selected = new Map<string, KnowledgeEntry>();
    for (const row of scored) {
      if (row.isSafetyNet) selected.set(row.entry.id, row.entry);
    }
    for (const row of [...scored].sort((a, b) => b.score - a.score)) {
      if (selected.size >= MAX_RETRIEVED) break;
      selected.set(row.entry.id, row.entry);
    }
    return [...selected.values()];
  }
}

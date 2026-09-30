import { Injectable, Logger } from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';

/** Raised when the embeddings endpoint is unreachable, times out, or misbehaves. */
export class EmbeddingUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'EmbeddingUnavailableError';
  }
}

/**
 * Dense-embedding client for SAPA hybrid retrieval. Calls the SAPA gateway's
 * OpenAI-compatible `POST {SAPA_LLM_BASE_URL}/embeddings` with the same Bearer key
 * as the chat provider (the gateway only has working credentials for Gemini).
 *
 * gemini-embedding-001 returns vectors that are NOT unit-norm at the reduced
 * `dimensions: 1536` we store, so every vector is L2-normalized here before it is
 * used for the cosine (`<=>`) search — the DB index assumes normalized inputs.
 *
 * Security: the Authorization header and the input text are NEVER logged; only
 * coarse failure reasons are recorded.
 */
@Injectable()
export class AssistantEmbedder {
  private readonly logger = new Logger(AssistantEmbedder.name);
  private readonly config: AppConfig = getConfig();

  /** True only when the gateway + key are configured for embedding calls. */
  isConfigured(): boolean {
    return Boolean(this.config.SAPA_LLM_BASE_URL && this.config.SAPA_LLM_API_KEY);
  }

  get dimension(): number {
    return this.config.SAPA_EMBEDDING_DIM;
  }

  /**
   * Embed a single text and return an L2-normalized vector of length
   * SAPA_EMBEDDING_DIM. Throws EmbeddingUnavailableError on any failure so callers
   * can degrade (retrieval falls back to lexical-only; the backfill CLI aborts).
   */
  async embed(text: string): Promise<number[]> {
    const baseUrl = this.config.SAPA_LLM_BASE_URL;
    const apiKey = this.config.SAPA_LLM_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new EmbeddingUnavailableError('SAPA embeddings are not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.SAPA_EMBEDDING_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.SAPA_EMBEDDING_MODEL,
          input: text,
          dimensions: this.config.SAPA_EMBEDDING_DIM,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = (error as Error).name === 'AbortError' ? 'timeout' : 'network error';
      this.logger.warn(`SAPA embeddings unavailable: ${reason}`);
      throw new EmbeddingUnavailableError(reason);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.warn(`SAPA embeddings returned status ${response.status}`);
      throw new EmbeddingUnavailableError(`upstream status ${response.status}`);
    }

    const vector = await this.extractVector(response);
    return normalize(vector, this.config.SAPA_EMBEDDING_DIM);
  }

  /** Pull the first embedding array out of the OpenAI-compatible envelope. */
  private async extractVector(response: Response): Promise<number[]> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EmbeddingUnavailableError('non-JSON upstream body');
    }
    const embedding = (body as { data?: Array<{ embedding?: unknown }> })?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new EmbeddingUnavailableError('empty upstream embedding');
    }
    const vector = embedding.map((value) => Number(value));
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new EmbeddingUnavailableError('non-finite embedding value');
    }
    return vector;
  }
}

/**
 * L2-normalize `vector` to unit length. Throws when the model returns a vector of
 * the wrong length (a silent dimension mismatch would corrupt every cosine score)
 * or a zero vector (which cannot be normalized).
 */
export function normalize(vector: number[], expectedDim: number): number[] {
  if (vector.length !== expectedDim) {
    throw new EmbeddingUnavailableError(`expected ${expectedDim} dims, got ${vector.length}`);
  }
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) {
    throw new EmbeddingUnavailableError('zero-magnitude embedding');
  }
  return vector.map((value) => value / norm);
}

/** Format a vector as a pgvector text literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

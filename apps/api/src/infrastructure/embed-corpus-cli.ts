import { pathToFileURL } from 'node:url';
import { loadConfig } from '@sap/config';
import { SapaCorpusRepository } from '../assistant/assistant-corpus.repository.js';
import { AssistantEmbedder, toVectorLiteral } from '../assistant/assistant-embedding.js';
import type { Database } from './database.module.js';
import { createPostgresClient } from './postgres.js';

/**
 * Backfill dense embeddings for the SAPA corpus. Seed rows are written text-only
 * (see seed.ts); this CLI reads every row whose embedding is missing or was made
 * by a different model, embeds its "question + answer" text via the SAPA gateway,
 * and stores the L2-normalized vector. Idempotent and safe to re-run: rows that
 * already have a current-model embedding are skipped. Never logs the query text
 * or the API key.
 */
export async function runEmbedCorpusCli(): Promise<void> {
  const config = loadConfig();
  const embedder = new AssistantEmbedder();
  if (!embedder.isConfigured()) {
    throw new Error('SAPA embeddings are not configured (SAPA_LLM_BASE_URL / SAPA_LLM_API_KEY).');
  }

  const model = config.SAPA_EMBEDDING_MODEL;
  const url = config.DATABASE_DIRECT_URL ?? config.DATABASE_URL;
  const sql = createPostgresClient(url, 1);
  const corpus = new SapaCorpusRepository(sql as unknown as Database);
  try {
    const pending = await corpus.listNeedingEmbedding(model);
    if (pending.length === 0) {
      const { total, embedded } = await corpus.counts();
      console.log(`SAPA corpus already embedded (${embedded}/${total} rows, model ${model}).`);
      return;
    }

    console.log(`Embedding ${pending.length} SAPA corpus row(s) with ${model}…`);
    let done = 0;
    for (const row of pending) {
      const vector = await embedder.embed(`${row.question}\n${row.answer}`);
      await corpus.setEmbedding(row.id, toVectorLiteral(vector), model);
      done += 1;
      console.log(`  [${done}/${pending.length}] ${row.id}`);
    }

    const { total, embedded } = await corpus.counts();
    console.log(`Done. ${embedded}/${total} SAPA corpus rows now have an embedding.`);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runEmbedCorpusCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

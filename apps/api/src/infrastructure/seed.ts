import { getConfig } from '@sap/config';
import type { Sql, TransactionSql } from 'postgres';
import { knowledgeBaseSeedRows } from '../assistant/assistant-knowledge.js';

/** Fixed EcoLens taxonomy. IDs match the OpenAPI CategoryId enum exactly. */
const CATEGORIES: ReadonlyArray<readonly [id: string, nameId: string, sortOrder: number]> = [
  ['battery', 'Baterai', 1],
  ['biological', 'Sampah organik', 2],
  ['cardboard', 'Kardus', 3],
  ['clothes', 'Pakaian', 4],
  ['glass', 'Kaca', 5],
  ['metal', 'Logam', 6],
  ['paper', 'Kertas', 7],
  ['plastic', 'Plastik', 8],
  ['shoes', 'Sepatu', 9],
  ['trash', 'Sampah lainnya', 10],
];

const ACHIEVEMENTS: ReadonlyArray<readonly [id: string, name: string, description: string]> = [
  ['first_scan', 'Scan Pertama', 'Menyelesaikan scan pertama.'],
  ['scanner_10', 'Rajin Memindai', 'Menyelesaikan 10 scan.'],
  ['first_verified_report', 'Laporan Terverifikasi', 'Laporan pertama yang diverifikasi admin.'],
  ['streak_3', 'Konsisten 3 Hari', 'Beraktivitas tiga hari berturut-turut.'],
];

/**
 * Reference data that is safe to seed in every environment, including
 * production: the category taxonomy and achievement definitions. Idempotent.
 */
export async function seedReference(sql: Sql): Promise<void> {
  const config = getConfig();
  await sql.begin(async (tx) => {
    for (const [id, nameId, sortOrder] of CATEGORIES) {
      await tx`
        INSERT INTO categories (id, name_id, sort_order, active)
        VALUES (${id}, ${nameId}, ${sortOrder}, true)
        ON CONFLICT (id) DO UPDATE
          SET name_id = EXCLUDED.name_id, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active
      `;
    }
    for (const [id, name, description] of ACHIEVEMENTS) {
      await tx`
        INSERT INTO achievement_definitions (id, name, description, criteria_version)
        VALUES (${id}, ${name}, ${description}, 1)
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, description = EXCLUDED.description
      `;
    }
    // Hybrid scan detection singleton. Seeded from env ONCE; afterwards the row is
    // authoritative and admin-editable, so never overwrite an existing row.
    await tx`
      INSERT INTO scan_settings (id, mode, confidence_threshold, vision_enabled, vision_model)
      VALUES (
        'singleton',
        ${config.SCAN_HYBRID_MODE},
        ${config.SCAN_CONFIDENCE_THRESHOLD},
        ${config.SCAN_LLM_VISION_ENABLED},
        ${config.SCAN_LLM_VISION_MODEL}
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await seedSapaCorpus(tx);
  });
}

/**
 * Seed the SAPA retrieval corpus from the curated in-memory knowledge base
 * (text only — embeddings are backfilled out-of-band by the sapa:embed CLI).
 * Prod-safe and idempotent: it makes no network calls and upserts text. When an
 * entry's stripped search text changes, the stored embedding is invalidated
 * (set NULL) so the backfill re-embeds only what actually changed.
 */
export async function seedSapaCorpus(sql: Sql | TransactionSql): Promise<void> {
  for (const row of knowledgeBaseSeedRows()) {
    await sql`
      INSERT INTO sapa_corpus (
        id, page_context, question, answer, suggested_actions,
        source, url, is_safety_net, content_search
      )
      VALUES (
        ${row.id}, ${row.pageContext}, ${row.question}, ${row.answer},
        ${JSON.stringify(row.suggestedActions)}::jsonb,
        ${row.source}, ${row.url}, ${row.isSafetyNet}, ${row.contentSearch}
      )
      ON CONFLICT (id) DO UPDATE SET
        page_context = EXCLUDED.page_context,
        question = EXCLUDED.question,
        answer = EXCLUDED.answer,
        suggested_actions = EXCLUDED.suggested_actions,
        source = EXCLUDED.source,
        url = EXCLUDED.url,
        is_safety_net = EXCLUDED.is_safety_net,
        content_search = EXCLUDED.content_search,
        embedding = CASE
          WHEN sapa_corpus.content_search IS DISTINCT FROM EXCLUDED.content_search
          THEN NULL ELSE sapa_corpus.embedding END,
        embedding_model = CASE
          WHEN sapa_corpus.content_search IS DISTINCT FROM EXCLUDED.content_search
          THEN NULL ELSE sapa_corpus.embedding_model END,
        updated_at = now()
    `;
  }
}

const DEV_ADMIN_EMAIL = 'admin@sap.local';

/**
 * Development-only seed. Refuses to run against NODE_ENV=production so synthetic
 * accounts never leak into a real deployment. Seeds the reference data, then
 * provisions a dev admin account.
 *
 * The admin's credential is intentionally left unset (password_hash NULL): the
 * password-hashing scheme is owned by B-03 (auth). Once that lands, set the
 * password through the auth reset flow. Synthetic labelled reports are also
 * deferred until the app-layer H3 helper (h3-js) exists so h3_cell values are
 * real hotspot indexes rather than fabricated strings.
 */
export async function seedDevelopment(sql: Sql, nodeEnv: string | undefined): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('seedDevelopment must not run against NODE_ENV=production');
  }

  await seedReference(sql);

  await sql`
    INSERT INTO users (email_normalized, password_hash, display_name, role, email_verified_at)
    SELECT ${DEV_ADMIN_EMAIL}, NULL, 'Dev Admin', 'admin', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM users WHERE email_normalized = ${DEV_ADMIN_EMAIL} AND deleted_at IS NULL
    )
  `;
}

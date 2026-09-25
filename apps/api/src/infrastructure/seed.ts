import type { Sql } from 'postgres';

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
  });
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

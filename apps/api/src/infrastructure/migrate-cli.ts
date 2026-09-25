import { pathToFileURL } from 'node:url';
import { loadConfig } from '@sap/config';
import { createPostgresClient } from './postgres.js';
import { migrate } from './migrator.js';

/**
 * Apply pending migrations. Prefers the direct (non-pooled) connection when
 * available — pooled/PgBouncer endpoints can reject the session-level DDL and
 * advisory patterns migrations rely on. Uses a pool size of 1 so migrations run
 * on a single, ordered connection.
 */
export async function runMigrateCli(): Promise<void> {
  const config = loadConfig();
  const url = config.DATABASE_DIRECT_URL ?? config.DATABASE_URL;
  const sql = createPostgresClient(url, 1);
  try {
    const result = await migrate(sql);
    if (result.applied.length > 0) {
      console.log(`Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`);
    } else {
      console.log('No pending migrations.');
    }
    if (result.skipped.length > 0) {
      console.log(`Already applied: ${result.skipped.join(', ')}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runMigrateCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

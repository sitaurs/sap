import { pathToFileURL } from 'node:url';
import { loadConfig } from '@sap/config';
import { createPostgresClient } from './postgres.js';
import { seedDevelopment, seedReference } from './seed.js';

/**
 * Seed the database. In production only the reference data (taxonomy +
 * achievement definitions) is written. In every other environment the dev
 * fixtures (reference data + dev admin) are seeded on top.
 */
export async function runSeedCli(): Promise<void> {
  const config = loadConfig();
  const url = config.DATABASE_DIRECT_URL ?? config.DATABASE_URL;
  const nodeEnv = config.NODE_ENV;
  const sql = createPostgresClient(url, 1);
  try {
    if (nodeEnv === 'production') {
      await seedReference(sql);
      console.log('Seeded reference data (production).');
    } else {
      await seedDevelopment(sql, nodeEnv);
      console.log('Seeded reference data + development fixtures.');
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runSeedCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

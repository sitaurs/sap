import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Sql } from 'postgres';

export interface MigrationFile {
  /** Filename without the .sql suffix, e.g. "0001_extensions". */
  version: string;
  filename: string;
  sql: string;
  /** SHA-256 of the file contents, used to detect edits to applied migrations. */
  checksum: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

const SCHEMA_MIGRATIONS = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);`;

/**
 * Locate the migrations directory by climbing from this module toward the
 * package root. This resolves identically for tsx (src/), the production build
 * (dist/), and the test build (dist-test/src/), since only apps/api/migrations
 * holds the .sql files.
 */
async function resolveMigrationsDir(startUrl: string): Promise<URL> {
  let dir = new URL('./', startUrl);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = new URL('migrations/', dir);
    try {
      const entries = await readdir(candidate);
      if (entries.some((entry) => entry.endsWith('.sql'))) {
        return candidate;
      }
    } catch {
      // Directory does not exist at this level; keep climbing.
    }
    dir = new URL('../', dir);
  }
  throw new Error('Could not locate a migrations directory containing .sql files');
}

/** Read and hash every .sql migration, ordered lexicographically by filename. */
export async function loadMigrations(dir?: URL): Promise<MigrationFile[]> {
  const migrationsDir = dir ?? (await resolveMigrationsDir(import.meta.url));
  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const files: MigrationFile[] = [];
  for (const filename of filenames) {
    const sql = await readFile(new URL(filename, migrationsDir), 'utf8');
    files.push({
      version: filename.replace(/\.sql$/, ''),
      filename,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  return files;
}

/**
 * Apply every pending migration inside its own transaction and record it in the
 * schema_migrations ledger. Already-applied migrations are verified against
 * their stored checksum; a mismatch throws because migrations are immutable.
 */
export async function migrate(sql: Sql, dir?: URL): Promise<MigrateResult> {
  await sql.unsafe(SCHEMA_MIGRATIONS);

  const files = await loadMigrations(dir);
  const rows = await sql<{ version: string; checksum: string }[]>`
    SELECT version, checksum FROM schema_migrations
  `;
  const applied = new Map(rows.map((row) => [row.version, row.checksum]));

  const result: MigrateResult = { applied: [], skipped: [] };
  for (const file of files) {
    const priorChecksum = applied.get(file.version);
    if (priorChecksum !== undefined) {
      if (priorChecksum !== file.checksum) {
        throw new Error(
          `Migration ${file.filename} was modified after being applied (checksum mismatch). ` +
            'Migrations are immutable — add a new migration instead of editing this one.',
        );
      }
      result.skipped.push(file.version);
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(file.sql);
      await tx`INSERT INTO schema_migrations (version, checksum) VALUES (${file.version}, ${file.checksum})`;
    });
    result.applied.push(file.version);
  }
  return result;
}

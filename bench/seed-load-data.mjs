#!/usr/bin/env node
// R-03 load-data seeder. Inserts N synthetic reports with REAL H3 res-9 cells and
// PostGIS points scattered across a bbox — TEST_PLAN §: "buat seed nyata memakai
// library H3 dan PostGIS, bukan polygon ilustratif fixture". Use before
// load-test.mjs to populate the map/aggregation path (default 10k reports, T-22).
//
// SAFETY: writes real rows. Point it at a STAGING/benchmark database only, never
// production. Reporter is left NULL (no fake PII). Rows are tagged with a marker
// description so they can be removed afterwards.
//
// Usage:
//   DATABASE_URL=postgres://... COUNT=10000 node bench/seed-load-data.mjs
//   DATABASE_URL=postgres://... CLEANUP=1 node bench/seed-load-data.mjs   # remove seed rows
//
// Env: DATABASE_URL (required), COUNT (default 10000), BBOX (west,south,east,north),
//      BATCH (insert batch size, default 500), CLEANUP=1 to delete seeded rows.

import postgres from 'postgres';
import { latLngToCell } from 'h3-js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required (point at a staging/benchmark DB, never production).');
  process.exit(2);
}
const COUNT = Math.max(1, Number.parseInt(process.env.COUNT ?? '10000', 10));
const BATCH = Math.max(1, Number.parseInt(process.env.BATCH ?? '500', 10));
const [west, south, east, north] = (process.env.BBOX ?? '106.7,-6.3,106.9,-6.1').split(',').map(Number);
const MARKER = 'bench:load-seed'; // stable tag so seeded rows are removable
const STATUSES = ['submitted', 'verified', 'in_progress', 'resolved'];
const SEVERITIES = ['small', 'medium', 'large'];

const sql = postgres(DATABASE_URL, { max: 4 });

function randomIn(min, max) {
  return min + Math.random() * (max - min);
}

async function cleanup() {
  const deleted = await sql`DELETE FROM reports WHERE description = ${MARKER}`;
  console.error(`removed ${deleted.count} seeded report(s).`);
}

async function seed() {
  const now = Date.now();
  let inserted = 0;
  for (let start = 0; start < COUNT; start += BATCH) {
    const rows = [];
    const size = Math.min(BATCH, COUNT - start);
    for (let i = 0; i < size; i += 1) {
      const lat = randomIn(south, north);
      const lng = randomIn(west, east);
      // occurred within the last 60 days so 30/90-day windows both see data
      const occurredAt = new Date(now - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1_000);
      const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      rows.push({
        category_id: null,
        description: MARKER,
        reported_severity: SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)],
        occurred_at: occurredAt,
        lng,
        lat,
        h3_cell: latLngToCell(lat, lng, 9),
        status,
        public_summary: status === 'submitted' ? null : 'Area terpantau (data benchmark).',
        verified_at: status === 'submitted' ? null : occurredAt,
      });
    }
    await sql`
      INSERT INTO reports ${sql(
        rows.map((r) => ({
          category_id: r.category_id,
          description: r.description,
          reported_severity: r.reported_severity,
          occurred_at: r.occurred_at,
          location: sql`ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}), 4326)::geography`,
          h3_cell: r.h3_cell,
          status: r.status,
          public_summary: r.public_summary,
          verified_at: r.verified_at,
        })),
      )}`;
    inserted += size;
    if (inserted % 2_000 === 0 || inserted === COUNT) console.error(`inserted ${inserted}/${COUNT}`);
  }
  console.error(`done: ${inserted} synthetic reports (marker "${MARKER}").`);
}

try {
  if (process.env.CLEANUP === '1') await cleanup();
  else await seed();
} finally {
  await sql.end({ timeout: 5 });
}

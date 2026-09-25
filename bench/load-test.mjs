#!/usr/bin/env node
// R-03 load benchmark (zero-dep, Node >=20 global fetch).
//
// Drives concurrent virtual users against read-heavy public endpoints and,
// optionally, an authenticated mutation flow, then reports latency percentiles
// and throughput. Maps to TEST_PLAN T-22 (≥20 concurrent users / 10k reports;
// measure p95 API/map). This tool ONLY measures — seed data first with
// seed-load-data.mjs and record the environment per bench/README.md.
//
// Usage:
//   BASE_URL=https://staging.example/api/v1 VUS=20 DURATION_S=30 node bench/load-test.mjs
//   # authenticated flow (optional): pass a session cookie captured from a login
//   SESSION_COOKIE='sap_session=...' node bench/load-test.mjs
//
// Env:
//   BASE_URL      API base incl. /api/v1 (default http://localhost:3001/api/v1)
//   VUS           concurrent virtual users (default 20)
//   DURATION_S    test duration seconds (default 30)
//   BBOX          map bbox west,south,east,north (default Jakarta area)
//   SESSION_COOKIE optional Cookie header to exercise authenticated reads

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const VUS = Math.max(1, Number.parseInt(process.env.VUS ?? '20', 10));
const DURATION_MS = Math.max(1, Number.parseInt(process.env.DURATION_S ?? '30', 10)) * 1_000;
const BBOX = process.env.BBOX ?? '106.7,-6.3,106.9,-6.1';
const COOKIE = process.env.SESSION_COOKIE ?? '';

/** Scenarios are weighted GETs; the map/read path is what T-22 measures. */
const SCENARIOS = [
  { name: 'health', weight: 1, path: () => '/health', auth: false },
  { name: 'map_areas', weight: 5, path: () => `/areas?bbox=${encodeURIComponent(BBOX)}`, auth: false },
  { name: 'leaderboard', weight: 3, path: () => '/leaderboard?limit=20', auth: false },
];
if (COOKIE) SCENARIOS.push({ name: 'my_reports', weight: 2, path: () => '/reports/mine?limit=20', auth: true });

const pickScenario = (() => {
  const expanded = SCENARIOS.flatMap((s) => Array.from({ length: s.weight }, () => s));
  return () => expanded[Math.floor(Math.random() * expanded.length)];
})();

const samples = []; // { name, ms, status, ok }
let stop = false;

async function oneRequest() {
  const scenario = pickScenario();
  const headers = scenario.auth && COOKIE ? { cookie: COOKIE } : {};
  const start = performance.now();
  let status = 0;
  let ok = false;
  try {
    const res = await fetch(BASE_URL + scenario.path(), { headers });
    status = res.status;
    ok = res.ok;
    await res.arrayBuffer(); // drain body so keep-alive/timing is realistic
  } catch {
    status = 0;
    ok = false;
  }
  samples.push({ name: scenario.name, ms: performance.now() - start, status, ok });
}

async function virtualUser() {
  while (!stop) await oneRequest();
}

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[idx];
}

function report() {
  const durationS = DURATION_MS / 1_000;
  const byName = new Map();
  for (const s of samples) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const okCount = samples.filter((s) => s.ok).length;
  console.log('\n=== R-03 load benchmark ===');
  console.log(JSON.stringify({
    baseUrl: BASE_URL, vus: VUS, durationS, bbox: BBOX, authenticated: Boolean(COOKIE),
    totalRequests: samples.length, ok: okCount, errors: samples.length - okCount,
    throughputRps: Number((samples.length / durationS).toFixed(1)),
  }, null, 1));
  console.log('\nper-scenario latency (ms):');
  for (const [name, list] of byName) {
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => !s.ok).length;
    console.log(JSON.stringify({
      scenario: name, count: list.length, errors,
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      p99: Math.round(percentile(sorted, 99)),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
    }));
  }
  console.log('\nRecord these numbers with commit + environment in bench/README.md.');
}

async function main() {
  console.error(`load-test: ${VUS} VUs for ${DURATION_MS / 1_000}s against ${BASE_URL}`);
  const timer = setTimeout(() => { stop = true; }, DURATION_MS);
  await Promise.all(Array.from({ length: VUS }, () => virtualUser()));
  clearTimeout(timer);
  report();
  const errorRate = samples.length ? (samples.length - samples.filter((s) => s.ok).length) / samples.length : 1;
  process.exit(errorRate > 0.01 ? 1 : 0); // non-zero if >1% errors, for CI gating
}

main();

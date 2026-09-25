# Benchmark & Restore Tooling (R-03)

Operational tooling for load benchmarking (`docs/TEST_PLAN.md` T-22) and
backup/restore rehearsal (T-21). These are **operator scripts**, not part of the
app build or `npm run check` — they live outside the workspace tsconfigs and are
run manually against a **staging / benchmark environment only, never production**.

## Contents

| File | Purpose | Maps to |
| --- | --- | --- |
| `seed-load-data.mjs` | Insert N synthetic reports with real H3 res-9 cells + PostGIS points (reporter NULL, marker-tagged, reversible). | T-22 setup |
| `load-test.mjs` | Zero-dep concurrent load harness; reports p50/p95/p99/max + throughput per scenario. | T-22 |
| `verify-restore.mjs` | Assert deleted data did not reappear after a restore + tombstone replay. | T-21 |
| `restore-drill.md` | Backup/restore runbook (DEPLOYMENT.md §6 order, RPO 24h / RTO 8h). | T-21 |

## Prerequisites

- Node ≥ 20 (global `fetch`, `performance`).
- `postgres` and `h3-js` resolve from the repo root `node_modules` (already
  hoisted) — run these scripts from `platform/` so bare imports resolve.
- `DATABASE_URL` pointing at a **staging/benchmark** DB for seed + verify.

## Running a benchmark (T-22)

1. Seed ~10k reports (safe, reversible):
   ```bash
   DATABASE_URL="postgres://…staging…" COUNT=10000 node bench/seed-load-data.mjs
   ```
2. Run the load test (≥20 VUs against the running API):
   ```bash
   BASE_URL="https://staging.example/api/v1" VUS=20 DURATION_S=60 node bench/load-test.mjs
   ```
   Optional authenticated reads: capture a session cookie from a login and pass
   `SESSION_COOKIE='sap_session=…'`.
3. Clean up seeded rows afterward:
   ```bash
   DATABASE_URL="postgres://…staging…" CLEANUP=1 node bench/seed-load-data.mjs
   ```

Exit code is non-zero if the error rate exceeds 1%, so it can gate CI on a
staging job.

## Running a restore drill (T-21)

Follow `restore-drill.md` step by step. The key gate is:
```bash
DATABASE_URL="postgres://…restored…" node bench/verify-restore.mjs
```
`"verdict": "CLEAN"` (exit 0) means no deleted user/report/media reappeared and
no tombstone replay is pending.

## Results-recording template

Copy this block per run and fill it in. **Do not paste secrets, connection
strings, cookies, or any PII** — record only the redacted shape.

```
### Benchmark run
- Date (Asia/Jakarta): YYYY-MM-DD
- Commit: <git sha>
- Environment: <staging tier, DB size, region — no hostnames/creds>
- Seeded reports: <count>
- Config: VUS=<n>, DURATION_S=<n>, BBOX=<…>, authenticated=<yes/no>
- Results:
    health      p50/p95/p99/max = …
    map_areas   p50/p95/p99/max = …
    leaderboard p50/p95/p99/max = …
    my_reports  p50/p95/p99/max = …   (if authenticated)
  throughput = … rps, errors = … %
- Verdict vs targets: p95 API/map <target?> — pass/fail

### Restore drill
- Date (Asia/Jakarta): YYYY-MM-DD
- Commit / backup timestamp: <sha> / <iso>
- verify-restore.mjs verdict: CLEAN / VIOLATIONS
- Measured RTO (start→smoke passed): <hh:mm> vs target 8h
- Measured RPO (backup→incident): <hh:mm> vs target 24h
- Notes: <deviations, manual steps, follow-ups>
```

## Remaining risks

- **Actual p95 / throughput are unmeasured here.** The harness is validated, but
  real numbers require a timed run on live-sized staging data with the DB, Redis,
  and R2 all engaged. Offline CI cannot produce representative latencies.
- **RTO/RPO are targets, not verified figures** until a timed staging restore is
  executed and its wall-clock recorded above.
- **Seed data is synthetic** (reporter NULL, uniform random distribution); real
  traffic clusters geographically, so hotspot/aggregation cost may differ.
- The load harness exercises read/map paths; write-path limits (rate limits,
  ingestion, ML adapter) need a separate authenticated scenario before launch.

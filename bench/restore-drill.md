# Restore Drill Runbook (R-03 / T-21)

Backup-and-restore rehearsal for the SAP platform. Follows the restore order in
`docs/DEPLOYMENT.md §6` and proves that **data marked for deletion never comes
back** (`docs/TEST_PLAN.md` T-21, `docs/DATABASE.md §7`).

**Targets:** RPO 24h, RTO 8h. Backups expire after 30 days. Run against a
**staging / dedicated drill environment only** — never production.

## Preconditions

- A recent logical backup of PostgreSQL (`pg_dump`/managed snapshot) no older
  than the RPO window (24h).
- The R2 (object store) bucket, or a snapshot of it, reachable with drill
  credentials.
- The most recent `area_snapshots` export, if kept out-of-band.
- Worker image/tag matching the backup's schema migration version.
- `DATABASE_URL` for the restored DB exported in the shell (drill DB, not prod).

## Restore order (DEPLOYMENT.md §6)

Execute strictly in this order; do not open traffic until the last step.

1. **Database.** Restore the DB snapshot. Confirm the schema migration version
   matches the app build you will run.
2. **Deletion tombstones replay.** Before anything reads the restored data,
   replay outstanding erasure. The worker does this automatically once started
   (it polls `account.deletion.requested` outbox events and processes
   `deletion_requests`), OR trigger a one-shot drain. Every subject present in
   `deletion_tombstones` must end pseudonymised. Verify with:
   ```bash
   DATABASE_URL="$DATABASE_URL" node bench/verify-restore.mjs
   ```
   Expect `"verdict": "CLEAN"` and exit code 0. A non-zero exit means deleted
   data was revived by the restore — STOP and re-run the deletion worker until
   clean.
3. **Reconcile outbox / queue / ledger.** Start the worker so pending outbox
   events relay and the BullMQ queue drains. Confirm no rows are stuck in
   `processing` with stale `next_attempt_at`.
4. **R2 objects.** Restore/verify object-store contents. Any media the deletion
   replay marked `state='deleted'` must NOT have live bytes — the deletion
   processor deletes R2 objects before pseudonymising, so re-run the sweep
   (`runSweep`) to clear orphans introduced by the restore.
5. **Area snapshot.** Rebuild or restore the public area aggregation snapshot so
   the map serves without exposing per-report PII.
6. **Smoke test.** `GET /health` returns 200 `{status:'ok'}`; a public map query
   (`/areas?bbox=…`) and `/leaderboard` respond; one authenticated read works.
7. **Open traffic.** Only after steps 1–6 pass.

## Verification checklist (T-21)

- [ ] `verify-restore.mjs` verdict `CLEAN` (no revived users/reports/media, no
      pending tombstone replay).
- [ ] `/health` → 200 `{status:'ok', contractVersion:'1.0.0'}`.
- [ ] Public map + leaderboard reads succeed and expose no reporter identity,
      address, exact coordinates, or private photos.
- [ ] Wall-clock from "start restore" to "smoke passed" recorded and compared to
      RTO 8h.
- [ ] Data-loss window (backup timestamp → incident) recorded and compared to
      RPO 24h.

## What this drill can and cannot prove

- **Proves:** the restore order is executable, tombstone replay is idempotent and
  re-erases deleted subjects, and no deleted PII reappears.
- **Cannot prove offline:** actual RTO/RPO numbers. Those require a real timed
  run on live-sized staging data. Record the measured wall-clock and data-loss
  window in `bench/README.md`; until a timed staging run exists, RTO/RPO remain
  **unproven targets**, not verified figures.

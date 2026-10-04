# Production backend verification report

**Date:** 4 October 2026 (Asia/Jakarta)\
**Environment:** SAP production API VPS and production database, as explicitly requested\
**Purpose:** Verify backend work for the documented baseline, SAPA/account features, Community/Activities/Volunteers, Hermes, and Instagram.\
**Result:** Several runtime checks pass, but production acceptance is **not complete**. This report does not claim 100% or end-to-end completion where the evidence is missing.

## Executive result

| Area | Result | Evidence |
| --- | --- | --- |
| Local code gate | **PASS** | `npm run check` exit 0 after the current local fixes: contract lint, 259 Node tests (190 API + 61 worker + 8 config), 5 Hermes Python tests, typechecks, API/worker builds, and 127 route-to-draft-operation matches. |
| Dependency security | **PASS** | `npm audit` exit 0, 0 vulnerabilities. Updated API/worker `sharp` from 0.34.5 to 0.35.5. |
| Production deployment | **PASS** | Rebuilt/recreated API and worker only. Runtime `sharp` is 0.35.5; synthetic 16×16 PNG decoded correctly in the API container. API health is HTTP 200. PostgreSQL/Redis healthy; web running. |
| Hermes private provider service | **PASS for service smoke; NOT E2E** | Production worker `/health` returned 200 and the configured model version. One generated image went through the deployed service to 9Router and returned schema-valid JSON. Tools are empty and automatic decisions are disabled. No SAP review run was persisted through the worker lifecycle. |
| Community/Activities/Volunteers | **PARTIAL** | Public activities and impact summary returned 200; unauthenticated admin routes returned 401. No authenticated create/join/result/review lifecycle was executed. |
| Instagram | **BLOCKED for E2E** | Account connection/scopes and feature flags were observed configured. Production has no consented item with an approved rendition and publication approval, so no draft or real post/retraction test could be performed safely. |
| Scan / ML | **PARTIAL** | The earlier API-container probe timed out. After the worker was attached to the private `sap-ml-private` network and configured for internal alias `ml-inference`, Gradio info returned HTTP 200 and one synthetic image inference returned `paper` with three confidence entries. Full model-aware readiness and API-to-scan-to-database E2E remain unverified. |
| Email / R2 / operations | **UNVERIFIED** | Resend credentials are configured but no email was sent. Full R2 upload/read/delete and restore drill, load/security acceptance, and account lifecycle E2E were not run. |

## Exact checks and outcomes

### Local repository

Command: `npm run check`

- Exit code: `0`.
- Contract checks passed.
- Current local Node test totals after the fixes in this workspace: **190 API + 61 worker + 8 config = 259 passed**.
- Hermes service tests: **5 passed**; Node and Python failed/skipped/todo counts were zero.
- Hermes service tests: **5 passed**.
- Config/API/worker/web typechecks passed.
- API/worker build passed.
- Route matcher reported **127 API routes matching 127 R1 draft operations**; published contract remains `1.1.0` with 48 operations.
- `git diff --check` passed.
- `npm audit --json`: **0 vulnerabilities** after the `sharp` update.

The `sharp` update was built and deployed after the local checks passed. Relevant upstream references: [sharp advisory GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) and [sharp v0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5).

### Production health and route guards

After deployment, production probes returned:

| Probe | Result |
| --- | --- |
| `GET /api/v1/health` | HTTP 200 |
| `GET /api/v1/activities` | HTTP 200 |
| `GET /api/v1/impact/summary` with RFC3339 `from`/`to` | HTTP 200 |
| Unauthenticated `GET /api/v1/admin/activities` | HTTP 401 |
| Unauthenticated `GET /api/v1/admin/review-queue` | HTTP 401 |
| Unauthenticated `GET /api/v1/admin/instagram` | HTTP 401 |
| API and worker containers | Running after recreation |
| Worker → Gradio private route | PASS: Gradio info endpoint returned HTTP 200 after worker recreation |
| PostgreSQL and Redis | Healthy; not restarted |
| Web container | Running; not restarted |
| API and worker `sharp` runtime | `0.35.5` |
| Synthetic PNG decode in deployed API container | PASS: PNG 16×16 decoded |

Extension, community, activities, Instagram, rendering, publishing, delete, and Hermes production feature flags were checked as booleans and were all `true`. This confirms configuration only; it does not prove their complete workflows.

### Hermes

- The private service is enabled under an unprivileged service account and is reachable from the worker network.
- The worker's `/health` request returned HTTP 200; model version matched `combo-hermes`; `tools=[]`; `canAutomate=false`.
- A generated, non-user image passed through the deployed Hermes HTTP service and real 9Router provider. The returned recommendation parsed and passed strict schema validation. Provider-token use was nonzero; cost was about USD 0.10 at the configured token rates (an estimate, not a billing statement).
- No report, resident photo, social account, or Instagram endpoint was used by this smoke.
- The synthetic intent row was deleted and the absence of that test ID was verified.
- **Not tested:** API enqueue → worker claim → production Postgres review-run persistence → moderator decision and human fallback. Do not mark that feature E2E-passed.

### Scan / ML

- Earlier request to the configured Gradio info endpoint from the API container timed out; no scan E2E had passed at that point.
- Repair: worker and EcoLens were attached to the private Docker network `sap-ml-private`, with the provider available at internal alias `ml-inference`. Only the worker was recreated for this route repair; API, PostgreSQL, Redis, and web were not restarted.
- From the production worker, Gradio info returned HTTP 200. One synthetic static image sent through `@gradio/client` returned the label `paper` and three confidence entries; the temporary image was removed after the smoke.
- **Not tested:** both-checkpoint/model-hash readiness, known-positive and known-negative fixtures, the full category set, malformed/error/timeout/late-result cases, performance, or API enqueue → worker → scan database completion and points. This does not certify model accuracy or scan release readiness.

### Instagram, Community, and Volunteers

- Meta account connection and required permission names had been verified earlier in this task; all current feature flags were rechecked after deployment.
- The observed production snapshot contained no consented Instagram media, ready rendition, or publication approval. No draft, post, retract, or delete was created. We did not reuse a resident's photo, fabricate an incident, or bypass consent/approval checks.
- Public Community/Activities reads and admin authorization rejection were checked. No test community update, volunteer activity, enrollment, attendance, activity result, or review was written to the production database.
- These items require role-authenticated lifecycle tests; route availability and unit tests are not substitutes.

## Production changes made

1. Installed the pinned Hermes review service, private transport configuration, worker-only network binding, unprivileged service account, cost limits, and API/worker configuration. Kept the Hermes agent/provider credentials server-side.
2. Updated API and worker image processing dependency `sharp` to 0.35.5, updated the TypeScript type imports, rebuilt images, and recreated only `api` and `worker`.
3. Repaired worker-to-Gradio connectivity using a private Docker network and internal alias; recreated only the worker for this change.
4. Updated repository status/readiness documentation to match the observed production state and explicit remaining gates.

The production database was not migrated, seeded, or edited for these checks. One synthetic row in the Hermes service's private SQLite intent store was created for the smoke test and then removed. No email was sent. No social post was made. Existing PostgreSQL, Redis, and web services were not restarted.

After the production probes above, additional local-only changes added migration `0017_activity_public_cancel_reason.sql`, corrected the public cancellation-reason projection, fixed the fifth-attempt MFA boundary, guarded Instagram retract state, tightened scan idempotency/quota handling, and hardened ML response timeouts/validation. The full local check passed on this workspace revision. **Those newer changes and migration 0017 have not been deployed or applied to production.** The live health/deployment observations above refer to the earlier deployed revision; they are not proof of these local fixes.

## Remaining blockers and exact next action

1. **ML / scan:** complete model-aware readiness for both checkpoints, known-positive/negative cases, hashes/revision, failures and performance; then run the authenticated scan lifecycle through API, queue, worker, database and points. The private route and one-inference smoke pass, but scan-dependent release acceptance remains unverified.
2. **Instagram has no eligible authorized test media:** submit a test image through the app with Instagram consent and obtain the required reviewer approval. Then run draft → temporary clearly labeled test post → delete and verify the result. Until there is an eligible item, production publish E2E cannot be honestly reported.
3. **Community/volunteer:** run authenticated member/coordinator/admin create, join, result, review, public projection and cleanup flows using designated test identities.
4. **External services:** verify an actual OTP email, R2 upload/signed-read/delete, backup restore, and the documented load/security gates.
5. **Handoff/acceptance:** keep extension contract `1.2.0` in draft until generated client, frontend adapter, release-owner acceptance, and lifecycle evidence are ready.

## Final acceptance statement

The currently running production backend has the Hermes service installed, working API/worker containers, public API health, and enabled feature configuration. Local tests pass, and one worker-to-Gradio inference smoke passed after repairing the private route. However, model-aware ML/scan acceptance, Instagram's eligible consented publication item, authenticated Community/Volunteer flows, full Hermes/Postgres lifecycle E2E, and operational gates are still missing. **The requested backend set is therefore not yet “100% production-ready.”** The evidence supports only the partial states recorded above.

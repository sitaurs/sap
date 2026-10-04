# Backend implementation and release status

Checked 4 October 2026. This report covers the baseline backend, the documented SAPA/account releases, and the Community, Activities, Volunteers, Hermes, and Instagram extension. It distinguishes code/configuration from verified end-to-end behavior. **The backend is not yet production-certified.**

## Current status by release area

| Area | What is implemented and observed | What is still needed for production acceptance |
| --- | --- | --- |
| Baseline SAP: auth, scan, reports, moderation, map, media, gamification, operations | Code and automated tests are present. Current production API, web, worker, PostgreSQL, and Redis are running. | The configured Gradio host is unreachable, so live scan/classification cannot pass. Resend delivery, full R2 upload/delete/restore, account lifecycle, load/security and restore-drill gates remain unverified. |
| SAPA assistant (R1/R2/R3/R5/RAG) | Bounded, read-only LangGraph assistant and retrieval code/tests exist; prior provider and embedding smoke checks returned valid responses. | No scored Indonesian evaluation set for retrieval/grounding/abstention and no authenticated browser-to-API conversation E2E. Assistant remains read-only as required. |
| Account (ACCOUNT-R1–R4) | Minimization, password change, TOTP MFA/recovery, avatar and related tests exist; production MFA was previously observed configured. | No live authenticated account lifecycle test in this verification. |
| Community, volunteers, Activities | Migrations 0011–0016 are applied with matching checksums. Extension, community and activity flags are true. Public activities and impact-summary routes return 200; admin routes reject unauthenticated requests with 401. | No authenticated create/join/participant/result/review lifecycle was exercised on production. Tables had no workflow data in the last observed production snapshot. Frontend handoff and role-specific E2E evidence are still needed. |
| Hermes assisted review | Private, unprivileged service is installed and enabled. Production worker reaches `/health` with HTTP 200 and the configured `combo-hermes` model; no tools or automated decisions are enabled. A synthetic image completed a real provider call and passed the strict result schema. The synthetic intent row was removed. | The full SAP worker → PostgreSQL review run → human moderation lifecycle was not run. Provider smoke is not evidence that a report review was persisted correctly. |
| Instagram publishing/retraction | Facebook Login for Business account connection and required publishing scopes were previously verified. Instagram/render/publish/delete feature flags are true. Consent, rendition, approval, retry and durable publish code is present. | There is no production media item with recorded Instagram consent, ready approved rendition and publication approval. Therefore no draft, publish, retract or delete was run; those controls were not bypassed. |
| API contract and frontend handoff | Published contract is `1.1.0`; extension/R1 draft is `1.2.0`. Route check finds 127 API routes matching 127 draft operations. | Keep `1.2.0` a draft until client adapters, authenticated lifecycle tests and release acceptance are complete. |

## Verification completed on 4 October 2026

- Local `npm run check` passed: contract lint, 225 Node tests, 5 Hermes Python tests, typechecks, API/worker builds and contract route matching.
- `npm audit` reports 0 vulnerabilities after updating direct API/worker `sharp` from `0.34.5` to `0.35.5`. The updated package was built and deployed to API and worker; both report runtime `sharp` `0.35.5`. A synthetic PNG decode succeeded in local tests. This update addresses upstream `libvips` advisories: [GitHub advisory GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [sharp v0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5).
- Production containers after deploy: API and worker running; PostgreSQL and Redis healthy; web running. Only API and worker were recreated. No migration or restart of the database, Redis, or web service occurred.
- Public API probes: `/api/v1/health`, `/api/v1/activities`, and impact summary with RFC3339 date filters returned 200. Unauthenticated admin Activities, review queue, and Instagram routes returned 401.
- Hermes: synthetic provider request through the deployed private service returned a valid bounded result; worker-to-service health returned 200, matched configured model, and confirmed `tools=[]` and `canAutomate=false`. No real report was submitted to Hermes.
- ML/Gradio: API-container request to the configured Gradio info endpoint timed out after 10 seconds. The separate model server's SSH connection also timed out; its expected ports were closed or filtered from the API VPS. Scan release tests are blocked by that host being unreachable.
- Production database and user data were not seeded or edited for tests. The sole synthetic Hermes intent was removed. No email was sent and no Instagram post was created or deleted.

## Remaining release blockers

1. **ML service host:** restore access to the configured Gradio machine, then pass model-aware readiness (both checkpoints, valid class outputs, hashes/revision, timeout and degraded-model tests). HTTP reachability alone is insufficient.
2. **Instagram test asset and lifecycle:** provide an explicitly consented test image or record consent for a synthetic, non-personal test image through the application. Then exercise rendition, human approval, draft, a clearly labeled temporary post, and deletion. Do not fabricate or publish a real-world incident, and do not bypass consent/approval gates.
3. **Community/volunteer authenticated flows:** run the member/coordinator/admin lifecycle using authorized production test identities and clean up the test records. Public GETs and unit tests do not prove these flows.
4. **External-service acceptance:** verify transactional email delivery and the complete R2 upload/signed-read/delete lifecycle.
5. **Operational release gates:** complete restore drill, security and load tests, Indonesian assistant evaluation, and frontend/contract acceptance. Production was used because the owner requested it; no separate staging environment was created.

No percentage or “100% ready” claim is made: the items above have no passing evidence yet. See [environment readiness](ENVIRONMENT_READINESS.md), [test plan](TEST_PLAN.md), and the [backend execution plan](BACKEND_EXECUTION_PLAN.md) for details.

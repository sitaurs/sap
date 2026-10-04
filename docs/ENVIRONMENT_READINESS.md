# Environment readiness

Checked 4 October 2026. This records observed configuration and probe results, not a production certification. Secret values, access tokens, and private provider URLs are intentionally omitted.

## Current observations

| Service or capability | Observed state | Evidence and limit |
| --- | --- | --- |
| API, web, PostgreSQL, Redis, worker | Running | Production containers were checked after the Hermes API/worker restart. PostgreSQL and Redis report healthy; API, web, and worker are running. |
| Database migrations | 0011–0016 applied | Recorded checksums match the repository migrations. This does not prove every feature workflow or restore procedure. |
| Public API | Responding | `/api/v1/health`, `/api/v1/activities`, the public incident and timeline routes, and impact summary with RFC3339 dates returned expected HTTP success. Admin activity/review/Instagram routes returned 401 without credentials. |
| Transactional email | Resend configured | API key and sender configuration exist on the server. No real email or OTP was sent in this verification; deliverability is unverified. |
| ML / Gradio | Reachable; one inference smoke passed | After the latest check, the worker reached Gradio through the private Docker network and `@gradio/client` returned one result (`paper`) with three confidence entries for a synthetic image. This proves basic worker-to-provider connectivity and adapter execution only. Model hashes/revision, both checkpoints, known-positive/negative cases, error paths, and API-to-scan-to-database E2E remain unverified. |
| Hermes assisted review | Private service healthy; provider smoke passed | Dedicated unprivileged systemd service is enabled and reachable only from the worker network. Worker `/health` returned HTTP 200 with `combo-hermes` and the pinned commit. A separate synthetic-image request to the pinned 9Router model passed strict JSON/schema validation. Tools and automated decisions are disabled; output remains a recommendation for a human. This did not execute the SAP worker-to-Postgres review lifecycle. |
| Hermes cost controls | Configured | A per-run and daily ceiling are configured in the API/provider environment. The smoke request cost about USD 0.10 by configured token rates; this is an estimate, not provider billing evidence. |
| Meta / Instagram | Account connected; feature flags on | Facebook Login for Business and the professional Instagram account are configured with the required publishing/scopes observed. OAuth connectivity does not prove draft, publish, retract, or deletion flows work end to end. |
| Instagram consent and publishing | No eligible media | Production has no consented Instagram media, approved renditions, or publication approval. No draft or post was created. A safe test requires an explicitly consented image and approval; existing residents' images must not be repurposed. |
| Community and Activities | Runtime enabled | Extension, community, and activities flags are true; migrations exist; read-only public route probes passed. Production has no activity/community workflow data to verify; authenticated create/review/participant E2E was not run. |
| Object storage (R2) | Partially verified | Configuration/code paths exist, but this check did not execute the complete upload, signed-read, rendition, delete, and restore lifecycle against R2. |
| API contract | 1.1.0 published; 1.2.0 draft | Local route matching checks the R1 extension draft. Do not label the draft promoted or accepted until client handoff and lifecycle gates pass. |

## Production safety during this check

- The user explicitly chose the production database for this competition environment. No database seed, fake report, fake activity, or user media was inserted or edited.
- Only API and worker containers were recreated to load the configured Hermes integration. PostgreSQL, Redis, and web were not restarted.
- A later ML networking repair used the private Docker network `sap-ml-private`, attached the worker and EcoLens containers, and set the worker's Gradio base URL to the internal `ml-inference` alias. The worker was recreated; API, PostgreSQL, Redis, and web were not restarted for this repair. This is a connectivity repair, not ML release acceptance.
- The Hermes provider smoke used a generated synthetic image. Its one synthetic id was removed from the private Hermes intent store after verification.
- No email, Instagram post, retract, deletion, or real-user review was performed.

## Not yet proven

Production readiness is not certified. Remaining evidence includes model-aware ML health and complete scan E2E, authenticated feature lifecycle E2E for community and activities, Hermes worker-to-database review flow and human fallback, Instagram consent-to-draft-to-approved-publish/retract flow using an authorized test asset, full R2 lifecycle, email delivery, load/security checks, and a restore drill. The configured production dependencies and healthy containers are necessary but not sufficient for these gates.

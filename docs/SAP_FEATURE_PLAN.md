# SAP Feature Plan — SAPA, Account Settings, Malang Map Data, Loading UX

**Status:** Planning baseline; not an implementation specification approved for release.
**Prepared:** 29 September 2026
**Scope:** Product requirements, design direction, architecture, API/database/contract impact, data sourcing, sequencing, and acceptance gates for four requested improvements.
**Implementation rule:** This document is the working source for future implementation planning. Before coding each feature, reconcile this plan with current source, OpenAPI, fixtures, migrations, and product decisions; update this document and contracts first when decisions change. OpenAPI remains authoritative for API shapes.

## 1. Executive summary

1. **SAPA:** Current implementation is a single-call, read-only FAQ assistant; it has no agent tool registry or execution loop. Start with deterministic grounding/fallback improvements, then consider a small bounded read-only tool runtime in the existing NestJS service. Do not add LangChain for the first tool pilot unless a prototype demonstrates a concrete benefit.
2. **Account settings:** Improve profile/security controls with an authenticated password-change flow, optional MFA with secure recovery, and a carefully isolated avatar upload lifecycle. Do not collect date of birth without a documented product/legal need.
3. **Malang map:** Correct the map’s initial location to Malang, but do not manufacture reports to fill it. Obtain genuine, permissioned incident records with usable coordinates, dates, evidence, and provenance; moderate them through the normal workflow. Until then show an honest “Belum ada data” state.
4. **Loading UX:** Keep explicit form pending states, improve the login-to-dashboard transition and dashboard bootstrap feedback, and use route-level loading UI only where it covers actual navigation waits. Respect reduced motion and accessibility.

No feature may bypass SAP's existing session, CSRF, authorization, privacy, moderation, idempotency, or contract conventions.

## 2. Product and technical baseline

### 2.1 Product constraints

- SAP supports waste scans, geolocated pile-up reports, moderated area summaries, user activity, and an optional SAPA assistant.
- Public map areas are descriptive summaries of verified canonical incidents; they do not forecast future conditions. No report means **no data**, not a clean area.
- Submitted reports are private. Exact incident coordinates, reporter identity, original media, and internal moderation notes are not public.
- Only genuine, traceable, permissioned evidence may be presented as real incidents. Synthetic fixtures remain clearly labeled test/demo data and must never appear as real production reports.
- There is no assumed government partnership or automatic field response. Do not claim a report was handled by an agency without evidence and authorization.

### 2.2 Relevant current architecture

- Monorepo with NestJS API, Next.js App Router frontend, BullMQ worker, PostgreSQL/PostGIS, Redis, S3-compatible object storage, OpenAPI contract and fixtures.
- API uses cookie sessions and CSRF/Origin checks; authorization and ownership belong on the server.
- OpenAPI is the source of truth for endpoint/payload/status changes; fixtures and generated web types must remain synchronized.
- SAPA currently uses an OpenAI-compatible adapter, backend-owned prompt/FAQ, and temporary Redis conversation history. It is not currently an agent framework integration.
- Existing auth supports email verification and email-OTP password recovery. Login is password-only; recovery OTP is not MFA. Profile currently supports display name and email projection, with no avatar, birth date, in-session password change, or MFA lifecycle.
- Existing map aggregation accepts a viewport and shows H3 cells computed from eligible reports. Current map and report-location fallback coordinates are around Bandar Lampung, not Malang.
- Login submit already has a pending button label and dashboard bootstrap already has a branded full-screen waiting state; the goal is to improve and make behavior coherent, not to assume loading is wholly absent.

## 3. Shared implementation principles

1. **Verify before changing:** inspect current branch/worktree, implementation, tests, and runtime-dependent assumptions for each feature. Preserve unrelated work and do not overwrite existing uncommitted files.
2. **Contract-first:** for API-visible changes, update OpenAPI, fixtures, generated types/client and contract checks in one coordinated change before frontend/backend implementation.
3. **Privacy by design:** minimize collected and model-visible data. Keep secrets, raw media, precise location and private identity out of logs and public projections.
4. **Server is authoritative:** the browser/model cannot supply identity, role, ownership, moderation state, H3 cell, or authorization decisions.
5. **Accessible states:** design loading, error, empty, disabled, success, and recovery states; keyboard access, screen-reader status, focus, responsive layout, and reduced motion are part of acceptance.
6. **No fabricated environmental facts:** no generated report coordinates, event dates, photos, severity, verification/resolution, provenance, or agency action.
7. **Safe rollout:** migrations are additive where possible; features have server-side kill switches/rollback strategy where applicable; verify in staging before production.

---

# Part A — SAPA assistant

## 4. Current behavior and verified gaps

Current request flow: authenticated `POST /assistant/chat` → controller/service checks feature flag, user preference, message/page context, rate limit, conversation ownership → FAQ retrieval → OpenAI-compatible provider → validated response → Redis conversation storage. Conversation keys are user-scoped, have a 30-minute TTL, and retain at most 12 messages. The existing chat contract is already present in OpenAPI; older statements in `SAPA_ASSISTANT.md` that routes are absent/proposals need reconciliation when implementation work begins.

Verified planning concerns:

- SAPA is a single-call FAQ assistant today: no tool registry or tool loop exists.
- Active prompt language permits some general-knowledge answers, while documentation says answer only from supplied context. Decide and enforce one grounding policy.
- Provider failure/invalid output currently yields `503`; a declared fallback constant is not used in the service path. Decide whether deterministic FAQ fallback is required and test it.
- User text and rendered FAQ context are sent together in a user-role message in the current provider path. Preserve the untrusted-data boundary and test prompt-injection behavior before changing prompt composition.
- Existing Redis rate limit increments and expiry handling should be reviewed for atomicity before introducing retries or multiple model/tool iterations. Duplicate/concurrent turns can also incur provider cost or race transcript updates.
- No streaming/progress/approval protocol exists in the current UI/API. Do not imply these capabilities without contract and UI work.

## 5. Requirements

### SAPA-R1 — Product scope

- The assistant may explain SAP features, provide account-owned status/summary information, and navigate to a closed set of internal destinations.
- Default capability is read-only. The assistant must not create/edit/delete reports, scans, account data, or settings; moderate reports; award points; read admin data; or expose private media/precise location.
- It must clearly state when it lacks information; it must not invent counts, classification outputs, policy, or environmental facts.
- Existing feature flag, user preference, authenticated session, rate limit, conversation ownership, and bounded temporary history remain enforced.

### SAPA-R2 — Grounding and fallback

- Backend determines eligible FAQ context and validates final output and navigation targets.
- Prompt injection in user input, FAQ content, or tool results must not elevate instructions or permissions.
- Define deterministic behavior for provider timeout, unavailable provider, malformed JSON, invalid targets, insufficient FAQ grounding, and exhausted tool budget. Preferred baseline: answer from an exact/relevant approved FAQ where possible; otherwise short fallback to Help; distinguish this from transport errors only if the contract/UI supports it.
- Never return raw upstream provider errors or credentials.

### SAPA-R3 — Read-only tools, only after a tool pilot is approved

Potential bounded tools:

- `get_my_stats`: minimal aggregate statistics for the authenticated user.
- `list_my_report_statuses`: only minimal status/date/category fields for reports owned by the caller; exclude description, exact location, media, reporter details, internal notes.
- `get_public_area_summary`: validated public aggregate, bounded date range and viewport/cell; exclude exact coordinates, identities, signed media URLs, and unbounded result sets.

Eligibility and policy:

- Tools are registered in trusted server code/configuration with version, strict argument schema, data classification, allowed roles/scopes, per-tool rate/timeout/result limits, and risk/policy mode.
- A trusted server-created caller context is passed separately from model arguments. Identity and role come only from the authenticated SAP session.
- Validate tool name and arguments again on the server. The model may not supply user IDs, SQL, arbitrary URLs, service names, role, credentials, routes, or authorization context.
- Each handler calls existing domain services and enforces ownership/role on every call. Return a purpose-built, redacted, size-bounded projection.
- Do not register generic DB, repository, HTTP, shell, admin, or mutation tools.
- Review apparent read paths for side effects before exposing them. For example, do not expose achievement retrieval if it currently reconciles/unlocks/revokes records.
- Bound total model calls, tool calls, wall-clock time, tool-specific timeout, input/output tokens, and serialized result sizes. On exhaustion stop safely and return fallback.

### SAPA-R4 — Actions and approval

- First release remains read-only. Prefer a closed navigation suggestion or opening a user-reviewed form over an assistant write.
- A conversational “yes” is not authorization for a mutation.
- Any future write proposal requires a separate design and contract: display exact action/fields, authenticated explicit confirmation request, CSRF, proposal bound to caller/action/expiry/one-time nonce or idempotency, server-side domain revalidation, audit, cancel/expiry behavior, and recovery UX.
- Admin moderation and security/account mutations are explicitly out of scope for assistant actions.

### SAPA-R5 — Reliability and operations

- Preserve user-scoped Redis conversation ownership, TTL, and bounded history unless a new retention decision is approved.
- Decide atomic rate limit increment/expiry and concurrent-turn semantics; prevent accidental duplicate provider spend on retries where feasible.
- Logs may include request/correlation ID, tool name/version, allow/deny result, duration, provider status category, and bounded usage metadata; never raw prompt, full response, private tool result, photo bytes, auth headers, or secrets.
- Keep provider-specific request/response formats inside adapters. A provider-neutral internal shape may include text, normalized tool requests, finish reason, and optional usage; do not leak provider-native tool payloads through the public API.
- LangChain is not required for the initial small tool pilot. Reconsider only after a prototype demonstrates value for materially more complex orchestration, and document dependency/operational cost and compatibility with the configured gateway. If HITL interrupts are ever adopted, persistent checkpoint and resume semantics must be deliberately designed; the current ephemeral Redis chat history is not automatically a compatible checkpoint system.

## 6. SAPA design and implementation sequence

1. **SAPA-0 — reconcile contract/docs and behavior:** verify active prompt/provider/service; align docs with actual routes and policy; choose grounding/fallback semantics; add tests for known FAQ, unknown, off-topic, malformed output, provider failure, invalid actions, and injection.
2. **SAPA-1 — technical spike:** prototype one read-only tool through an internal normalized provider interface; test configured gateway tool-call compatibility, latency, costs, timeout, serialization, error handling and log redaction. No production tool enabled during spike.
3. **SAPA-2 — bounded runtime:** implement registry, schema validation, policy authorization, ownership-scoped handlers, redaction, budgets, safe loop termination, and tests. Begin with one low-risk tool; enable through a server-side feature flag/canary.
4. **SAPA-3 — expand only on evidence:** add additional tools only when users cannot complete an important task using FAQ/navigation and the tool has a reviewed data contract and owner.
5. **SAPA-4 — framework reconsideration:** compare the small runtime with LangChain only if future requirements call for multiple complex tool workflows, durable resumability, or framework capabilities. No framework adoption is presumed by this plan.

### SAPA API/contract impact

- Internal model tool calls need not alter browser contract if the user still receives the existing reply and closed suggestions.
- If exposing citations, tool progress, structured proposals, or approval UI, add explicit OpenAPI request/response schemas, error cases, fixtures, and client behavior before implementation.
- Preserve existing `/assistant/chat` identity boundary: no caller-supplied `userId`/role. Add contract changes only for visible UX or deliberate semantic change.
- Document fallback/error semantics consistently across OpenAPI, FAQ, UI, and service tests.

### SAPA acceptance gates

- Unknown tool, malformed args, oversized args/result, cross-user IDs, role escalation, private field leakage, prompt-injected tool result, and denied call cannot access data or mutate state.
- Tool handler is tested against caller ownership; all returned fields are allowlisted.
- Iteration/time/rate budget exhaustion terminates without an unbounded provider loop.
- Provider adapter normalizes tool request and finish reason; invalid provider calls safely fail/fallback.
- Redis expiry, atomic throttle, retry/idempotency and concurrent conversation behavior have tests before launch.
- Existing FAQ-only behavior remains available when tools are disabled/provider unavailable.
- No sensitive prompt, result, authorization header, or image bytes appear in logs.

---

# Part B — Account settings and security

## 7. Product requirements

### ACCOUNT-R1 — Information minimization

- Separate **Profil**, **Keamanan akun**, and **Privasi** sections in settings.
- Do not add date of birth by default. First record the product purpose and whether a less sensitive value (e.g. age band or age-threshold confirmation) meets it. If approved, make optional unless the purpose requires otherwise, validate bounds, use SQL `date`, expose only in self-profile, and define deletion/retention.
- Do not expose secrets, password hashes, MFA secrets, recovery codes, or private object keys in user response schemas.

### ACCOUNT-R2 — Change password

- Dedicated authenticated operation, not an ordinary profile patch.
- Require current password or a recent server-verified reauthentication challenge; apply current password policy and rate limits.
- On success update password hash, rotate/revoke sessions per explicit rule, notify through verified email, and return a clear UI outcome.
- Proposed default: revoke all other active sessions and rotate the current session; test reset-password behavior remains distinct and continues to revoke sessions as designed.
- Generic-safe failures should not disclose account existence; never log password values.

### ACCOUNT-R3 — MFA

- MFA is a new login lifecycle, not a reuse of email-verification/reset OTP. Email OTP already exists only for verification and password recovery.
- Recommended initial option: optional TOTP for regular users; require MFA for admin accounts before privileged production access if operationally feasible. Confirm product policy and support/recovery capacity before rollout.
- Enrollment states: disabled → pending setup → active only after valid code confirmation. Store encrypted TOTP secret using managed encryption/key rotation policy; never return it after enrollment, log it, or store plaintext in user profile DTO.
- Login for active MFA accounts must verify password first, issue only a short-lived, scoped pre-auth challenge, then create the authenticated session only after valid TOTP/recovery code. Rate-limit attempts and prevent challenge replay.
- Generate single-use recovery codes, show them only at issuance, store only salted hashes, support regeneration after recent re-auth and revoke prior codes.
- Require existing factor or strong recovery/re-auth process to disable/replace MFA; notify verified email. Recovery must not silently bypass MFA. Define support process and anti-lockout guidance before enabling.
- Prefer TOTP as first implementation; evaluate WebAuthn/passkeys later because RP ID/domain/origin and recovery require a separate lifecycle and deployment decision.

### ACCOUNT-R4 — Avatar

- Avatar is optional and separate from scan/report/resolution media purpose.
- Dedicated user-owned avatar media lifecycle; allowlisted raster formats, byte/pixel limits, actual content validation, safe image decode/re-encode, generated storage keys, metadata stripping, ownership checks, private storage by default, and removal/cleanup of prior or abandoned objects.
- Decide whether avatar is public within app or authenticated-only. Never expose an unrestricted bucket URL or object key. Prevent SVG/active content unless a reviewed safe rendering path exists.
- Define remove/replace behavior and consistent response if media upload succeeds but profile reference update fails.

## 8. Account design and API/database contract impact

Subject to review of exact existing routes and schemas before implementation:

- `POST /auth/password/change` (or equivalent dedicated auth route): current password + new password; authenticated, CSRF protected, re-authenticated as required. Response reports success only, not secret values.
- MFA endpoints for start enrollment, confirm enrollment, login challenge verification, recovery-code use/regeneration, and disable; precise route names/status/error schemas are to be designed contract-first. Do not create a session at password login when a second factor is required.
- Avatar upload should use the existing safe media upload pattern with a new `avatar` purpose or a dedicated route, followed by an ownership-checked profile reference operation. Contract must define upload limits, image MIME allowlist, response projection, and deletion.
- `PATCH /users/me` may include only approved ordinary profile fields; avoid mixing password/MFA operations into it. Add optional DOB only after approved need.
- Proposed database additions may include dedicated MFA factor/challenge/recovery-code tables and avatar media reference/purpose; exact schema follows current migration patterns, transaction/race analysis, and encryption/key management review. Do not store TOTP/recovery secrets on generic user API payloads.
- Keep OpenAPI, fixtures, generated web types/client, DTOs, repository/service, migrations, test seeds and account deletion cleanup synchronized.

### Account acceptance gates

- Password change rejects wrong current password, stale session, CSRF failure, weak/invalid new credential, and rate-limit abuse; session rotation/revocation and email notice are verified.
- MFA enrollment is not active until confirmed; pre-auth challenge cannot access protected APIs; successful factor creates a session; replayed/expired/over-limit codes fail.
- Recovery codes are single use, stored hashed, not returned after initial reveal, and replacement/disable requires re-auth. Recovery and factor changes notify the account owner.
- Cross-user profile/avatar references fail; unsafe/mismatched/oversized/pixel-flood images fail; originals/metadata are not public; cleanup covers replace/remove/account deletion and partial failure.
- DOB is absent unless product purpose/retention/visibility are approved and documented.
- All auth mutations have CSRF/Origin protection, strict DTO validation, rate limits and security/audit events without secrets.

---

# Part C — Real reports and Malang-focused map

## 9. Map requirements and current behavior

- Set public map and report pin selector initial viewport to a verified Malang center/bounds; keep users able to pan and choose locations. Validate coordinates against the product's intended service boundary where practical; do not silently coerce an outside-city incident into Malang.
- Continue using server-generated H3 cells from canonical incident coordinates and existing eligible statuses. Do not accept client-provided H3 IDs or polygons.
- Display selected time window, `asOf`, method version, eligible event count and stale/no-data state. No data is never labeled low risk/clean.
- Never expose exact coordinates, reporter identity, original report media, home address, internal moderation notes, or unreviewed public summary/media.
- Preserve normal report submission and moderation flow. Do not insert imported records directly as verified or resolved without authorized evidence and audit.

## 10. Real data acquisition checklist for project owner

### Priority A — Ask DLH for an authorized export/sample

Ask whether DLH can provide a sanitized export from Eko Green or another official incident system and permission to display a derived/anonymized version on SAP's map. A 2025 news report described Eko Green as accepting environmental complaints with location and tracking; this is only a research lead, not confirmation of a current integration, data availability, or permission.

Request a small sample first with:

- stable source incident ID (pseudonymous if necessary),
- actual incident latitude/longitude in WGS84, coordinate accuracy and geocoding method,
- incident-observed time, report-submitted time and timezone kept as separate fields,
- incident type/category and severity only where actually recorded,
- factual description, evidence reference/photo and permitted use,
- status history with decision actor authority, timestamps and resolution evidence,
- duplicate/canonical link if one exists,
- city/ kecamatan/kelurahan identifiers for geographic QA,
- source owner, export date, period/coverage, field definitions, license/permission, retention restrictions and contact for corrections.

### Priority B — Ask SAMBAT/official data owners

SAMBAT Online is an official public complaints channel, but this research did not find a downloadable geolocated incident dataset. Ask the data owner for an anonymized export specifically filtered to waste pile-up incidents, plus reuse permission, location precision, date/status semantics, and whether cases were verified or merely submitted.

### Priority C — Data format and quality

- Prefer CSV with documented columns or GeoJSON with explicit CRS; each record must map to one source incident and retain provenance.
- Include coordinate precision/accuracy, timezone, null semantics, stable source ID, evidence permission, moderation source and export timestamp.
- Examine duplicate IDs, out-of-city points, impossible/future dates, approximate centroids, missing timezone, stale incidents, false precision, inconsistent status labels, and privacy-sensitive free text.
- Treat a news article, facility location, service boundary, TPS Pemilu record, tonnage statistic, vehicle/composter delivery documentation, or aggregate count as contextual/facility information—not a report incident. Keep any such layer separate and clearly named if later approved.
- Reject records with invented coordinates, reconstructed incident times, inferred category/severity, unlicensed images, unsupported resolution claims, or no traceable origin.

### Data publication pipeline

1. Receive authorized sample and retain source/licensing metadata securely.
2. Map fields to SAP taxonomy/status without guessing; report incompatibilities to source owner.
3. Validate geometry/time/coverage and scan for personal data; preserve raw source in restricted staging only when permitted.
4. Submit into a reviewed import path as private/unverified (or create normal submissions); preserve source ID/provenance and idempotency to prevent duplicates.
5. Authorized moderator verifies each canonical incident, evidence, public summary and safe derivative using standard audit workflow. Never import a source status as SAP moderator action without an approved signed/traceable process.
6. Reconcile counts, duplicates, H3 generated server-side, privacy and rollback before public release.
7. Publish only verified eligible records with method/date/asOf/no-data explanation and an attribution/limitations statement consistent with license.

### Data acceptance gates

- Written permission/license and source provenance confirmed for every data batch.
- Actual incident point and date supported by source; coordinate and date quality checks pass.
- No facility/aggregate/context records masquerade as incidents.
- Duplicates, city-boundary issues, age window, missing evidence and statuses reviewed by an authorized moderator.
- Public projections pass privacy review; originals remain private; H3 is computed by SAP server/library.
- Sample import can be rolled back and is idempotent; audit trail and attribution survive.
- If no suitable data is available, ship Malang-centered map with honest empty state rather than seeding fictional reports.

## 11. Existing public-source leads (not yet approved for import)

- [Satu Data Kota Malang — TPS Penanggungan](https://data.malangkota.go.id/dataset/data-lokasi-tps-di-kelurahan-penanggungan): dataset description identifies these as polling stations for Pemilu 2024, not waste incidents; exclude from report imports.
- [SAMBAT Online](https://sambat.malangkota.go.id/): official complaints channel. Public site describes intake/routing, but this research did not find an open geolocated waste-incident export.
- [Eko Green launch coverage, 1 July 2025](https://malang.disway.id/malang-mbois/read/6207/dlh-kota-malang-luncurkan-aplikasi-eko-green-permudah-pengaduan-lingkungan-secara-digital): lead for asking DLH about authorized data; article is not itself an incident dataset or evidence of SAP partnership/current API access.
- Satu Data facility statistics/documentation (e.g., TPS/TPST/TPA totals, gerobak/komposter) may help context but are not report events.

---

# Part D — Login/loading and transition UX

## 12. Requirements

- Every async transition has visible pending, success, error and retry/return behavior; no blank/ambiguous logo-only wait.
- Login submit: prevent duplicate submit; show accessible busy label/indicator; preserve form/error context; allow a safe retry on recoverable failure.
- Redirect: use a calm, branded transitional shell with meaningful “Menyiapkan dashboard” status; avoid an indefinite spinner if navigation fails.
- Dashboard bootstrap: distinguish session check from dashboard data loading when useful; use a skeleton or stable layout, handle expired session to login, and offer retry for recoverable errors.
- Route transition: add `loading.tsx` only where the App Router can show a useful fallback. It does not replace client-side fetch/submit state. Verify segment/layout behavior against installed Next.js 16.3 documentation before implementation.
- Respect `prefers-reduced-motion`; animation is short, nonessential, and paired with text/status. Support keyboard, screen reader announcements, focus and mobile sizing.
- Do not make loading changes depend on an API-contract change unless data flow actually changes.

## 13. Design direction and acceptance

- Use a shared small loading/status primitive only where visual/accessible behavior is repeated; avoid global abstraction for one isolated spinner.
- Prefer progress indication only when actual progress is measurable. For unknown duration, use an indeterminate animation with clear text and allow error handling; do not show false percentage.
- Confirm login success reaches dashboard without a blank frame; session failure redirects to login; dashboard data failure shows retry; reduced motion disables nonessential movement.
- Test 320px mobile through desktop, keyboard-only, screen reader status announcement, slow network, offline/error, repeated submit, and route interruption.
- Browser verification is required after implementation because the change is directly observable in preview.

---

# Part E — Delivery, contracts, and sequencing

## 14. Contract and documentation checklist

Before coding any API-visible item:

1. Update this plan with decisions/open questions resolved and explicit scope.
2. Confirm current implementation and exact endpoint/migration names.
3. Change `contracts/openapi.json` first: routes, request/response schemas, enums, authentication/CSRF, errors, field optionality/nullability, upload constraints and privacy projections.
4. Update `contracts/fixtures.json` with valid and invalid cases; keep all sample incident data explicitly synthetic and never present it as real.
5. Regenerate frontend types/client; no manual generated-type edits.
6. Update DB design and additive migrations; document rollback/cleanup and deployment order.
7. Update `docs/API_SPEC.md`, `DATABASE.md`, `REQUIREMENTS.md`, `TEST_PLAN.md`, `CONTENT_OPERATIONS.md`, `SAPA_ASSISTANT.md`, and `INTEGRATION_CONTRACT.md` where affected; remove contradictions rather than layering another incompatible spec.
8. Implement backend service/validation/authorization/tests, then frontend states/flows against generated contract; run contract checks and relevant workspace checks.
9. Verify staging flows and privacy/security gates. For browser-visible changes, use preview-based verification.

Internal SAPA tool protocol is not a public API unless surfaced to the client. Do not leak provider-native tool-call schema into OpenAPI.

## 15. Recommended order and gates

### Phase 0 — Decisions and evidence

- Review this plan with product owners.
- Confirm DOB necessity, MFA policy/support recovery, avatar visibility/limits, SAPA grounding/fallback policy and tool pilot, and data source contact/permission.
- Request a small real-data sample from authorized data owner; no import yet.

**Gate:** product/security decisions recorded; no unresolved high-risk data handling decision.

### Phase 1 — Low-risk UX and documentation

- Correct map default viewport to Malang and empty-state copy; no fabricated incident seeding.
- Improve login/dashboard loading states, reduced motion and accessibility.
- Reconcile SAPA documentation with active contracts and decide fallback semantics/tests; do not add model tools yet.

**Gate:** preview/keyboard/reduced-motion checks pass; map copy accurately explains no-data; contract/doc checks pass.

### Phase 2 — Account security foundation

- Contract-first password-change API and UI, session policy, notification, tests.
- Design and implement MFA lifecycle/recovery only after recovery/support operations and encryption/key management are approved.

**Gate:** auth, CSRF, session, challenge replay/rate limits, recovery, notifications, and account lockout tests pass.

### Phase 3 — Avatar and optional profile scope

- Implement dedicated avatar media lifecycle and privacy design. Only add DOB if approved product rationale and retention policy exist.

**Gate:** upload hardening, ownership, cleanup, safe serving and deletion tests pass.

### Phase 4 — SAPA read-only tool pilot

- Prototype adapter compatibility/cost; implement one bounded tool behind a flag only after policy and test suite exist. Expand only on measured user value.

**Gate:** tool authz/privacy/injection/budget tests pass; FAQ-only fallback remains; operations can disable the feature.

### Phase 5 — Authorized data pilot

- Validate small authorized data batch, moderation, dedup, map projection, attribution and rollback. Expand only after pilot quality review.

**Gate:** data provenance/permission and moderation/publication acceptance all pass.

Phases can be scheduled in parallel only when dependencies and contract ownership are clear. Never accelerate by skipping data authorization, auth recovery, privacy review, or contract gates.

## 16. Non-goals

- Fabricating or bulk-generating real-looking Malang incidents to make the map visually busy.
- Treating TPS Pemilu locations, waste facilities, tonnage totals, news coverage, or municipal statistics as incident reports.
- Giving SAPA open-ended internet, database, shell, admin, account mutation, moderation, or autonomous report submission tools.
- Adopting LangChain solely to claim an agent feature; no framework decision is made by this plan.
- Collecting date of birth without need; shipping passkeys before RP ID/recovery design; exposing user media publicly by default.
- Displaying fake progress percentages, claiming agency response without proof, or interpreting an empty map as a clean area.

## 17. Open decisions to resolve before implementation

| Decision | Recommended default | Owner/needed evidence |
| --- | --- | --- |
| SAPA grounding behavior and provider-failure fallback | Approved FAQ only; deterministic Help fallback when grounding/provider is insufficient | Product owner + tests against current prompt/provider |
| SAPA first tool | One minimal account-owned status/aggregate tool behind server feature flag | Product value, existing service purity, data projection review |
| LangChain | Do not adopt for initial pilot; revisit after prototype evidence | Gateway compatibility, complexity, maintenance and cost comparison |
| DOB/age | Do not collect until a concrete feature/legal purpose is documented | Product/legal requirement and retention policy |
| MFA availability | Optional TOTP for users; admin MFA required before privileged production use if recovery support is ready | Operational support, encryption/key management, recovery SOP |
| Avatar public visibility | Private/authenticated rendering until product explicitly chooses public visibility | Privacy/security review and serving design |
| Password change session behavior | Revoke other sessions, rotate current, notify verified email | Session implementation/security test |
| Malang report source | Ask DLH/Eko Green and SAMBAT data owners for authorized sanitized sample | Written permission, license, schema, evidence/coverage |
| Imported report verification | Normal SAP moderator review unless source authority and auditable import procedure explicitly approved | Content operations owner and audit policy |
| Map boundary validation | Malang-centered viewport first; server-side service-area validation policy requires product confirmation | Desired geography and official boundary source |

## 18. Research references

- LangChain JS tools/runtime context: https://docs.langchain.com/oss/javascript/langchain/tools
- LangChain JS human-in-the-loop: https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop
- LangGraph checkpointers: https://docs.langchain.com/oss/javascript/langgraph/checkpointers
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Multifactor Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet
- W3C Web Authentication Level 3: https://www.w3.org/TR/webauthn-3/
- Next.js loading convention: https://nextjs.org/docs/app/api-reference/file-conventions/loading
- Satu Data Kota Malang — TPS Penanggungan: https://data.malangkota.go.id/dataset/data-lokasi-tps-di-kelurahan-penanggungan
- SAMBAT Online Kota Malang: https://sambat.malangkota.go.id/
- Eko Green launch coverage (1 July 2025; research lead, not authoritative dataset access): https://malang.disway.id/malang-mbois/read/6207/dlh-kota-malang-luncurkan-aplikasi-eko-green-permudah-pengaduan-lingkungan-secara-digital

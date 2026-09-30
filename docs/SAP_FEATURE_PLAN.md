# SAP Feature Plan — SAPA, Account Settings, Malang Map Data, Loading UX

**Status:** Planning baseline; not an implementation specification approved for release.
**Prepared:** 29 September 2026
**Scope:** Product requirements, design direction, architecture, API/database/contract impact, data sourcing, sequencing, and acceptance gates for four requested improvements.
**Implementation rule:** This document is the working source for future implementation planning. Before coding each feature, reconcile this plan with current source, OpenAPI, fixtures, migrations, and product decisions; update this document and contracts first when decisions change. OpenAPI remains authoritative for API shapes.

## 1. Executive summary

1. **SAPA (flagship):** Current implementation is a single-call, read-only FAQ assistant; it has no agent tool registry or execution loop. Evolve it into a **bounded, read-only agentic assistant** built on **LangGraph** (its 1.x runtime, via `create_agent`), keeping our OpenAI-compatible gateway through LangChain's `ChatOpenAI` with a custom `baseURL`. Ship in three layers: (a) a **hybrid cited-retrieval** knowledge baseline (PostgreSQL `pgvector` + full-text with an Indonesian stop-list, fused with RRF); (b) a small catalog of **~8 read-only, account-scoped tools** whose identity/scope is enforced in server code, never by the model; (c) LangGraph orchestration for durable conversation state, streaming, and human-in-the-loop slots. Keep the simple FAQ answer path near-direct (do not route trivial lookups through the full agent). All existing guardrails (feature flag, per-account opt-in, rate limit, ownership) wrap the graph rather than being replaced by it. **Decision reversed from the earlier baseline:** LangChain/LangGraph is now adopted deliberately and selectively — see §5 (SAPA-RAG and SAPA-R5) and §17.
2. **Account settings:** Improve profile/security controls with an authenticated password-change flow, optional MFA with secure recovery, and a carefully isolated avatar upload lifecycle. Do not collect date of birth without a documented product/legal need.
3. **Malang map:** Correct the map’s initial location to Malang, but do not manufacture reports to fill it. Obtain genuine, permissioned incident records with usable coordinates, dates, evidence, and provenance; moderate them through the normal workflow. Until then show an honest “Belum ada data” state. For the competition demo, if historical coverage is needed, use a separate, clearly labeled **“Data historis bersumber”** layer sourced from cited public material — never by backdating reports into the live verified pipeline (see Part C section 11).
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
- SAPA currently uses an OpenAI-compatible adapter, backend-owned prompt/FAQ, and temporary Redis conversation history. It is not currently an agent framework integration. Its existing FAQ matching is simple lexical/token-overlap scoring with page-context boost — no vector search or embedding index — which is a usable starting point for the thin cited retrieval baseline described in SAPA-RAG.
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

**Governing safety principle (structural, not filter-based).** SAPA's single biggest security advantage is that it is **read-only by design**: expose only Query tools, never Command (write) tools. Per the cross-vendor prompt-injection design-patterns literature (arXiv:2506.08837) and IPIGuard (arXiv:2508.15310), a read-only tool an attacker hijacks via injected content can still only *read* — it cannot move money, submit reports, or mutate state. Do not add any write/mutate/outbound tool "for later"; an absent capability cannot be latched around. Two rules make this real:

- **Account scope is derived server-side from the authenticated session, never from a model-supplied argument.** The model may pass filters (date range, status, a report id it will be ownership-checked against) but must never pass or override the identity scope. Enforce this in the query builder or via Postgres Row-Level Security — the canonical failure is a missing tenant filter returning other users' rows with HTTP 200 and no warning.
- **Every retrieved passage and tool result is untrusted data.** Place it only in tool-result slots, never in the system prompt; treat an injection inside a tool result as expected. Detectors are speed bumps, not boundaries (independent testing shows ~100% evasion of injection filters) — rely on the read-only toolset, scope enforcement, and strict output schema; use detectors only to reduce frequency. Redact PII/secrets from results post-tool (return report status + category, not reporter phone/email/exact GPS; round or drop precise coordinates of others' reports).

**Proposed 8-tool read-only catalog** (all scope the account server-side; "risk" is PII/aggregation leakage since none can write):

| Tool | Purpose | Safety |
|------|---------|--------|
| `get_my_scans` | List/summarize the caller's own scans + classifications (paginated, own `user_id`) | Safe — own data |
| `get_scan_detail` / `explain_my_scan` | One own scan by id (category, confidence, timestamp) + cited sorting guidance; never re-interpret the image or expose bytes | Safe — ownership check on id |
| `get_my_reports` | List the caller's own reports with current status | Safe — own data |
| `get_report_status` | Status/history of one own report by id; exclude moderator PII/internal notes | Safe — ownership check |
| `check_report_readiness` | Validate a user-supplied draft against published required fields/categories; return missing-field guidance only, never save/submit | Safe — no persistence |
| `get_area_hotspots` / `get_public_area_summary` | Verified, H3-aggregated hotspot data for a bounded area/period | **Medium** — aggregate only; k-anonymity, never raw per-report locations or reporter identity |
| `list_waste_categories` | Waste category taxonomy + descriptions | Safe — static reference |
| `get_my_achievements` / `get_my_progress` | The caller's own points/achievements (verified read-only projection; must not call methods that reconcile/unlock/revoke) | Safe — own data |
| `search_help_content` | The RAG tool: retrieve FAQ/help passages, returns citation-ready chunks | **Medium** — untrusted-content ingestion point; fence results, drive citation cards |

The two **Medium** tools (`get_area_hotspots`, `search_help_content`) concentrate injection/PII risk — apply capability discipline and post-tool redaction there. **Deliberately excluded:** any tool returning another user's scans/reports, precise geolocation of others' reports, moderator queues, or user directories — no read-only-safe projection exists for a civic assistant. Keep tool descriptions **sharp and non-overlapping** (the most common cause of wrong-tool selection, fixable without a bigger model).

Retain the earlier pilot framing below (it is compatible with this catalog):

**First pilot — useful, low-risk, and grounded in existing account ownership:**

- `get_my_stats`: minimal aggregate statistics for the authenticated user (existing stats service only after confirming it is side-effect-free).
- `list_my_report_statuses`: only minimal status/date/category fields for reports owned by the caller; exclude description, exact location, media, reporter details, internal notes.
- `check_report_readiness`: validate a user-provided draft locally/server-side against published required fields and allowed categories; return missing-field guidance only. Do not save or submit the draft and do not claim the event is true.
- `explain_my_scan`: explain a scan result owned by the caller using approved, cited waste-sorting guidance; do not reinterpret the image, change classification, or expose image bytes.

**Demo expansion — gated on data contracts and evaluation:**

- `get_public_area_summary`: validated public aggregate, bounded date range and viewport/cell; exclude exact coordinates, identities, signed media URLs, and unbounded result sets. Use the same canonical API map aggregates; the model must not calculate risk or infer cleanliness from missing data.
- `compare_public_areas`: compare two bounded, policy-eligible public aggregates with explicit period, eligible event counts, and no-data caveat; no unsupported causal or trend claims.
- `get_my_progress`: summarize account-owned progress using a verified read-only projection; do not call achievement methods that reconcile, unlock, revoke, or otherwise mutate state.
- `get_education_quiz`: select a short educational question from an approved, versioned corpus; answers/explanations include source citations and are not official legal or municipal advice.
- Closed-set navigation suggestions (e.g. Help, My Reports, Scan History, Map) remain validated response actions, not arbitrary URL/open-web tools.

Expose tools incrementally: start with one or two pilot tools, then add only after each has a reviewed domain-service purity check, allowlisted response projection, privacy review, eval coverage, and measurable user value. No autonomous report submission, account/settings mutation, moderation, web search/scraping, generic SQL/HTTP, or shell access.

### SAPA-RAG — lightweight, cited knowledge retrieval

- Use a small curated corpus of SAP help, waste-sorting guidance, and approved local education material. Maintain source ID, title, publisher/owner, canonical URL, language, publication/review date, version, reuse/license basis, topic tags, and active/retired status. Reject uncited or unreviewed material from production answers.
- **Retrieval baseline: hybrid, in PostgreSQL — do not add a separate vector DB.** SAP already runs PostgreSQL; add `pgvector` (`CREATE EXTENSION vector`, HNSW index) so embeddings live in the same ACID row as the source and scoped filters (language, topic, active status) run in the same query plan. Run **two retrievers and fuse them with Reciprocal Rank Fusion (RRF, k=60)**: (1) dense `pgvector` similarity, and (2) PostgreSQL full-text/BM25. **Indonesian correctness is a day-one gate, not a later tuning step:** PostgreSQL's `indonesian` FTS config ships a Snowball stemmer but **no stop-word list**, so `yang`/`dan`/`di`/`dari` become required terms and wreck recall — install the ~93-word Snowball Indonesian stop-list before any eval run. The Snowball stemmer also does not reverse nasal assimilation (`menerima`→`erima` vs `terima`), so the lexical half is structurally weak for Bahasa Indonesia; **weight the dense half higher** (start ~`vector 0.6 / bm25 0.4`) and add `pg_trgm` for typos on short fields. A FAQ/knowledge corpus is tiny (thousands of chunks), far inside pgvector's comfort zone; a hosted vector DB (Pinecone/Qdrant/Weaviate) is not justified at this scale and adds a vendor + consistency boundary. Return top passages with scores/source IDs, apply a measured relevance threshold, and answer only from retrieved context with compact citation cards.
- Embedding model: a multilingual encoder (`bge-m3`, `multilingual-e5-large-instruct`, or Cohere `embed-multilingual-v3.0`) is measurably stronger on Bahasa Indonesia; `text-embedding-3-small/large` via the OpenAI-compatible gateway is an acceptable start. The lever that matters most is the lexical config, not the embedding choice.
- Keep retrieval separate from structured operational data: reports, scan ownership, statuses, and public map aggregates come from bounded API/domain tools, not from embedding or searching report text. Retrieval must not expose private content.
- If no sufficiently relevant passage exists, say that the answer is not available in the approved sources and offer Help/navigation; do not fill the gap with model knowledge. Show publication/review date where useful and distinguish source guidance from SAP policy.
- Adopt `pgvector` + hybrid retrieval as described above; keep a **reranker and any external web-search tool out of the first release**. Reconsider a reranker only if the measured fused baseline still misses meaningful queries and the relevance gain justifies operational cost. Never add an external/open-web search tool to production answers.
- Build a versioned Indonesian evaluation set before expanding: realistic user questions, expected source/passages, reference answer or required facts, spelling variants, off-topic and unanswerable cases, prompt injection in user/query/document text, plus tool authorization/privacy cases. Track retrieval Recall@k/MRR (or nDCG), answer groundedness/faithfulness, relevance, citation correctness, abstention quality, latency, and cost. Review failures manually; do not optimize a single aggregate score alone.
- Never ingest search-result snippets as authoritative answers. For any future externally sourced demo content, retain provenance and reuse basis; citations establish where claims came from, not that an incident was independently verified.

RAG contract/UI impact: internal retrieval can remain server-only if existing response text is sufficient. If citations or source snippets are shown to users, define a bounded citation schema (source ID/title/URL/review date and cited passage excerpt), validate safe URLs, update OpenAPI/fixtures/generated types and accessible citation UI, and avoid leaking internal source notes.

Framework decision (reversed): **adopt LangGraph as the agent runtime** for the tool loop, durable conversation state, streaming, and human-in-the-loop slots — these are genuinely hard to build well by hand. Keep the hot paths thin: retrieval stays custom (hybrid SQL, above) and the trivial FAQ answer stays near-direct rather than routed through a heavyweight graph. Implement against LangChain's `Tool`/`ChatModel` contracts so an exit path stays open, pin versions (LangChain/LangGraph hit 1.0 GA on 2025-10-22 with a no-breaking-changes-until-2.0 pledge, but the 0.x churn history warrants pinning), and set an explicit `recursion_limit` + token budget to avoid the well-documented runaway-loop cost trap. Framework state must **not** bypass existing user-scoped Redis retention/authorization — use a Redis or Postgres checkpointer that respects the same ownership and TTL rules.

**Illustrative wow-demo flow (read-only):** “Why was this item classified this way?” → `explain_my_scan` + cited approved guidance; “Is my draft ready?” → `check_report_readiness` and a link to the form; “What changed in these two areas?” → `compare_public_areas` over bounded aggregates; “What should I learn next?” → `get_education_quiz`. Every flow discloses limits, uses only the signed-in user’s permitted data, and never submits or verifies an incident.


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
- **LangGraph is the adopted runtime for the tool loop** (see SAPA-RAG and §17). Add per-hop guardrails around it (input: PII masking + injection detection on user text *and* tool results; pre-tool: arg validation + permission check; post-tool: PII/secrets redaction), and roll guardrails out in **audit mode first**, review a week of traces, then promote to enforce — a blocked hop can fail a whole turn, so false-positive cost is real. Note LLM-output guardrails are skipped on streamed responses, so decide where a turn must be non-streamed. If HITL interrupts are adopted, persistent checkpoint/resume must be designed deliberately; the current ephemeral Redis chat history is not automatically a compatible checkpoint — use a checkpointer that honors the same user-scoped ownership and TTL.

## 6. SAPA design and implementation sequence

1. **SAPA-0 — reconcile contract/docs and behavior:** verify active prompt/provider/service; align docs with actual routes and policy; choose grounding/fallback semantics; add tests for known FAQ, unknown, off-topic, malformed output, provider failure, invalid actions, and injection.
1b. **SAPA-RAG-1 — curated corpus and hybrid retrieval:** register a small, reviewed, versioned source set; chunk with overlap; add `pgvector` (HNSW) + PostgreSQL full-text with the **Indonesian stop-list installed**, fuse with RRF (dense-weighted), and answer-only-from-context; build the Indonesian eval set (relevant, spelling-variant, off-topic, unanswerable, injection) and record Recall@k/MRR + groundedness + citation-F1 before wiring the agent runtime.
2. **SAPA-1 — technical spike:** prototype one read-only tool through **LangGraph `create_agent`** pointed at the OpenAI-compatible gateway via `ChatOpenAI` (`configuration.baseURL`, `streamUsage:false` if the gateway rejects `stream_options`); test tool-call compatibility, latency, framework overhead, `recursion_limit`, timeout, serialization, error handling and log redaction. No production tool enabled during spike.
3. **SAPA-2 — bounded runtime:** implement the LangGraph graph + tool registry with strict schema validation, server-derived caller scope, per-hop guardrails (audit mode), ownership-scoped handlers, redaction, budgets/recursion cap, safe termination, and tests. Begin with one low-risk tool behind a server-side feature flag/canary.
4. **SAPA-3 — expand only on evidence:** add tools from the §5 catalog only when users cannot complete an important task via FAQ/navigation and the tool has a reviewed data contract and owner.
5. **SAPA-4 — durability & HITL (optional):** add checkpointed resume / human-in-the-loop middleware only if a concrete workflow needs it, honoring existing user-scoped retention/authorization.

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
- Retrieval: every retrieved passage maps to an active approved source; below-threshold queries abstain instead of answering from model knowledge; citations resolve to allowlisted URLs; eval set covers Indonesian variants, unanswerable questions, and injection in query or document text.
- No sensitive prompt, result, authorization header, or image bytes appear in logs.

---

# Part B — Account settings and security

## 7. Product requirements

### ACCOUNT-R1 — Information minimization

- Separate **Profil**, **Keamanan akun**, and **Privasi** sections in settings.
- Do not add date of birth by default. First record the product purpose and whether a less sensitive value (e.g. age band or age-threshold confirmation) meets it. If approved, make optional unless the purpose requires otherwise, validate bounds, use SQL `date`, expose only in self-profile, and define deletion/retention.
- **Legal grounding (Indonesia PDP Law, UU No. 27/2022, in force since Oct 2024):** Art. 16(2) mandates data-minimization — collection must be "terbatas dan spesifik" to an explicit purpose. Collecting full DOB with no processing purpose violates this and raises breach impact (unlawful collection carries fines up to Rp 6 billion). Children's data is "specific personal data" (high-risk) and **GR No. 17/2025** adds child-oriented duties (age verification, parental consent, privacy-by-default, profiling/location restrictions) for platforms accessible to minors — a civic app plausibly is. **Recommendation: do not collect full DOB; if age-gating is ever needed, collect an age band or self-attested 18+ flag instead**, optional, with a clear purpose statement, and wire deletion into account-delete (honor correction within 3×24h per Art. 30).
- Do not expose secrets, password hashes, MFA secrets, recovery codes, or private object keys in user response schemas.

### ACCOUNT-R2 — Change password

- Dedicated authenticated operation, not an ordinary profile patch.
- Require current password or a recent server-verified reauthentication challenge; apply current password policy and rate limits.
- On success update password hash, rotate/revoke sessions per explicit rule, notify through verified email, and return a clear UI outcome.
- Proposed default: revoke all other active sessions and rotate the current session; test reset-password behavior remains distinct and continues to revoke sessions as designed.
- Generic-safe failures should not disclose account existence; never log password values.
- **Concrete choices (OWASP ASVS 5.0 / Top 10:2025):** hash with **Argon2id** (`argon2` npm package; ≥19 MiB memory, 2 iterations, parallelism 1). bcrypt is legacy-only (cost ≥12, 72-byte cap); if SAP already stores bcrypt, opportunistically re-hash to Argon2id on next successful login. Do **not** force periodic rotation — only on suspected breach. Validate the new password against breached-credential lists via the **HaveIBeenPwned k-anonymity range API** (never sends the full password) or at minimum a local top-10k list. Revoking other sessions is the single most important post-change control; use SAP's Redis session store to delete all of the user's session keys except the current one, and rotate the current session id. Notify via SMTP (ASVS §6.3.7); the email discloses that a change happened, never the password. Plan the email-change flow together (dual-email: notify old address, confirm new via time-limited nonce, store new as pending).

### ACCOUNT-R3 — MFA

- MFA is a new login lifecycle, not a reuse of email-verification/reset OTP. Email OTP already exists only for verification and password recovery.
- Recommended initial option: optional TOTP for regular users; require MFA for admin accounts before privileged production access if operationally feasible. Confirm product policy and support/recovery capacity before rollout.
- Enrollment states: disabled → pending setup → active only after valid code confirmation. Store encrypted TOTP secret using managed encryption/key rotation policy; never return it after enrollment, log it, or store plaintext in user profile DTO.
- Login for active MFA accounts must verify password first, issue only a short-lived, scoped pre-auth challenge, then create the authenticated session only after valid TOTP/recovery code. Rate-limit attempts and prevent challenge replay.
- Generate single-use recovery codes, show them only at issuance, store only salted hashes, support regeneration after recent re-auth and revoke prior codes.
- Require existing factor or strong recovery/re-auth process to disable/replace MFA; notify verified email. Recovery must not silently bypass MFA. Define support process and anti-lockout guidance before enabling.
- Prefer TOTP as first implementation; evaluate WebAuthn/passkeys later because RP ID/domain/origin and recovery require a separate lifecycle and deployment decision.
- **Concrete choices (RFC 6238 / NIST SP 800-63-4):** use **`otplib`** (or `otpauth`); pin parameters explicitly (`algorithm: sha1`, `digits: 6`, `step: 30`, `window: 1` — do not widen the window; clock skew is an NTP problem). Generate a 160-bit secret, render an `otpauth://` QR with the `qrcode` package, persist the secret **`pending`** and flip to **`active`** only after a live code proves possession. Encrypt the secret at rest (AES-256-GCM, key from env/KMS, store `iv:tag:ciphertext`) — it is password-equivalent. **Replay protection:** store `last_accepted_step` per user and reject any code whose time-step ≤ the stored value. **Rate limiting is mandatory, before the crypto check:** a 2025 analysis shows a 6-digit TOTP reaches ~50% brute-force success in hours at only 20-30 req/s — lock the challenge after 5-10 consecutive failures with backoff (Redis counter). **Backup codes:** issue 8-16 single-use codes at enable time (≥~60 bits entropy each), hash before storing, show plaintext once, delete on use, invalidate all on regenerate; apply the same brute-force protection. Skip SMS/email entirely as a factor (NIST "restricted"; ASVS disallows email as auth). **Passkeys are phase-2, additive** (not passkey-only): older/low-end Android support is uneven and passkey recovery is non-standardized, so keep password + TOTP + backup codes as the base for a broad-access civic app.

### ACCOUNT-R4 — Avatar

- Avatar is optional and separate from scan/report/resolution media purpose.
- Dedicated user-owned avatar media lifecycle; allowlisted raster formats, byte/pixel limits, actual content validation, safe image decode/re-encode, generated storage keys, metadata stripping, ownership checks, private storage by default, and removal/cleanup of prior or abandoned objects.
- Decide whether avatar is public within app or authenticated-only. Never expose an unrestricted bucket URL or object key. Prevent SVG/active content unless a reviewed safe rendering path exists.
- Define remove/replace behavior and consistent response if media upload succeeds but profile reference update fails.
- **Concrete choices (OWASP File Upload / ASVS 5.0 V5):** allowlist `image/jpeg`, `image/png`, `image/webp` — **reject SVG** (active content / XSS). Validate by **magic bytes** (`file-type` npm), not extension or Content-Type (both spoofable). Enforce a size cap (~5 MB) *and* a pixel cap (reject > ~40 MP) to stop decompression/pixel-flood DoS. **Re-encode + resize server-side with `sharp`** to a fixed size (e.g. 512×512, WebP/JPEG) — this one step destroys embedded scripts/polyglots **and strips EXIF/GPS** (confirm you do **not** call `.withMetadata()`; GPS stripping is PDP-law data-minimization, since user photos often carry coordinates). Use a random UUID storage key, never the client filename. **Architecture fits SAP's worker + R2:** API issues a presigned PUT to a private quarantine prefix → worker (on object-created) validates magic bytes → `sharp` re-encode/resize → writes clean object to the serving prefix → updates the DB record status. Serve public avatars via CDN or private assets via short-lived signed URLs; set `X-Content-Type-Options: nosniff`. Given the forced re-encode, ClamAV is optional defense-in-depth (lower priority). Keep an audit trail (sha256, uploader, timestamp) and an admin takedown path for abusive imagery.

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

### Priority D — Open geospatial "shopping list" (facility/context and boundary/geocoding aids only, NOT incidents)

These are open sources the project owner can fetch directly. **None of them are citizen-report incidents** — they are (1) the Kota Malang administrative boundary polygon used to keep the map focused and to run a point-in-polygon Kota-vs-Kabupaten filter, and (2) optional facility/context point layers that, if ever displayed, must live in a separate clearly-labeled layer per the discipline above. Capture license/attribution and retrieval date for each.

| Source | URL | What to fetch | Discipline / how to use |
| --- | --- | --- | --- |
| **BIG (Badan Informasi Geospasial) geoservices** | `https://geoservices.big.go.id/` | Kota Malang administrative-boundary polygon (batas wilayah / batas administrasi Kota Malang); optionally the "Tempat Sampah" point layer (a MapServer feature service exposing waste-point features with real coordinates). | The boundary polygon is the **authoritative point-in-polygon filter** — any candidate coordinate that does not fall inside Kota Malang's 5 kecamatan (Klojen, Blimbing, Lowokwaru, Sukun, Kedungkandang) is Kabupaten Malang or Malang Raya and must be excluded or relabeled. The "Tempat Sampah" points are facilities/context, not incidents. |
| **SIPSN — Sistem Informasi Pengelolaan Sampah Nasional (KLH)** | `https://sampahnasional.kemenlh.go.id/` | City-level waste generation/composition/coverage statistics for Kota Malang; TPS/TPST/TPA facility figures. | Aggregate statistics and facility counts — **context only**, never a report event. Useful to describe the problem, not to place markers. |
| **Satu Data Kota Malang** | `https://data.malangkota.go.id/` | Official open datasets: facility locations (TPS/TPST/TPA), kelurahan/kecamatan reference geometries, DLH operational data. | Verify each dataset's actual meaning before use (e.g., the "TPS Penanggungan" set is Pemilu polling stations, not waste). Facility/reference layers only. |
| **BPS Kota Malang** | `https://malangkota.bps.go.id/` | Administrative reference (kecamatan/kelurahan lists, population) for QA and boundary labeling. | Reference/QA context; not incidents. |
| **OpenStreetMap via Overpass API** | `https://overpass-api.de/api/interpreter` | Query `amenity=waste_disposal`, `amenity=waste_basket`, `amenity=recycling` within the Kota Malang boundary (bbox/area filter). | Community-maintained **facility** points; freshness/accuracy varies. Attribution: © OpenStreetMap contributors (ODbL). Context layer only. |
| **Nominatim (OSM geocoding)** | `https://nominatim.openstreetmap.org/` | Geocode a named road segment/intersection from a verified news lead to candidate coordinates. | **Only to assist a human-verified event** with a source-stated location; the result MUST then be verified inside the Kota Malang polygon. Never geocode a bare kelurahan/neighborhood name to a false-precision point marker. Honor the 1 req/s usage policy. |

**Point-in-polygon Kota vs Kabupaten filter (mandatory):** load the BIG Kota Malang boundary polygon once, and for every candidate coordinate (from geocoding, a facility layer, or a source coordinate) test membership before it is stored or displayed. A "Malang" mention in a headline is not proof of Kota Malang; only geometry inside the polygon (or an explicit source statement of the kecamatan) confirms it. This is the single discipline that keeps the map "fokus di Malang dan nggak ngawur."

## 11. Competition demo: historical reports sourced from public material

This is a separate, optional demo-data track—not a shortcut through the citizen-report or moderator workflow. Ordinary SAP reports have a limited recent-event window and the public map is a current verified-event product. Older press-reported events therefore must not be backdated, relabeled, or forced through live report creation. If the competition needs historical coverage, design an explicitly separate historical-source layer/import table with its own API projection, date-range rules, visual treatment, and removal switch. Label it visibly **“Data historis bersumber (bukan laporan warga terverifikasi)”**; do not mix its counts into live verified map cells, risk interpretation, or moderation status. Any integration requires product/security/contract approval first.

### Candidate-source inventory (research checked 29 September 2026; candidates only)

These links are leads for human review, not approved seed rows. A story date is a publication date unless the source explicitly supplies an event date or interval. Multiple stories about one long-running location/problem are not multiple independent events. Re-open and verify each source at collection time; URLs and content can change.

| Candidate lead | What the source supports | Do not infer / review needed |
| --- | --- | --- |
| [MalangTIMES — Jatimulyo waste fire, 16 Sep 2026](https://madura.jatimtimes.com/baca/3331350404/20260916/044000/tumpukan-sampah-di-jatimulyo-malang-terbakar-area-750-meter-persegi-hangus) | Article headline reports a waste pile fire in Jatimulyo, Kota Malang; article appears to cite a 750 m² affected area. | Fetch timed out during this review; independently open source and verify full facts. No exact point established here; do not invent coordinates or treat headline as an independently verified incident. |
| [MalangTIMES — Jalan Muharto open pile/TPS issue, 2 Jul 2026](https://malangtimes.com/baca/3331346365/20260702/111200/imbauan-dilarang-buang-sampah-tak-digubris-sampah-justru-menumpuk-di-muharto) | Story describes a recurring roadside accumulation at Jalan Muharto and says the arrangement had continued for about two decades; it also quotes DLH on daily collection and a search for a replacement TPS. | This is a persistent service/facility condition, not evidence of a discrete event on 2 July or many daily incidents. Keep as contextual/ongoing issue unless a clear event record and exact time/location can be independently established. |
| [Pemkot Malang — DLH plans Muharto TPS relocation, 6 Jul 2026](https://malangkota.go.id/2026/07/06/dlh-siapkan-relokasi-tps-muharto/) | Official city source describes TPS arrangement in Kelurahan Kota Lama, Kedungkandang, and an ongoing relocation plan. | Related to the same persistent Muharto service issue; not a second incident. Article address metadata does not establish the pile's exact coordinates. |
| [MalangTIMES — Muharto enforcement, 10 Sep 2026](https://malang.jatimtimes.com/baca/3331350056/20260910/092000/masih-bandel-buang-sampah-di-muharto-tipiring-menanti-5-orang-sudah-ditindak) | Lead describes enforcement against illegal dumping on/near Jalan Muharto. | Confirm whether this is a distinct event or another report about the long-running site. Do not create a separate pile-up record without event-specific evidence and a supported point. |
| [JatimTIMES — RW 5 Jatimulyo collection dispute, 14 Apr 2026](https://bondowoso.jatimtimes.com/baca/3331341805/20260414/122500/sampah-menumpuk-di-jatimulyo-warga-rw-5-bongkar-dugaan-pungli-di-tps) | Article locates a complaint in RW 5, Kelurahan Jatimulyo and says a resident representative described a problem as ongoing since 2021. | Publication date is not onset date; this is an ongoing collection/service dispute, not a set of independently dated pile-up events. Treat allegations as allegations, not established facts. |
| [Malang Posco Media — Muharto illegal TPS alternatives, 29 Jun 2026](https://malangposcomedia.id/dlh-kesulitan-cari-alternatif-lahan-pengganti-tps-liar-muharto/) and [Info Nasional — Muharto pile, 28 Jan 2026](https://www.infonasional.com/tumpukan-sampah-muharto-malang) | Additional reporting leads about the recurring Muharto location/problem. | Likely overlap with other Muharto coverage; cluster for duplicate review, do not count each story as an incident. |
| [City Guide FM — Lowokdoro illegal dumping, 11 Jul 2026](https://cityguide911fm.com/sampah-liar-masih-bayangi-wisata-gantangan-burung-lowokdoro/) | Lead describes complaints about illegal waste and burning near the Lowokdoro birding-tourism area. | Needs full-source verification, event date, precise enough location, and confirmation that the site is in Kota Malang; don't geocode a named neighborhood to a false-precision point. |
| [BatasMedia99 — Jodipan waste pile, 26 Mar 2026](https://mail.batasmedia99.com/berita/batasmedia99news/viral-sampah-gunung-di-jodipan-malang-diduga-sejak-h-2-lebaran-tak-diangkut/) | Third-party report alleges a large pile in Jodipan and says it may have existed since around the second day of Eid. | Verify the date claim and location with better evidence; the article itself reportedly says there was no official clarification. Do not turn “diduga” into established fact. |
| [Pemkot Malang — GASS cleanup activity, 7 Dec 2025](https://kecklojen.malangkota.go.id/2025/12/08/minimalisir-daerah-rawan-banjir-wali-kota-malang-ajak-giatkan-kerja-bakti/) | Official story describes cleanup/volunteer activity at several named places, including Jalan Dieng, Klaseman, Taman Kediri, and Jalan Joyo Raharjo. | A cleanup report is not automatically proof of an independently dated resident incident at every listed place; use only if the source ties a specific observed pile to a sufficiently precise location/time. |

Exclude Kabupaten Malang and broader Malang Raya events unless the product boundary is deliberately expanded and labeled; Kota Malang must be confirmed from the source/geography, not inferred from “Malang” in a headline.

### Historical source-record schema (proposal; do not implement before approval)

A reviewable CSV/GeoJSON staging format should include at least:

- stable `source_record_id`, canonical source URL, publisher, article title, publication timestamp/timezone, retrieval timestamp, archived/captured evidence reference where permitted, and source/reuse/license basis;
- `event_start`/`event_end` only when directly supported (otherwise null), source's original time wording, temporal precision (`instant`, `day`, `range`, `ongoing`, `unknown`), and timezone; never substitute publication time for event time;
- original location wording, city/kecamatan/kelurahan (with boundary lookup source), geometry only when supported, CRS, geocoding method, accuracy/confidence, and spatial precision (`exact`, `street_segment`, `neighborhood`, `approximate`, `unknown`);
- conservative event/issue classification, concise neutral paraphrase, supporting source passage/reference, explicit uncertainty, and status as reported by the source (not SAP verification/moderation status);
- duplicate-cluster ID, reviewer decision/reason, review date, inclusion state, attribution text, and visible historical-demo label.

Use null/unknown rather than guessing. Paraphrase rather than copying article text or images unless license permits; citation/provenance is not a reuse license. Do not mark an event resolved because cleanup is mentioned unless the source explicitly establishes resolution and its date.

### Research workflow for building a larger seed candidate set

1. Search within the intended **Kota Malang** boundary by event type and locality; prioritize primary/official sources for confirmation and use news coverage as candidate discovery, not automatic truth.
2. Capture publication date separately from any explicitly stated event date/window. Record exact source passage and uncertainty; no fabricated backdating.
3. Establish one row per independently evidenced event. Cluster multiple articles about the same site/time or a recurring facility/service problem; keep long-running issues in a separate contextual layer, not as repeated daily incidents.
4. Verify administrative boundary and geocoding precision. Prefer an explicitly named road segment/intersection or source coordinate; if evidence identifies only a kelurahan, store that coarse geography or reject for point-based display—never place a precise-looking marker at a guessed centroid.
5. Check source reliability, corroboration, corrections, allegations vs established facts, privacy, image/text reuse rights, and whether the record still serves the demo. Keep a reviewer disposition and reject thin/ambiguous candidates.
6. Only after explicit product/contract approval, import historical records into a separate demo namespace/layer with attribution and a kill switch; do not alter live reports, status, age-window rules, or moderation audit history.

### Candidate-data acceptance gates

- Every candidate has a retrievable source, reuse basis, publication/event-time distinction, reviewer decision, and explicit Kota Malang boundary check.
- Independent events are distinguished from duplicate coverage, recurring sites, service issues, cleanups, and facilities; unsupported time/location/status remains null or is rejected.
- Historical records are visually and contractually separated from citizen reports and verified live map aggregates; historical count does not imply SAP or government verification.
- No record enters a public demo layer until citation, attribution, privacy, source accuracy, and removal/rollback behavior are reviewed.

### Existing official-data leads (not yet approved for import)

- [Satu Data Kota Malang — TPS Penanggungan](https://data.malangkota.go.id/dataset/data-lokasi-tps-di-kelurahan-penanggungan): dataset description identifies these as polling stations for Pemilu 2024, not waste incidents; exclude from report imports.
- [SAMBAT Online](https://sambat.malangkota.go.id/): official complaints channel. Public site describes intake/routing, but this research did not find an open geolocated waste-incident export.
- [Eko Green launch coverage, 1 July 2025](https://malang.disway.id/malang-mbois/read/6207/dlh-kota-malang-luncurkan-aplikasi-eko-green-permudah-pengaduan-lingkungan-secara-digital): lead for asking DLH about authorized data; article is not itself an incident dataset or evidence of SAP partnership/current API access.
- Satu Data facility statistics/documentation (e.g., TPS/TPST/TPA totals, gerobak/komposter) may help context but are not report events.

### Data publication pipeline (authorized live records only)

1. Receive authorized sample and retain source/licensing metadata securely.
2. Map fields to SAP taxonomy/status without guessing; report incompatibilities to source owner.
3. Validate geometry/time/coverage and scan for personal data; preserve raw source in restricted staging only when permitted.
4. Submit into a reviewed import path as private/unverified (or create normal submissions); preserve source ID/provenance and idempotency to prevent duplicates.
5. Authorized moderator verifies each canonical incident, evidence, public summary and safe derivative using standard audit workflow. Never import a source status as SAP moderator action without an approved signed/traceable process.
6. Reconcile counts, duplicates, H3 generated server-side, privacy and rollback before public release.
7. Publish only verified eligible live records with method/date/asOf/no-data explanation and an attribution/limitations statement consistent with license.

### Live-data acceptance gates

- Written permission/license and source provenance confirmed for every data batch.
- Actual incident point and date supported by source; coordinate and date quality checks pass.
- No facility/aggregate/context records masquerade as incidents.
- Duplicates, city-boundary issues, age window, missing evidence and statuses reviewed by an authorized moderator.
- Public projections pass privacy review; originals remain private; H3 is computed by SAP server/library.
- Sample import can be rolled back and is idempotent; audit trail and attribution survive.
- If no suitable data is available, ship Malang-centered map with honest empty state rather than seeding fictional reports.

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

### Concrete React 19 / Next.js 16 patterns (verify against installed docs before coding)

The web app is React 19 + Next.js 16 (App Router, Turbopack). `apps/web/AGENTS.md` warns this Next.js has breaking changes from training priors — **read `node_modules/next/dist/docs/` for the installed version before writing any loading code.** The patterns below are the research-backed direction, not a license to skip that check.

- **Login submit pending state.** If the login uses a form action, a child button component can call React 19 `useFormStatus()` to read `pending` (must be rendered *inside* the `<form>`, not the same component that renders it). If login is a plain client handler, use `useActionState` (server action) or a local `useTransition().isPending` / `useState` busy flag. Disable the submit button while pending to prevent duplicate submits, and swap its label to an accessible busy state.
- **Redirect / navigation feedback.** For slow-network click feedback on a `next/link`, React's `useLinkStatus()` exposes a `pending` state (debounce ~100 ms so fast navigations don't flash). For the post-login redirect, render the branded transitional shell with a real `role="status"` "Menyiapkan dashboard…" message rather than a bare logo.
- **Route-segment fallback.** A `loading.tsx` in a route segment is an automatic Suspense boundary shown during navigation to that segment. **Gotcha:** a layout that reads `cookies()`/`headers()` or does an uncached `fetch` blocks the segment's `loading.js` from showing — move that work into the page or a nested `<Suspense>` so the fallback can render. `loading.tsx` does NOT replace client-side submit/fetch state; it only covers server navigation.
- **Skeletons vs spinners.** Skeleton screens for the dashboard shell are perceived ~20–30% faster than a spinner and avoid layout shift; use them for the dashboard bootstrap. Reserve indeterminate spinners for short unknown-duration waits.
- **Timing thresholds.** Under ~100–300 ms show nothing (a flash is worse than nothing). Once an indicator is shown, keep it up a ~600 ms minimum to avoid flicker. Apply this to both the login button and the redirect shell.
- **Accessibility.** Announce status with `role="status"` (polite live region); mark purely-visual spinner elements `aria-hidden`; set `aria-busy` on the container being populated and clear it on both success and failure. Honor `prefers-reduced-motion: reduce` — disable nonessential motion, keep the text status.

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

### Phase 4 — SAPA hybrid retrieval baseline, then LangGraph read-only tool pilot

- Build the curated source registry and **hybrid cited-answer baseline** — PostgreSQL `pgvector` (HNSW) + full-text fused with RRF, with the **Indonesian stop-word list installed day one** — measured against the Indonesian eval set (Recall@k/MRR/nDCG, groundedness, citation-F1) with a tuned answerable/unanswerable threshold; keep FAQ-only behavior available as fallback.
- Spike LangGraph `create_agent` for gateway compatibility/cost/latency; then stand up the LangGraph graph + tool registry and implement **one** bounded, account-scoped read-only tool behind a flag, only after the structural-safety policy, per-hop guardrails (audit-mode first), `recursion_limit`/token budget, and test suite exist. Expand from the ~8-tool catalog only on measured user value.

**Gate:** retrieval Recall@k/MRR/nDCG and groundedness/abstention results meet the agreed threshold; LangGraph runtime honors Redis ownership/TTL; tool authz/privacy/injection/recursion-budget tests pass; FAQ-only fallback remains; operations can disable the feature (including retrieval and the agent runtime).

### Phase 5 — Authorized data pilot

- Validate small authorized data batch, moderation, dedup, map projection, attribution and rollback. Expand only after pilot quality review.

**Gate:** data provenance/permission and moderation/publication acceptance all pass.

Phases can be scheduled in parallel only when dependencies and contract ownership are clear. Never accelerate by skipping data authorization, auth recovery, privacy review, or contract gates.

## 16. Non-goals

- Fabricating or bulk-generating real-looking Malang incidents to make the map visually busy.
- Backdating historical events, substituting publication dates for event dates, or pushing old sourced records through the live create-report/moderation pipeline to appear verified.
- Treating TPS Pemilu locations, waste facilities, tonnage totals, news coverage, or municipal statistics as incident reports.
- Giving SAPA open-ended internet, database, shell, admin, account mutation, moderation, or autonomous report submission tools.
- Adopting a heavy agent framework for its own sake, or wiring web-search/reranker/write-capable tools into SAPA's first release. LangGraph is adopted deliberately as the read-only agent runtime (pinned, with `recursion_limit` + token budget), not to "claim an agent feature."
- Collecting date of birth without need; shipping passkeys before RP ID/recovery design; exposing user media publicly by default.
- Displaying fake progress percentages, claiming agency response without proof, or interpreting an empty map as a clean area.

## 17. Open decisions to resolve before implementation

| Decision | Recommended default | Owner/needed evidence |
| --- | --- | --- |
| SAPA grounding behavior and provider-failure fallback | Approved FAQ only; deterministic Help fallback when grounding/provider is insufficient | Product owner + tests against current prompt/provider |
| SAPA first tool | One minimal account-owned status/aggregate tool behind server feature flag | Product value, existing service purity, data projection review |
| SAPA retrieval baseline | **Decided (reversed from earlier baseline):** hybrid retrieval — PostgreSQL `pgvector` (HNSW) dense search + `tsvector` full-text, fused with RRF (k≈60, dense-weighted ~0.6/0.4), cited passages, answerable/unanswerable threshold. **Day-one gate:** install the Indonesian Snowball stop-word list (the built-in `indonesian` FTS config ships none) before measuring. | Indonesian eval set (Recall@k/MRR/nDCG, groundedness, citation-F1), embedding-model choice (`bge-m3`/`multilingual-e5`/Cohere v3, or `text-embedding-3-*` via gateway), operational cost |
| SAPA citation UI | **Decided:** surface compact, structured citation cards in the UI. First implementation slice is contract-first — OpenAPI + fixtures + regenerated web types before backend retrieval/projection and the accessible citation card component. Even though the neutral retrieval-baseline ordering above lists server-only cited passages first, the first slice ships the UI cards alongside the retrieval backend. | Contract change, source-URL safety validation, UX/a11y review |
| Historical demo layer | Separate, labeled historical-source namespace with its own range rules and kill switch; never mixed into live verified cells | Product/contract approval, boundary policy, attribution and rollback review |
| LangGraph agent runtime | **Decided (reversed from earlier "do not adopt"):** adopt LangGraph 1.x (`create_agent`) as SAPA's read-only agent runtime; keep the OpenAI-compatible gateway via `ChatOpenAI` + `configuration.baseURL` (set `streamUsage:false` if the gateway rejects `stream_options`). Pin versions, set `recursion_limit` + a token budget to cap runaway-loop cost, and honor Redis conversation ownership/TTL in any checkpointer. Vanilla LangChain chains (now `langchain-classic`) and web-search/reranker tools stay out of the first release. | Gateway compatibility spike, framework overhead (~200–400 ms/call) vs value, maintenance and cost comparison |
| DOB/age | Do not collect until a concrete feature/legal purpose is documented | Product/legal requirement and retention policy |
| MFA availability | Optional TOTP for users; admin MFA required before privileged production use if recovery support is ready | Operational support, encryption/key management, recovery SOP |
| Avatar public visibility | Private/authenticated rendering until product explicitly chooses public visibility | Privacy/security review and serving design |
| Password change session behavior | Revoke other sessions, rotate current, notify verified email | Session implementation/security test |
| Malang report source | Ask DLH/Eko Green and SAMBAT data owners for authorized sanitized sample | Written permission, license, schema, evidence/coverage |
| Imported report verification | Normal SAP moderator review unless source authority and auditable import procedure explicitly approved | Content operations owner and audit policy |
| Map boundary validation | Malang-centered viewport first; server-side service-area validation policy requires product confirmation | Desired geography and official boundary source |

## 18. Research references

**SAPA — retrieval (RAG):**
- PostgreSQL full-text search: https://www.postgresql.org/docs/current/textsearch-intro.html
- PostgreSQL `pg_trgm` extension (fuzzy/typo matching): https://www.postgresql.org/docs/current/pgtrgm.html
- pgvector (dense vector search + HNSW): https://github.com/pgvector/pgvector
- Reciprocal Rank Fusion (hybrid dense+lexical): https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- Indonesian text search / Snowball stop words (the built-in `indonesian` config ships none): https://www.postgresql.org/docs/current/textsearch-dictionaries.html
- BGE-M3 multilingual embeddings: https://huggingface.co/BAAI/bge-m3
- Ragas evaluation datasets: https://docs.ragas.io/en/stable/concepts/components/eval_dataset/
- NVIDIA RAG metrics overview: https://docs.nvidia.com/nemo/microservices/26.3.0/evaluator/metrics/rag.html

**SAPA — LangGraph agent runtime:**
- LangChain/LangGraph 1.0 release: https://blog.langchain.com/langchain-langgraph-1dot0/
- LangChain `create_agent` (JS): https://docs.langchain.com/oss/javascript/langchain/agents
- LangChain JS tools/runtime context: https://docs.langchain.com/oss/javascript/langchain/tools
- LangChain JS human-in-the-loop: https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop
- LangGraph checkpointers: https://docs.langchain.com/oss/javascript/langgraph/checkpointing

**Account security (password / MFA / avatar / DOB):**
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet (Argon2id parameters): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- `argon2` npm: https://www.npmjs.com/package/argon2
- Have I Been Pwned — Pwned Passwords (k-anonymity range API): https://haveibeenpwned.com/API/v3#PwnedPasswords
- OWASP Multifactor Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- `otplib` (TOTP): https://github.com/yeojz/otplib
- RFC 6238 (TOTP): https://datatracker.ietf.org/doc/html/rfc6238
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- `file-type` (magic-byte detection): https://www.npmjs.com/package/file-type
- `sharp` (re-encode/resize, strips EXIF/GPS): https://sharp.pixelplumbing.com/
- W3C Web Authentication Level 3 (passkeys, phase 2): https://www.w3.org/TR/webauthn-3/
- UU No. 27/2022 Pelindungan Data Pribadi (PDP Law): https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022
- PP No. 17/2025 (PDP implementing regulation, child data): https://peraturan.bpk.go.id/Details/318014

**Login / loading UX (React 19 / Next.js 16 — verify against installed docs):**
- Next.js loading convention (`loading.js`): https://nextjs.org/docs/app/api-reference/file-conventions/loading
- React `useFormStatus`: https://react.dev/reference/react-dom/hooks/useFormStatus
- React `useActionState`: https://react.dev/reference/react/useActionState
- React `useTransition`: https://react.dev/reference/react/useTransition
- React `useLinkStatus`: https://react.dev/reference/react-dom/hooks/useLinkStatus
- WAI-ARIA `role="status"` / live regions: https://www.w3.org/WAI/ARIA/apg/patterns/alert/

**Map — Malang data sources (facility/context and boundary/geocoding aids only):**
- BIG (Badan Informasi Geospasial) geoservices: https://geoservices.big.go.id/
- SIPSN — Sistem Informasi Pengelolaan Sampah Nasional (KLH): https://sampahnasional.kemenlh.go.id/
- Satu Data Kota Malang: https://data.malangkota.go.id/
- BPS Kota Malang: https://malangkota.bps.go.id/
- OpenStreetMap Overpass API (waste amenities; © OSM contributors, ODbL): https://overpass-api.de/
- Nominatim geocoding usage policy (1 req/s): https://operations.osmfoundation.org/policies/nominatim/
- Satu Data Kota Malang — TPS Penanggungan (Pemilu polling stations, NOT waste): https://data.malangkota.go.id/dataset/data-lokasi-tps-di-kelurahan-penanggungan
- SAMBAT Online Kota Malang: https://sambat.malangkota.go.id/
- Eko Green launch coverage (1 July 2025; research lead, not authoritative dataset access): https://malang.disway.id/malang-mbois/read/6207/dlh-kota-malang-luncurkan-aplikasi-eko-green-permudah-pengaduan-lingkungan-secara-digital

Candidate historical-source leads (unverified, for human review only; see Part C section 11):

- MalangTIMES — Jatimulyo waste fire (16 Sep 2026 publication): https://madura.jatimtimes.com/baca/3331350404/20260916/044000/tumpukan-sampah-di-jatimulyo-malang-terbakar-area-750-meter-persegi-hangus
- MalangTIMES — Muharto roadside pile / TPS issue (2 Jul 2026): https://malangtimes.com/baca/3331346365/20260702/111200/imbauan-dilarang-buang-sampah-tak-digubris-sampah-justru-menumpuk-di-muharto
- MalangTIMES — Muharto enforcement (10 Sep 2026): https://malang.jatimtimes.com/baca/3331350056/20260910/092000/masih-bandel-buang-sampah-di-muharto-tipiring-menanti-5-orang-sudah-ditindak
- JatimTIMES — RW 5 Jatimulyo collection/sorting complaint (14 Apr 2026): https://bondowoso.jatimtimes.com/baca/3331341805/20260414/122500/sampah-menumpuk-di-jatimulyo-warga-rw-5-bongkar-dugaan-pungli-di-tps
- Pemkot Malang — DLH prepares Muharto TPS relocation (6 Jul 2026): https://malangkota.go.id/2026/07/06/dlh-siapkan-relokasi-tps-muharto/
- Malang Posco Media — difficulty finding a Muharto TPS replacement site (undated in this review): https://malangposcomedia.id/dlh-kesulitan-cari-alternatif-lahan-pengganti-tps-liar-muharto/
- Info Nasional — Muharto pile coverage (published 28 Jan 2026): https://www.infonasional.com/tumpukan-sampah-muharto-malang
- City Guide FM — Lowokdoro illegal waste/burning complaints (11 Jul 2026): https://cityguide911fm.com/sampah-liar-masih-bayangi-wisata-gantangan-burung-lowokdoro/
- BatasMedia99 — Jodipan pile viral report (26 Mar 2026, third-party/unconfirmed): https://mail.batasmedia99.com/berita/batasmedia99news/viral-sampah-gunung-di-jodipan-malang-diduga-sejak-h-2-lebaran-tak-diangkut/
- Pemkot Malang — GASS cleanup activity at several named locations (7 Dec 2025): https://kecklojen.malangkota.go.id/2025/12/08/minimalisir-daerah-rawan-banjir-wali-kota-malang-ajak-giatkan-kerja-bakti/

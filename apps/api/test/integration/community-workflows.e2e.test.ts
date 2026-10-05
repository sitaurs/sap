import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import postgres from 'postgres';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

type ActorClient = { cookie: string; csrf: string };
type HttpResult = { status: number; data: any; error: any };

const demoDatabaseMode = process.env.SAP_E2E_ALLOW_DEMO_DATABASE === '1';
const databaseUrl = process.env.SAP_TEST_DATABASE_URL ?? (demoDatabaseMode ? process.env.DATABASE_URL : undefined);
const skipReason = databaseUrl ? false : 'Set SAP_TEST_DATABASE_URL or explicitly opt in with SAP_E2E_ALLOW_DEMO_DATABASE=1.';

test('community, volunteer, impact and report workflows persist correctly through HTTP + PostgreSQL', { skip: skipReason }, async (t) => {
  assert.ok(databaseUrl);
  const parsed = new URL(databaseUrl);
  if (demoDatabaseMode) {
    assert.equal(databaseUrl, process.env.DATABASE_URL, 'demo mode must use the explicitly configured deployment database');
  } else {
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname), 'E2E database must be loopback only');
    assert.match(decodeURIComponent(parsed.pathname), /_test$/, 'E2E database name must end in _test');
  }

  const hermesState: { mode: 'ok' | 'unavailable' } = { mode: 'ok' };
  let hermesRequests = 0;
  const hermes = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    hermesRequests += 1;
    if (hermesState.mode === 'unavailable') {
      res.writeHead(503).end('{"error":"test provider unavailable"}');
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as any;
    const evidence = body.snapshot.evidence as { mediaId: string }[];
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      result: {
        schemaVersion: 'sap-evidence-review-v1', subjectType: body.snapshot.subjectType,
        subjectId: body.snapshot.subjectId, subjectRevision: body.snapshot.subjectRevision,
        sourceReportId: body.snapshot.sourceReportId, sourceReportRevision: body.snapshot.sourceReportRevision,
        snapshotHash: body.snapshotHash, recommendation: 'human_review', reasonCodes: ['MORE_EVIDENCE_REQUIRED'],
        evidence: evidence.length ? [{ mediaId: evidence[0]!.mediaId, observation: 'Bukti perlu diperiksa moderator.' }] : [],
        duplicateCandidates: [], missingEvidence: ['Pemeriksaan moderator'], publicSummaryProposal: null, publicationWarnings: [],
      },
      usage: { inputTokens: 20, outputTokens: 15, costUsd: 0.001 },
    }));
  });
  await new Promise<void>((resolveListen) => hermes.listen(0, '127.0.0.1', resolveListen));
  const hermesPort = (hermes.address() as { port: number }).port;

  const environment: Record<string, string> = {
    NODE_ENV: 'test', LOG_LEVEL: 'fatal', PORT: '3001', APP_ORIGIN: 'http://localhost:3000',
    API_INTERNAL_URL: 'http://localhost:3001', CONTRACT_VERSION: '1.1.0', DATABASE_URL: databaseUrl,
    REDIS_URL: 'redis://127.0.0.1:6398', SESSION_SECRET: 'e2e-session-secret-that-is-at-least-32-bytes',
    CSRF_SECRET: 'e2e-csrf-secret-that-is-at-least-32-bytes', RESEND_API_KEY: 'test-api-key', MAIL_FROM: 'SAP <test@localhost>',
    S3_ENDPOINT: 'https://objects.invalid', S3_REGION: 'auto', S3_BUCKET: 'sap-test', S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret', ML_INFERENCE_URL: 'https://ml.invalid', ML_API_NAME: '/predict_gradio',
    ML_USERNAME: 'test-user', ML_PASSWORD: 'test-password', SAP_EXTENSION_ENABLED: 'true', SAP_COMMUNITY_ENABLED: 'true',
    SAP_ACTIVITIES_ENABLED: 'true', SAP_HERMES_ENABLED: 'true', HERMES_REVIEW_URL: `http://127.0.0.1:${hermesPort}`,
    HERMES_REVIEW_SECRET: 'test-hermes-secret-that-is-at-least-32-bytes', HERMES_MODEL_VERSION: 'test-model-v1',
    HERMES_POLICY_VERSION: 'test-policy-v1', HERMES_TIMEOUT_MS: '5000',
    HERMES_RUN_BUDGET_USD: '0.25', HERMES_DAILY_BUDGET_USD: '10000',
  };
  Object.assign(process.env, environment);

  let app: INestApplication | undefined;
  const sql = postgres(databaseUrl, { max: 10 });
  const testUserIds: string[] = [];
  // Demo mode leaves synthetic domain data in place, but prevents the live worker
  // from replaying this test's queued review/publication work after it is resumed.
  const suppressDemoBackgroundWork = async (): Promise<{ events: number; reviews: number }> => {
    if (!demoDatabaseMode || testUserIds.length === 0) return { events: 0, reviews: 0 };
    const superseded = await sql<{ id: string }[]>`
      WITH test_reports AS (
        SELECT id FROM reports WHERE reporter_id = ANY(${testUserIds}::uuid[])
      )
      UPDATE review_runs SET status='superseded',finished_at=COALESCE(finished_at,now()),lease_expires_at=NULL
      WHERE report_id IN (SELECT id FROM test_reports) AND status IN ('queued','running')
      RETURNING id`;
    const delivered = await sql<{ id: string }[]>`
      WITH test_reports AS (
        SELECT id FROM reports WHERE reporter_id = ANY(${testUserIds}::uuid[])
      ),
      test_activities AS (
        SELECT id FROM activities WHERE report_id IN (SELECT id FROM test_reports)
      ),
      owned_aggregates AS (
        SELECT id FROM test_reports
        UNION SELECT id FROM community_updates WHERE report_id IN (SELECT id FROM test_reports)
        UNION SELECT id FROM test_activities
        UNION SELECT id FROM activity_memberships WHERE activity_id IN (SELECT id FROM test_activities)
        UNION SELECT id FROM activity_results WHERE report_id IN (SELECT id FROM test_reports)
        UNION SELECT id FROM impact_measurements WHERE activity_id IN (SELECT id FROM test_activities)
        UNION SELECT id FROM review_runs WHERE report_id IN (SELECT id FROM test_reports)
      )
      UPDATE outbox_events SET state='delivered',lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=now()
      WHERE aggregate_id IN (SELECT id FROM owned_aggregates) AND state IN ('pending','processing')
      RETURNING id`;
    return { events: delivered.length, reviews: superseded.length };
  };
  try {
    const [{ migrate, loadMigrations }, { seedReference }, { AppModule }, { Test }, { DATABASE }, { ObjectStorageService }, { bootstrapHttpApp }, { getConfig }] = await Promise.all([
      import('../../src/infrastructure/migrator.js'), import('../../src/infrastructure/seed.js'), import('../../src/app.module.js'),
      import('@nestjs/testing'), import('../../src/infrastructure/database.module.js'), import('../../src/media/object-storage.service.js'),
      import('../../src/platform/http/bootstrap-http-app.js'), import('@sap/config'),
    ]);
    if (demoDatabaseMode) {
      const [migrations, applied] = await Promise.all([
        loadMigrations(),
        sql<{ version: string; checksum: string }[]>`SELECT version,checksum FROM schema_migrations`,
      ]);
      const checksums = new Map(applied.map((row) => [row.version, row.checksum]));
      for (const migration of migrations) {
        assert.equal(checksums.get(migration.version), migration.checksum,
          `demo DB migration ${migration.version} must already be applied with the current checksum; E2E never migrates it`);
      }
      const category = await sql<{ active: boolean }[]>`SELECT active FROM categories WHERE id='plastic'`;
      assert.equal(category[0]?.active, true, 'demo DB reference categories must already be seeded; E2E never seeds them');
    } else {
      await migrate(sql as never);
      await seedReference(sql as never);
    }
    const storage = {
      createSignedGetUrl: async (key: string) => ({ url: `https://objects.invalid/signed/${encodeURIComponent(key)}`, expiresAt: new Date(Date.now() + 60_000) }),
      getObject: async () => Buffer.from('e2e image bytes'),
      putObject: async () => undefined,
      deleteObject: async () => undefined,
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE).useValue(sql)
      .overrideProvider(ObjectStorageService).useValue(storage)
      .compile();
    app = module.createNestApplication();
    bootstrapHttpApp(app, getConfig(environment));
    await app.init();
    const server = app.getHttpServer();
    const sessionService = app.get((await import('../../src/session/session.service.js')).SessionService);

    const call = async (client: ActorClient, method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown,
      headers: Record<string, string> = {}, expected: number | number[] = 200): Promise<HttpResult> => {
      let req = request(server)[method](path).set(headers as never);
      if (method !== 'get') req = req.set('Origin', environment.APP_ORIGIN!).set('Cookie', client.cookie).set('X-CSRF-Token', client.csrf);
      else if (client.cookie) req = req.set('Cookie', client.cookie);
      if (body !== undefined && body !== null) req = req.send(body as object);
      const response = await req;
      assert.ok(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected,
        `${method.toUpperCase()} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(response.body)}`);
      return { status: response.status, data: response.body.data, error: response.body.error };
    };
    const makeUser = async (role: 'user' | 'admin', name: string, emailVerified = true): Promise<ActorClient> => {
      const id = randomUUID();
      testUserIds.push(id);
      await sql`INSERT INTO users(id,email_normalized,display_name,role,email_verified_at) VALUES(${id},${`${id}@e2e.invalid`},${name},${role},${emailVerified ? new Date() : null})`;
      const session = sessionService.createToken();
      await sql`INSERT INTO sessions(user_id,token_hash,expires_at,last_seen_at) VALUES(${id},${session.tokenHash},${session.expiresAt},now())`;
      const csrf = await request(server).get('/api/v1/auth/csrf').set('Cookie', `sap_session=${session.token}`).expect(200);
      const setCookies = csrf.headers['set-cookie'];
      const csrfCookie = (Array.isArray(setCookies) ? setCookies : [setCookies]).find((value) => value?.startsWith('sap_csrf='));
      assert.ok(csrfCookie);
      const token = csrf.body.data.csrfToken as string;
      return { cookie: `sap_session=${session.token}; ${csrfCookie.split(';')[0]}`, csrf: token };
    };
    const refreshCsrf = async (client: ActorClient): Promise<void> => {
      const sessionCookie = client.cookie.split(';', 1)[0]!;
      const response = await request(server).get('/api/v1/auth/csrf').set('Cookie', sessionCookie).expect(200);
      const setCookies = response.headers['set-cookie'];
      const csrfCookie = (Array.isArray(setCookies) ? setCookies : [setCookies]).find((value) => value?.startsWith('sap_csrf='));
      assert.ok(csrfCookie);
      client.csrf = response.body.data.csrfToken as string;
      client.cookie = `${sessionCookie}; ${csrfCookie.split(';')[0]}`;
    };
    const addMedia = async (ownerId: string, purpose: 'report' | 'community' | 'activity_evidence'): Promise<string> => {
      const id = randomUUID();
      await sql`INSERT INTO media(id,owner_id,purpose,object_key,mime,size_bytes,sha256,width,height,state)
        VALUES(${id},${ownerId},${purpose},${`private/${id}.jpg`},'image/jpeg',128,${id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64)},640,480,'stored')`;
      return id;
    };
    const addActor = async (role: 'user' | 'admin', name: string, emailVerified = true) => {
      const client = await makeUser(role, name, emailVerified);
      const row = await sql<{ id: string }[]>`SELECT id FROM users WHERE display_name=${name} ORDER BY created_at DESC LIMIT 1`;
      return { client, id: row[0]!.id };
    };
    const createReport = async (client: ActorClient, ownerId: string, description: string) => {
      const mediaId = await addMedia(ownerId, 'report');
      const response = await call(client, 'post', '/api/v1/reports', {
        mediaIds: [mediaId], description, location: { latitude: -6.2, longitude: 106.8 },
        occurredAt: new Date(Date.now() - 60 * 60_000).toISOString(), reportedSeverity: 'small', categoryId: 'plastic',
      }, { 'Idempotency-Key': randomUUID() }, 201);
      return { id: response.data.id as string, mediaId };
    };
    const decideReport = async (client: ActorClient, id: string, revision: number, nextStatus: string,
      extra: Record<string, unknown> = {}, expected = 200, idempotencyKey = randomUUID()) =>
      call(client, 'post', `/api/v1/admin/reports/${id}/decisions`, { nextStatus, reason: 'Ditinjau pada pengujian E2E.', ...extra },
        { 'If-Match': String(revision), 'Idempotency-Key': idempotencyKey }, expected);
    const readById = async (id: string) => {
      const rows = await sql<{ id: string; revision: number }[]>`SELECT id,revision FROM reports WHERE id=${id}`;
      return rows[0]!;
    };
    const createReviewProcessor = async (): Promise<{ process(event: unknown): Promise<void> }> => {
      const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../worker/dist/review-processor.js');
      const { ReviewProcessor } = await import(pathToFileURL(workerPath).href) as {
        ReviewProcessor: new (db: unknown, config: unknown, objects: unknown) => { process(event: unknown): Promise<void> };
      };
      const { getConfig } = await import('@sap/config');
      return new ReviewProcessor(sql, getConfig(environment), storage as never);
    };

    const reporter = await addActor('user', 'Reporter E2E');
    const reader = await addActor('user', 'Warga E2E');
    const coordinator = await addActor('user', 'Koordinator E2E');
    const secondCoordinator = await addActor('user', 'Koordinator Cadangan E2E');
    const memberOne = await addActor('user', 'Relawan Satu E2E');
    const memberTwo = await addActor('user', 'Relawan Dua E2E');
    const memberThree = await addActor('user', 'Relawan Tiga E2E');
    const admin = await addActor('admin', 'Admin E2E');

    await t.test('G-27, G-28, G-29, G-30 and G-47: report, support/follow, review, privacy, merge and points', async () => {
      const processor = await createReviewProcessor();
      const mapFrom = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const mapTo = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const mapPath = `/api/v1/areas?bbox=106.7,-6.3,106.9,-6.1&from=${encodeURIComponent(mapFrom)}&to=${encodeURIComponent(mapTo)}`;
      const mapBaseline = await call(reader.client, 'get', mapPath);
      const first = await createReport(reporter.client, reporter.id, 'Laporan pertama untuk pengujian komunitas dan dampak.');
      const second = await createReport(reporter.client, reporter.id, 'Laporan kedua untuk pengujian merge canonical.');
      await call(reporter.client, 'patch', `/api/v1/reports/${first.id}`, { description: 'Laporan pertama telah direvisi sebelum moderasi.' }, { 'If-Match': '1' });
      const reportReviewView = await call(admin.client, 'get', `/api/v1/admin/reports/${first.id}/lifecycle`);
      const reportRunId = reportReviewView.data.latestReview.id as string;
      await processor.process({ topic: 'review.requested', aggregate_id: reportRunId, payload_minimal: {} });
      const reviewedReport = await call(admin.client, 'get', `/api/v1/admin/reports/${first.id}/lifecycle`);
      assert.equal(reviewedReport.data.latestReview.status, 'completed');
      assert.equal(reviewedReport.data.latestReview.requiresHumanReview, true);
      assert.equal((await readById(first.id)).revision, 2, 'Hermes report recommendation does not change report revision');
      assert.equal((await sql<{ status: string }[]>`SELECT status FROM reports WHERE id=${first.id}`)[0]!.status, 'submitted',
        'Hermes report recommendation does not make a moderation decision');
      const verificationKey = randomUUID();
      await decideReport(admin.client, first.id, 2, 'verified', { publicSummary: 'Kejadian pertama sedang ditinjau SAP.' }, 200, verificationKey);
      const afterFirstVerify = (await readById(first.id)).revision;
      const reporterPointsAfterVerify = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reporter.id}`;
      const replayedVerify = await decideReport(admin.client, first.id, 2, 'verified', { publicSummary: 'Kejadian pertama sedang ditinjau SAP.' }, 200, verificationKey);
      assert.equal(replayedVerify.data.revision, afterFirstVerify, 'decision retry replays the stored response without another revision');
      const reporterPointsAfterReplay = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reporter.id}`;
      assert.equal(reporterPointsAfterReplay[0]!.points, reporterPointsAfterVerify[0]!.points, 'decision replay does not duplicate point awards');
      await decideReport(admin.client, second.id, 1, 'verified', { publicSummary: 'Kejadian kedua sedang ditinjau SAP.' });
      const mapBeforeSupport = await call(reader.client, 'get', mapPath);

      const beforeSupport = await sql<{ revision: number }[]>`SELECT revision FROM reports WHERE id=${first.id}`;
      const ledgerBefore = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reader.id}`;
      const initial = await call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true });
      const repeated = await call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true });
      assert.equal(initial.data.supportCount, 1);
      assert.equal(repeated.data.supportCount, 1, 'desired-state retry must not create a second support');
      const concurrentSupport = await Promise.all([
        call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true }),
        call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true }),
      ]);
      assert.deepEqual(concurrentSupport.map((response) => response.data.supportCount), [1, 1],
        'concurrent desired-state support is still one unique relationship');
      const mapAfterSupport = await call(reader.client, 'get', mapPath);
      assert.deepEqual(mapAfterSupport.data.features, mapBeforeSupport.data.features,
        'support/follow signals do not change map risk or incident aggregates');
      const afterSupport = await sql<{ revision: number }[]>`SELECT revision FROM reports WHERE id=${first.id}`;
      const ledgerAfterSupport = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reader.id}`;
      assert.equal(afterSupport[0]!.revision, beforeSupport[0]!.revision, 'support does not bump report revision');
      assert.equal(ledgerAfterSupport[0]!.points, ledgerBefore[0]!.points, 'support awards no points');
      const unverified = await addActor('user', 'Warga Belum Verifikasi E2E', false);
      const supportDenied = await call(unverified.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true }, {}, 403);
      assert.equal(supportDenied.error.code, 'EMAIL_NOT_VERIFIED');
      const quotaSupporter = await addActor('user', 'Warga Kuota E2E');
      for (let i = 0; i < 60; i += 1) {
        await call(quotaSupporter.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true });
      }
      const supportRateLimited = await call(quotaSupporter.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: true }, {}, 429);
      assert.equal(supportRateLimited.error.code, 'RATE_LIMITED', 'support has a transactional per-account abuse limit');
      await call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/follow`, { following: true });
      await call(reader.client, 'put', `/api/v1/public/incidents/${second.id}/follow`, { following: true });
      await call(memberOne.client, 'put', `/api/v1/public/incidents/${second.id}/support`, { supported: true });
      const supportRevoker = await addActor('user', 'Warga Cabut Dukungan E2E');
      await call(supportRevoker.client, 'put', `/api/v1/public/incidents/${second.id}/support`, { supported: true });
      const supportRevoked = await call(supportRevoker.client, 'put', `/api/v1/public/incidents/${second.id}/support`, { supported: false });
      assert.equal(supportRevoked.data.supported, false, 'an active supporter can revoke support while the incident is open');
      await call(reader.client, 'put', `/api/v1/public/incidents/${second.id}/support`, { supported: true });
       const unfollow = await call(memberOne.client, 'put', `/api/v1/public/incidents/${second.id}/follow`, { following: false });
       assert.equal(unfollow.data.following, false);
       await call(reader.client, 'put', `/api/v1/public/incidents/${second.id}/follow`, { following: true });
       await call(memberTwo.client, 'put', `/api/v1/public/incidents/${second.id}/follow`, { following: true });
       const [mergeWithUnfollow, unfollowDuringMerge] = await Promise.all([
         decideReport(admin.client, second.id, 2, 'duplicate', { duplicateOfId: first.id }),
         call(memberTwo.client, 'put', `/api/v1/public/incidents/${second.id}/follow`, { following: false }),
       ]);
       assert.equal(mergeWithUnfollow.status, 200);
       assert.equal(unfollowDuringMerge.data.following, false);
       const noLongerFollowed = await call(memberTwo.client, 'get', '/api/v1/users/me/followed-incidents');
       assert.equal(noLongerFollowed.data.items.some((item: any) => item.incidentId === first.id), false,
         'unfollow racing canonical merge must not resurrect the follower on the target');
       const redirected = await call(reader.client, 'get', `/api/v1/public/incidents/${second.id}`);
      assert.equal(redirected.data.kind, 'redirect');
      assert.equal(redirected.data.canonicalId, first.id);
      const canonical = await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}`);
      assert.equal(canonical.data.supportCount, 3, 'supporters from duplicate merge as a unique set');
      assert.doesNotMatch(JSON.stringify(canonical.data), /"latitude"|"longitude"|"location"|106\.8|-6\.2/,
        'public incident details never expose the report exact coordinates');
      const followed = await call(reader.client, 'get', '/api/v1/users/me/followed-incidents');
      assert.equal(followed.data.items.filter((item: any) => item.incidentId === first.id).length, 1);
      const pointBalance = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reporter.id}`;
      assert.equal(pointBalance[0]!.points, '20', 'verify twice then duplicate reversal leaves exactly one canonical award');
      const awardRows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM point_ledger WHERE user_id=${reporter.id} AND source_type IN ('report','report_reversal')`;
      assert.equal(awardRows[0]!.count, '3', 'two awards and one compensating reversal are append-only');

      const mediaId = await addMedia(reader.id, 'community');
      const observedClean = new Date(Date.now() - 120_000).toISOString();
      const createUpdate = (kind: string, observedAt: string, mediaIds: string[], description: string, expected = 201) => call(reader.client, 'post',
        `/api/v1/public/incidents/${first.id}/updates`, { kind, observedAt, description, mediaIds, correctionField: null },
        { 'Idempotency-Key': randomUUID() }, expected);
      const pending = await createUpdate('looks_clean', observedClean, [mediaId], 'Kondisi tampak bersih setelah pengamatan.');
      const updateId = pending.data.id as string;
      const otherCannotRead = await call(memberTwo.client, 'get', `/api/v1/community-updates/${updateId}`, undefined, {}, 404);
      assert.equal(otherCannotRead.error.code, 'NOT_FOUND');
      const visibleBeforeApproval = await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}/timeline`);
      assert.equal(visibleBeforeApproval.data.items.some((event: any) => event.summary.includes('Kondisi tampak bersih')), false,
        'pending update must not enter the public timeline');
      const duplicatePending = await createUpdate('looks_clean', observedClean, [], 'Pembaruan pending duplikat untuk tes.', 409);
      assert.equal(duplicatePending.error.code, 'PENDING_UPDATE_EXISTS');
      const adminPending = await call(admin.client, 'get', `/api/v1/admin/community-updates/${updateId}`);
      const staleRunId = adminPending.data.latestReview.id as string;
      await call(reader.client, 'patch', `/api/v1/community-updates/${updateId}`,
        { kind: 'looks_clean', observedAt: observedClean, description: 'Pembaruan direvisi; bukti foto masih terlampir.', mediaIds: [mediaId], correctionField: null },
        { 'If-Match': '1' });
      const revised = await call(admin.client, 'get', `/api/v1/admin/community-updates/${updateId}`);
      const currentRunId = revised.data.latestReview.id as string;
      assert.notEqual(currentRunId, staleRunId, 'editing creates a revision-bound review run');

      await processor.process({ topic: 'review.requested', aggregate_id: staleRunId, payload_minimal: {} });
      const stale = await sql<{ status: string }[]>`SELECT status FROM review_runs WHERE id=${staleRunId}`;
      assert.equal(stale[0]!.status, 'superseded', 'late Hermes result for an old snapshot is fenced');
      await processor.process({ topic: 'review.requested', aggregate_id: currentRunId, payload_minimal: {} });
      assert.ok(hermesRequests > 0, 'review worker called the isolated Hermes HTTP fixture');
      const completed = await call(admin.client, 'get', `/api/v1/admin/community-updates/${updateId}`);
      assert.equal(completed.data.latestReview.status, 'completed');
      assert.equal(completed.data.latestReview.requiresHumanReview, true);
      assert.equal(completed.data.status, 'submitted', 'AI completion does not approve the user contribution');
      const requestEvidence = await call(admin.client, 'post', `/api/v1/admin/community-updates/${updateId}/decisions`, {
        action: 'request_evidence', reason: 'Mohon tegaskan kembali kondisi yang diamati.', publicSummary: null,
        publicEvidenceApprovals: [], requestedEvidence: ['Sertakan deskripsi yang menjelaskan titik pengamatan.'],
      }, { 'If-Match': '2', 'Idempotency-Key': randomUUID() });
      assert.equal(requestEvidence.data.status, 'needs_evidence');
      const afterEvidenceRequest = await call(reader.client, 'patch', `/api/v1/community-updates/${updateId}`,
        { kind: 'looks_clean', observedAt: observedClean, description: 'Pengamatan direvisi dengan detail kondisi dan titik yang sudah dibersihkan.', mediaIds: [mediaId], correctionField: null },
        { 'If-Match': '3' });
      assert.equal(afterEvidenceRequest.data.revision, 4);
      const afterEvidenceReview = await call(admin.client, 'get', `/api/v1/admin/community-updates/${updateId}`);
      const postEvidenceRunId = afterEvidenceReview.data.latestReview.id as string;
      assert.notEqual(postEvidenceRunId, currentRunId, 'supplemental evidence creates a fresh snapshot review');
      await processor.process({ topic: 'review.requested', aggregate_id: postEvidenceRunId, payload_minimal: {} });
      assert.equal((await call(admin.client, 'get', `/api/v1/admin/community-updates/${updateId}`)).data.latestReview.status, 'completed');

      const publicRendition = randomUUID();
      await sql`INSERT INTO media_consents(media_id,channels) VALUES(${mediaId},ARRAY['web']::text[])`;
      await sql`INSERT INTO evidence_renditions(id,media_id,subject_type,subject_id,status,object_key)
        VALUES(${publicRendition},${mediaId},'community_update',${updateId},'ready',${`public/${publicRendition}.jpg`})`;
      const approved = await call(admin.client, 'post', `/api/v1/admin/community-updates/${updateId}/decisions`, {
        action: 'approve', reason: 'Bukti ditinjau moderator.', publicSummary: 'Pembaruan warga: kondisi tampak bersih.',
        publicEvidenceApprovals: [{ mediaId, renditionId: publicRendition, channels: ['web'] }], requestedEvidence: [],
      }, { 'If-Match': '4', 'Idempotency-Key': randomUUID() });
      assert.equal(approved.data.status, 'approved');
      const publicTimeline = await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}/timeline`);
      const publicEvent = publicTimeline.data.items.find((event: any) => event.summary === 'Pembaruan warga: kondisi tampak bersih.');
      assert.ok(publicEvent, 'approved update appears in public timeline');
      assert.match(publicEvent.evidence[0].url, /public%2F/);
      assert.doesNotMatch(JSON.stringify(publicTimeline.data), new RegExp(`private/${mediaId}`));
      assert.doesNotMatch(JSON.stringify(publicTimeline.data), /"latitude"|"longitude"|"location"|106\.8|-6\.2/,
        'public timeline never exposes the report exact coordinates');
      assert.equal((await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}`)).data.status, 'verified',
        'approving an update does not decide the incident status');
      assert.equal((await sql<{ status: string }[]>`SELECT status FROM review_runs WHERE id=${currentRunId}`)[0]!.status, 'superseded',
        'human decision supersedes the assistant recommendation');

      const claim = (await sql<{ id: string; status: string }[]>`SELECT id,status FROM approved_resolution_evidence WHERE source_id=${updateId} AND source_type='community_update'`)[0]!;
      assert.equal(claim.status, 'valid');
      const laterUpdate = await createUpdate('still_present', new Date(Date.parse(observedClean) + 60_000).toISOString(), [], 'Sampah masih terlihat pada bagian lain.');
      const laterId = laterUpdate.data.id as string;
      await call(admin.client, 'post', `/api/v1/admin/community-updates/${laterId}/decisions`, {
        action: 'approve', reason: 'Pengamatan lebih baru ditinjau.', publicSummary: 'Pembaruan: sebagian sampah masih terlihat.',
        publicEvidenceApprovals: [], requestedEvidence: [],
      }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      assert.equal((await sql<{ status: string }[]>`SELECT status FROM approved_resolution_evidence WHERE id=${claim.id}`)[0]!.status, 'revoked',
        'newer condition evidence revokes an obsolete resolution claim');
      const currentRevision = (await readById(first.id)).revision;
      const staleResolution = await decideReport(admin.client, first.id, currentRevision, 'resolved', { resolutionEvidenceIds: [claim.id] }, 422);
      assert.equal(staleResolution.error.code, 'REPORT_INVALID', 'revoked evidence cannot resolve an incident');
      const freshMedia = await addMedia(reader.id, 'community');
      const freshObserved = new Date(Date.parse(observedClean) + 120_000).toISOString();
      const fresh = await createUpdate('looks_clean', freshObserved, [freshMedia], 'Pembersihan selesai pada titik yang dilaporkan.');
      const freshId = fresh.data.id as string;
      const freshRendition = randomUUID();
      await sql`INSERT INTO media_consents(media_id,channels) VALUES(${freshMedia},ARRAY['web']::text[])`;
      await sql`INSERT INTO evidence_renditions(id,media_id,subject_type,subject_id,status,object_key)
        VALUES(${freshRendition},${freshMedia},'community_update',${freshId},'ready',${`public/${freshRendition}.jpg`})`;
      const freshReview = await call(admin.client, 'get', `/api/v1/admin/community-updates/${freshId}`);
      const failedRunId = freshReview.data.latestReview.id as string;
      hermesState.mode = 'unavailable';
      await processor.process({ topic: 'review.requested', aggregate_id: failedRunId, payload_minimal: {} });
      const failedRun = await sql<{ status: string; error_code: string }[]>`SELECT status,error_code FROM review_runs WHERE id=${failedRunId}`;
      assert.equal(failedRun[0]!.status, 'failed');
      assert.equal(failedRun[0]!.error_code, 'HERMES_UNAVAILABLE');
      assert.equal((await call(admin.client, 'get', `/api/v1/admin/community-updates/${freshId}`)).data.status, 'submitted',
        'provider outage neither publishes nor blocks a manual moderator decision');
      hermesState.mode = 'ok';
      await call(admin.client, 'post', `/api/v1/admin/community-updates/${freshId}/decisions`, {
        action: 'approve', reason: 'Bukti baru ditinjau moderator.', publicSummary: 'Pembersihan selesai pada titik yang dilaporkan.',
        publicEvidenceApprovals: [{ mediaId: freshMedia, renditionId: freshRendition, channels: ['web'] }], requestedEvidence: [],
      }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      const freshClaim = (await sql<{ id: string }[]>`SELECT id FROM approved_resolution_evidence WHERE source_id=${freshId} AND status='valid'`)[0]!;
       const beforeResolve = (await readById(first.id)).revision;
       const resolved = await decideReport(admin.client, first.id, beforeResolve, 'resolved', { resolutionEvidenceIds: [freshClaim.id] });
       assert.equal(resolved.data.status, 'resolved', 'explicit report decision can consume an approved, current evidence claim');
       assert.equal((await call(admin.client, 'get', `/api/v1/admin/reports/${first.id}/lifecycle`)).data.resolutionReviewRequired, false);
       await call(reader.client, 'put', `/api/v1/media/${freshMedia}/consents`, { channels: [] }, { 'If-Match': '1' });
       assert.equal((await call(admin.client, 'get', `/api/v1/admin/reports/${first.id}/lifecycle`)).data.resolutionReviewRequired, true,
         'revoking evidence used by the resolved decision flags it for human review');
       const resolutionReviewQueue = await call(admin.client, 'get', '/api/v1/admin/review-queue?type=report');
       assert.ok(resolutionReviewQueue.data.items.some((item: any) => item.reportId === first.id && item.title === 'Resolusi perlu ditinjau'),
         'an invalidated resolved decision is surfaced in the moderator queue');
       const closedSupport = await call(reader.client, 'put', `/api/v1/public/incidents/${first.id}/support`, { supported: false }, {}, 409);
      assert.equal(closedSupport.error.code, 'SUPPORT_CLOSED');
      const correctionMedia = await addMedia(reader.id, 'community');
      const correction = await call(reader.client, 'post', `/api/v1/public/incidents/${first.id}/updates`, {
        kind: 'information_wrong', observedAt: new Date(Date.now() - 60_000).toISOString(),
        description: 'Koreksi kategori kejadian yang tertera sebelumnya.', mediaIds: [correctionMedia], correctionField: 'category',
      }, { 'Idempotency-Key': randomUUID() }, 201);
      const correctionId = correction.data.id as string;
      const correctionRendition = randomUUID();
      await sql`INSERT INTO media_consents(media_id,channels) VALUES(${correctionMedia},ARRAY['web']::text[])`;
      await sql`INSERT INTO evidence_renditions(id,media_id,subject_type,subject_id,status,object_key)
        VALUES(${correctionRendition},${correctionMedia},'community_update',${correctionId},'ready',${`public/${correctionRendition}.jpg`})`;
      const correctionReview = await call(admin.client, 'get', `/api/v1/admin/community-updates/${correctionId}`);
      await processor.process({ topic: 'review.requested', aggregate_id: correctionReview.data.latestReview.id, payload_minimal: {} });
      const correctionApproved = await call(admin.client, 'post', `/api/v1/admin/community-updates/${correctionId}/decisions`, {
        action: 'approve', reason: 'Koreksi kategori dikonfirmasi moderator.', publicSummary: 'Koreksi: kategori kejadian telah diperbarui.',
        publicEvidenceApprovals: [{ mediaId: correctionMedia, renditionId: correctionRendition, channels: ['web'] }], requestedEvidence: [],
      }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      assert.equal(correctionApproved.data.correctionField, 'category');
      const correctionTimeline = await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}/timeline`);
      assert.ok(correctionTimeline.data.items.some((event: any) => event.kind === 'correction' && event.summary === 'Koreksi: kategori kejadian telah diperbarui.'));
      const beforeWithdraw = (await readById(first.id)).revision;
      await decideReport(admin.client, first.id, beforeWithdraw, 'rejected');
      const withdrawn = await call(reader.client, 'get', `/api/v1/public/incidents/${first.id}`, undefined, {}, 410);
      assert.equal(withdrawn.error.code, 'INCIDENT_WITHDRAWN');
      const map = await call(reader.client, 'get', mapPath);
      assert.deepEqual(map.data.features, mapBaseline.data.features,
        'withdrawn and duplicate reports leave the public map projection unchanged');
      const balance = await sql<{ points: string }[]>`SELECT coalesce(sum(delta),0)::text AS points FROM point_ledger WHERE user_id=${reporter.id}`;
      assert.equal(balance[0]!.points, '0', 'withdrawal reverses the canonical report award exactly once');
    });

    await t.test('G-31–G-36: coordinator scope, concurrent capacity, cancellation, results, impact and notifications', async () => {
      const report = await createReport(reporter.client, reporter.id, 'Laporan untuk kegiatan relawan dan pengukuran dampak.');
      await decideReport(admin.client, report.id, 1, 'verified', { publicSummary: 'Titik sampah untuk uji kegiatan.' });
      await decideReport(admin.client, report.id, 2, 'in_progress');
      const now = Date.now();
      const startsAt = new Date(now + 60 * 60_000).toISOString();
      const endsAt = new Date(now + 3 * 60 * 60_000).toISOString();
      const registrationClosesAt = new Date(now + 45 * 60_000).toISOString();
      const activityBody = (coordinatorId: string, capacity: number, title: string) => ({
        reportId: report.id, title, description: 'Kegiatan relawan untuk meninjau alur dari awal sampai hasil.', coordinatorId,
        startsAt, endsAt, registrationClosesAt, timezone: 'Asia/Jakarta', capacity,
        meetingPoint: { instructions: 'Berkumpul di pintu taman.', latitude: null, longitude: null },
        equipment: ['Sarung tangan'], accessibilityNotes: '', wasteHandoverPlan: 'Serahkan ke bank sampah mitra.',
      });
      const cancelDraft = await call(admin.client, 'post', '/api/v1/admin/activities', activityBody(coordinator.id, 2, 'Kegiatan yang dibatalkan'),
        { 'Idempotency-Key': randomUUID() }, 201);
      const cancellationActivityId = cancelDraft.data.id as string;
      await call(coordinator.client, 'put', `/api/v1/activities/${cancellationActivityId}/coordinator-acceptance`,
        { accepted: true, publishDisplayName: true }, { 'If-Match': '1' });
      await call(admin.client, 'post', `/api/v1/activities/${cancellationActivityId}/commands`, { action: 'publish', reason: null },
        { 'If-Match': '2', 'Idempotency-Key': randomUUID() }, 200);
       const joined = await call(memberOne.client, 'put', `/api/v1/activities/${cancellationActivityId}/membership`, { participating: true });
       assert.equal(joined.data.status, 'requested');
       const coordinatorNotices = await call(coordinator.client, 'get', '/api/v1/users/me/notifications?unreadOnly=true');
       const membershipRequest = coordinatorNotices.data.items.find((item: any) => item.type === 'membership_requested');
       assert.ok(membershipRequest, 'coordinator receives a notification for a new join request');
       assert.equal(membershipRequest.targetPath, `/activities/${cancellationActivityId}/manage`);
       const cancelKey = randomUUID();
      const cancelled = await call(coordinator.client, 'post', `/api/v1/activities/${cancellationActivityId}/commands`,
        { action: 'cancel', reason: 'Kegiatan dibatalkan karena cuaca.' }, { 'If-Match': '3', 'Idempotency-Key': cancelKey });
      const cancelReplay = await call(coordinator.client, 'post', `/api/v1/activities/${cancellationActivityId}/commands`,
        { action: 'cancel', reason: 'Kegiatan dibatalkan karena cuaca.' }, { 'If-Match': '3', 'Idempotency-Key': cancelKey });
      assert.equal(cancelReplay.data.revision, cancelled.data.revision, 'retry replays the original cancellation decision');
      const notice = await call(reader.client, 'get', `/api/v1/activities/${cancellationActivityId}`);
      assert.equal(notice.data.status, 'cancelled');
      assert.equal(notice.data.cancellationReason, 'Kegiatan dibatalkan karena cuaca.');
      const activeNotices = await call(memberOne.client, 'get', '/api/v1/users/me/notifications?unreadOnly=true');
      assert.equal(activeNotices.data.items.filter((item: any) => item.type === 'activity_cancelled').length, 1,
        'active participant receives one cancellation notification despite an idempotent command replay');
      const cancelEvent = activeNotices.data.items.find((item: any) => item.type === 'activity_cancelled');
      const privateReason = 'INTERNAL HOLD DETAIL MUST NEVER BE PUBLIC';
      await sql`UPDATE activities SET hold_reason=${privateReason} WHERE id=${cancellationActivityId}`;
      const cancellationWithPrivateReason = await call(reader.client, 'get', `/api/v1/activities/${cancellationActivityId}`);
      assert.doesNotMatch(JSON.stringify(cancellationWithPrivateReason.data), new RegExp(privateReason));
      const otherCannotReadNotification = await call(memberTwo.client, 'put', `/api/v1/users/me/notifications/${cancelEvent.id}/read`, { read: true }, {}, 404);
      assert.equal(otherCannotReadNotification.error.code, 'NOT_FOUND');
      assert.equal(cancelled.data.status, 'cancelled');

      const activity = await call(admin.client, 'post', '/api/v1/admin/activities', activityBody(coordinator.id, 1, 'Kegiatan penanganan sampah'),
        { 'Idempotency-Key': randomUUID() }, 201);
      const activityId = activity.data.id as string;
      await call(coordinator.client, 'put', `/api/v1/activities/${activityId}/coordinator-acceptance`,
        { accepted: true, publishDisplayName: true }, { 'If-Match': '1' });
      await call(admin.client, 'post', `/api/v1/activities/${activityId}/commands`, { action: 'publish', reason: null },
        { 'If-Match': '2', 'Idempotency-Key': randomUUID() });
      const originalNowForDeadline = Date.now;
      let lateJoin: HttpResult;
      try {
        Date.now = () => Date.parse(registrationClosesAt) + 1;
        await refreshCsrf(memberThree.client);
        lateJoin = await call(memberThree.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: true }, {}, 409);
      } finally { Date.now = originalNowForDeadline; }
      assert.equal(lateJoin!.error.code, 'REGISTRATION_CLOSED', 'membership requests stop at the server-side registration deadline');
      const memberA = await call(memberOne.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: true });
      const memberB = await call(memberTwo.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: true });
      assert.equal(memberA.data.status, 'requested');
      assert.equal(memberB.data.status, 'requested');
      const forbiddenCoordinatorScope = await call(memberOne.client, 'get', `/api/v1/activities/${activityId}/manage`, undefined, {}, 403);
      assert.equal(forbiddenCoordinatorScope.error.code, 'FORBIDDEN');
      const accepts = await Promise.all([
        call(coordinator.client, 'patch', `/api/v1/activities/${activityId}/memberships/${memberA.data.id}`, { status: 'accepted', reason: 'Kapasitas tersedia.' }, { 'If-Match': '1' }, [200, 409]),
        call(coordinator.client, 'patch', `/api/v1/activities/${activityId}/memberships/${memberB.data.id}`, { status: 'accepted', reason: 'Kapasitas tersedia.' }, { 'If-Match': '1' }, [200, 409]),
      ]);
      assert.equal(accepts.filter((r) => r.status === 200).length, 1, 'only one concurrent acceptance can reserve the one seat');
      assert.equal(accepts.filter((r) => r.status === 409 && r.error.code === 'ACTIVITY_FULL').length, 1);
      const fullMember = accepts.find((r) => r.status === 200)!.data;
      const waitingMember = memberA.data.id === fullMember.id ? memberB.data : memberA.data;
      const fullMemberClient = memberA.data.id === fullMember.id ? memberOne.client : memberTwo.client;
      const waitlisted = await call(coordinator.client, 'patch', `/api/v1/activities/${activityId}/memberships/${waitingMember.id}`,
        { status: 'waitlisted', reason: 'Tempat sedang penuh.' }, { 'If-Match': '1' });
      assert.equal(waitlisted.data.status, 'waitlisted');
      const joinedThird = await call(memberThree.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: true });
      const leftThird = await call(memberThree.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: false });
      assert.equal(leftThird.data.status, 'cancelled');
      const rejoinedThird = await call(memberThree.client, 'put', `/api/v1/activities/${activityId}/membership`, { participating: true });
      assert.equal(rejoinedThird.data.id, joinedThird.data.id, 'cancel/rejoin reuses the unique user membership');
      assert.equal(rejoinedThird.data.status, 'requested');
      const leftAccepted = await call(fullMemberClient, 'put', `/api/v1/activities/${activityId}/membership`, { participating: false });
      assert.equal(leftAccepted.data.status, 'cancelled');
      const promotedClient = memberA.data.id === waitingMember.id ? memberOne.client : memberTwo.client;
      const promoted = await call(coordinator.client, 'patch', `/api/v1/activities/${activityId}/memberships/${waitingMember.id}`,
        { status: 'accepted', reason: 'Kursi tersedia setelah pembatalan.' }, { 'If-Match': '2' });
      assert.equal(promoted.data.status, 'accepted', 'coordinator can promote a waitlisted member after a seat opens');
      const activityMember = promoted.data;
      const schedule = { ...activityBody(coordinator.id, 1, 'Kegiatan penanganan sampah'), startsAt: new Date(now + 90 * 60_000).toISOString(),
        endsAt: new Date(now + 3 * 60 * 60_000).toISOString(), registrationClosesAt: new Date(now + 75 * 60_000).toISOString() };
      const edited = await call(coordinator.client, 'patch', `/api/v1/activities/${activityId}`, schedule, { 'If-Match': '3' });
      const viewer = await call(promotedClient, 'get', `/api/v1/activities/${activityId}/viewer`);
      assert.equal(viewer.data.scheduleAcknowledgementRequired, true);
      const acknowledged = await call(promotedClient, 'put', `/api/v1/activities/${activityId}/schedule-acknowledgement`,
        { scheduleRevision: viewer.data.scheduleRevision, confirmed: true });
      assert.equal(acknowledged.data.status, 'accepted');
      const activityRevision = edited.data.revision as number;
      const closed = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/commands`,
        { action: 'close_registration', reason: null }, { 'If-Match': String(activityRevision), 'Idempotency-Key': randomUUID() });
      const startMs = Date.parse(schedule.startsAt);
      const originalNow = Date.now;
      try {
        Date.now = () => startMs + 60_000;
        await refreshCsrf(coordinator.client);
        const started = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/commands`,
          { action: 'start', reason: null }, { 'If-Match': String(closed.data.revision), 'Idempotency-Key': randomUUID() });
        assert.equal(started.data.status, 'in_progress');
        const absent = await call(coordinator.client, 'put', `/api/v1/activities/${activityId}/memberships/${activityMember.id}/attendance`,
          { attendance: 'absent' }, { 'If-Match': String(acknowledged.data.revision) });
        assert.equal(absent.data.attendance, 'absent');
        const attendance = await call(coordinator.client, 'put', `/api/v1/activities/${activityId}/memberships/${activityMember.id}/attendance`,
          { attendance: 'present' }, { 'If-Match': String(absent.data.revision) });
        assert.equal(attendance.data.attendance, 'present', 'attendance correction is revision-bound and reflected for the accepted member');
        const requestedResult = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/commands`,
          { action: 'request_result', reason: null }, { 'If-Match': String(started.data.revision), 'Idempotency-Key': randomUUID() });
        assert.equal(requestedResult.data.status, 'awaiting_result');
      } finally { Date.now = originalNow; }

      const before = await addMedia(coordinator.id, 'activity_evidence');
      const after = await addMedia(coordinator.id, 'activity_evidence');
      const scale = await addMedia(coordinator.id, 'activity_evidence');
      const measuredAt = new Date(startMs + 60_000).toISOString();
      const resultPayload = {
        observedAt: measuredAt, description: 'Lima relawan menangani sebagian sampah dan melakukan penimbangan.', claimedOutcome: 'partial',
        beforeMediaIds: [before], beforePublicEvidenceIds: [], afterMediaIds: [after],
        measurement: { physicalBatchId: null, stage: 'collected', valueKg: 0, measuredAt, method: 'scale', sourceReference: `e2e-${randomUUID()}`, evidenceMediaIds: [scale] },
      };
      const originalNowForResult = Date.now;
      let result: HttpResult;
      try {
        Date.now = () => startMs + 60_000;
        result = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/results`, resultPayload,
          { 'Idempotency-Key': randomUUID() }, 201);
      } finally { Date.now = originalNowForResult; }
      assert.equal(result.data.status, 'submitted');
      assert.ok(result.data.measurement.physicalBatchId);

      const pendingResult = await call(admin.client, 'get', `/api/v1/admin/activity-results/${result.data.id}`);
      const firstResultRunId = pendingResult.data.latestReview.id as string;
      const processor = await createReviewProcessor();
      await processor.process({ topic: 'review.requested', aggregate_id: firstResultRunId, payload_minimal: {} });
      const reviewedResult = await call(admin.client, 'get', `/api/v1/admin/activity-results/${result.data.id}`);
      assert.equal(reviewedResult.data.status, 'submitted', 'Hermes result suggestion cannot approve an activity result');
      assert.equal(reviewedResult.data.latestReview.status, 'completed');
      assert.equal(reviewedResult.data.latestReview.requiresHumanReview, true);
      const evidenceRequest = await call(admin.client, 'post', `/api/v1/admin/activity-results/${result.data.id}/decisions`, {
        action: 'request_evidence', reason: 'Mohon tambahkan detail bukti.', verifiedOutcome: null, publicSummary: null,
        publicEvidenceApprovals: [], requestedEvidence: ['Perjelas kondisi sebelum kegiatan.'],
      }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      assert.equal(evidenceRequest.data.status, 'needs_evidence');
      const originalNowForEdit = Date.now;
      let amendedResult: HttpResult;
      try {
        Date.now = () => startMs + 60_000;
        amendedResult = await call(coordinator.client, 'patch', `/api/v1/activities/${activityId}/results/${result.data.id}`,
          { ...resultPayload, description: 'Lima relawan menangani sebagian sampah; bukti kondisi awal diperjelas.' }, { 'If-Match': '2' });
      } finally { Date.now = originalNowForEdit; }
      assert.equal(amendedResult.data.status, 'submitted');
      assert.equal(amendedResult.data.revision, 3);
      const amendedResultView = await call(admin.client, 'get', `/api/v1/admin/activity-results/${result.data.id}`);
      const amendedRunId = amendedResultView.data.latestReview.id as string;
      assert.notEqual(amendedRunId, firstResultRunId, 'result correction enqueues a revision-bound review');
      await processor.process({ topic: 'review.requested', aggregate_id: amendedRunId, payload_minimal: {} });
      assert.equal((await call(admin.client, 'get', `/api/v1/admin/activity-results/${result.data.id}`)).data.latestReview.status, 'completed');

      await call(admin.client, 'post', `/api/v1/admin/measurements/${result.data.measurement.id}/decisions`,
        { action: 'verify', reason: 'Tiket timbang nol diverifikasi.' }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      const measurementFrom = measuredAt;
      const measurementTo = new Date(Date.parse(measuredAt) + 1).toISOString();
      const measurementRange = `from=${encodeURIComponent(measurementFrom)}&to=${encodeURIComponent(measurementTo)}`;
      const impactBeforeResultApproval = await call(reader.client, 'get', `/api/v1/impact/summary?${measurementRange}`);
      assert.equal(impactBeforeResultApproval.data.verifiedKg.collected, null,
        'verified scale reading is not public impact before its activity result is approved');
      const approvalFrom = new Date(Date.now() - 1_000).toISOString();
      const resultDecision = await call(admin.client, 'post', `/api/v1/admin/activity-results/${result.data.id}/decisions`, {
        action: 'approve', reason: 'Hasil sebagian ditinjau admin.', verifiedOutcome: 'partial',
        publicSummary: 'Sebagian titik sudah ditangani.', publicEvidenceApprovals: [], requestedEvidence: [],
      }, { 'If-Match': '3', 'Idempotency-Key': randomUUID() });
      assert.equal(resultDecision.data.status, 'approved');
      assert.equal(resultDecision.data.verifiedOutcome, 'partial');
      const attendanceCurrentRevision = (await sql<{ revision: number }[]>`SELECT revision FROM activity_memberships WHERE id=${activityMember.id}`)[0]!.revision;
      const attendanceAbsentAfterApproval = await call(coordinator.client, 'put', `/api/v1/activities/${activityId}/memberships/${activityMember.id}/attendance`,
        { attendance: 'absent' }, { 'If-Match': String(attendanceCurrentRevision) });
      assert.equal(attendanceAbsentAfterApproval.data.attendance, 'absent');
      const attendanceRestoredAfterApproval = await call(coordinator.client, 'put', `/api/v1/activities/${activityId}/memberships/${activityMember.id}/attendance`,
        { attendance: 'present' }, { 'If-Match': String(attendanceAbsentAfterApproval.data.revision) });
      assert.equal(attendanceRestoredAfterApproval.data.attendance, 'present', 'coordinator can correct attendance after result approval with a current revision');
      const approvalTo = new Date(Date.now() + 1_000).toISOString();
      const approvalImpact = await call(reader.client, 'get', `/api/v1/impact/summary?from=${encodeURIComponent(approvalFrom)}&to=${encodeURIComponent(approvalTo)}`);
      assert.equal(approvalImpact.data.approvedActivities, 1);
      assert.equal(approvalImpact.data.volunteerAttendances, 1);
      assert.equal(approvalImpact.data.uniqueVolunteers, 1);
      assert.equal(approvalImpact.data.measurementCoverage.approvedResults, 1);
      assert.equal(approvalImpact.data.measurementCoverage.resultsWithVerifiedWeight, 1);
      const impactAfterResultApproval = await call(reader.client, 'get', `/api/v1/impact/summary?${measurementRange}`);
      assert.equal(impactAfterResultApproval.data.verifiedKg.collected, 0, 'approved zero remains distinct from missing');
      assert.equal(impactAfterResultApproval.data.verifiedKg.handedOver, null);
      assert.equal(impactAfterResultApproval.data.verifiedKg.recycled, null);
      const reportAfterPartial = (await sql<{ status: string }[]>`SELECT status FROM reports WHERE id=${report.id}`)[0]!;
      assert.equal(reportAfterPartial.status, 'in_progress', 'partial activity result must not resolve the incident');

      const handoverProof = await addMedia(coordinator.id, 'activity_evidence');
      const originalNowForHandover = Date.now;
      let handover: HttpResult;
      try {
        Date.now = () => startMs + 60_000;
        handover = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/measurements`, {
          physicalBatchId: result.data.measurement.physicalBatchId, stage: 'handed_over', valueKg: 2.5,
          measuredAt, method: 'scale', sourceReference: `e2e-handover-${randomUUID()}`, evidenceMediaIds: [handoverProof],
        }, { 'Idempotency-Key': randomUUID() }, 201);
      } finally { Date.now = originalNowForHandover; }
      await call(admin.client, 'post', `/api/v1/admin/measurements/${handover.data.id}/decisions`,
        { action: 'verify', reason: 'Serah terima diverifikasi.' }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      const correctedHandover = await call(admin.client, 'patch', `/api/v1/admin/measurements/${handover.data.id}`, {
        valueKg: 2.25, reason: 'Koreksi pembacaan tiket timbang.', evidenceMediaIds: [handoverProof],
      }, { 'If-Match': '2', 'Idempotency-Key': randomUUID() });
      assert.equal(correctedHandover.data.status, 'pending_review');
      assert.equal(correctedHandover.data.supersedesId, handover.data.id);
      await call(admin.client, 'post', `/api/v1/admin/measurements/${correctedHandover.data.id}/decisions`,
        { action: 'verify', reason: 'Koreksi tiket timbang diverifikasi.' }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      assert.equal((await sql<{ status: string }[]>`SELECT status FROM impact_measurements WHERE id=${handover.data.id}`)[0]!.status, 'superseded',
        'verified correction supersedes the prior measurement instead of adding to it');

      const recycleProof = await addMedia(coordinator.id, 'activity_evidence');
      const originalNowForRecycle = Date.now;
      let recycled: HttpResult;
      try {
        Date.now = () => startMs + 60_000;
        recycled = await call(coordinator.client, 'post', `/api/v1/activities/${activityId}/measurements`, {
          physicalBatchId: result.data.measurement.physicalBatchId, stage: 'recycled', valueKg: 1.5,
          measuredAt, method: 'scale', sourceReference: `e2e-recycled-${randomUUID()}`, evidenceMediaIds: [recycleProof],
        }, { 'Idempotency-Key': randomUUID() }, 201);
      } finally { Date.now = originalNowForRecycle; }
      await call(admin.client, 'post', `/api/v1/admin/measurements/${recycled.data.id}/decisions`,
        { action: 'verify', reason: 'Berat daur ulang diverifikasi.' }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
      const impact = await call(reader.client, 'get', `/api/v1/impact/summary?${measurementRange}`);
      assert.equal(impact.data.verifiedKg.collected, 0, 'verified zero remains distinct from missing');
      assert.equal(impact.data.verifiedKg.handedOver, 2.25, 'corrected batch handover replaces, rather than adds to, the old value');
      assert.equal(impact.data.verifiedKg.recycled, 1.5, 'same physical batch recycled weight is reported in its own stage');
       const notifications = await call(promotedClient, 'get', '/api/v1/users/me/notifications?unreadOnly=true');
      assert.ok(notifications.data.items.some((item: any) => item.type === 'result_approved'));
      const resultNotice = notifications.data.items.find((item: any) => item.type === 'result_approved');
       const readNotice = await call(promotedClient, 'put', `/api/v1/users/me/notifications/${resultNotice.id}/read`, { read: true });
       assert.equal(readNotice.data.read, true);
       assert.equal((await call(promotedClient, 'get', '/api/v1/users/me/notifications?unreadOnly=true')).data.items.some((item: any) => item.id === resultNotice.id), false);

       const completeStartsAt = new Date(startMs + 120 * 60_000);
       const completeEndsAt = new Date(completeStartsAt.getTime() + 90 * 60_000);
       const completeRegistrationClosesAt = new Date(completeStartsAt.getTime() - 5 * 60_000);
       const completeActivityBody = { ...activityBody(coordinator.id, 1, 'Penyelesaian kegiatan'),
         startsAt: completeStartsAt.toISOString(), endsAt: completeEndsAt.toISOString(),
         registrationClosesAt: completeRegistrationClosesAt.toISOString() };
       const completeActivityDraft = await call(admin.client, 'post', '/api/v1/admin/activities', completeActivityBody,
         { 'Idempotency-Key': randomUUID() }, 201);
       const completeActivityId = completeActivityDraft.data.id as string;
       await call(coordinator.client, 'put', `/api/v1/activities/${completeActivityId}/coordinator-acceptance`,
         { accepted: true, publishDisplayName: true }, { 'If-Match': '1' });
       await call(admin.client, 'post', `/api/v1/activities/${completeActivityId}/commands`, { action: 'publish', reason: null },
         { 'If-Match': '2', 'Idempotency-Key': randomUUID() });
       const completeClosed = await call(coordinator.client, 'post', `/api/v1/activities/${completeActivityId}/commands`,
         { action: 'close_registration', reason: null }, { 'If-Match': '3', 'Idempotency-Key': randomUUID() });
       const completeStartMs = completeStartsAt.getTime();
       const originalNowForComplete = Date.now;
       try {
         Date.now = () => completeStartMs + 60_000;
         await refreshCsrf(coordinator.client);
         const completeStarted = await call(coordinator.client, 'post', `/api/v1/activities/${completeActivityId}/commands`,
           { action: 'start', reason: null }, { 'If-Match': String(completeClosed.data.revision), 'Idempotency-Key': randomUUID() });
         await call(coordinator.client, 'post', `/api/v1/activities/${completeActivityId}/commands`,
           { action: 'request_result', reason: null }, { 'If-Match': String(completeStarted.data.revision), 'Idempotency-Key': randomUUID() });
       } finally { Date.now = originalNowForComplete; }
       const completeBefore = await addMedia(coordinator.id, 'activity_evidence');
       const completeAfter = await addMedia(coordinator.id, 'activity_evidence');
       const originalNowForCompleteResult = Date.now;
       let completeResult: HttpResult;
       try {
         Date.now = () => completeStartMs + 60_000;
         completeResult = await call(coordinator.client, 'post', `/api/v1/activities/${completeActivityId}/results`, {
           observedAt: new Date(completeStartMs + 60_000).toISOString(), description: 'Kegiatan selesai dan lokasi diperiksa kembali.',
           claimedOutcome: 'complete', beforeMediaIds: [completeBefore], beforePublicEvidenceIds: [], afterMediaIds: [completeAfter], measurement: null,
         }, { 'Idempotency-Key': randomUUID() }, 201);
       } finally { Date.now = originalNowForCompleteResult; }
       const completeRendition = randomUUID();
       await sql`INSERT INTO media_consents(media_id,channels) VALUES(${completeAfter},ARRAY['web']::text[])`;
       await sql`INSERT INTO evidence_renditions(id,media_id,subject_type,subject_id,status,object_key)
         VALUES(${completeRendition},${completeAfter},'activity_result',${completeResult.data.id},'ready',${`public/${completeRendition}.jpg`})`;
       const completeDecision = await call(admin.client, 'post', `/api/v1/admin/activity-results/${completeResult.data.id}/decisions`, {
         action: 'approve', reason: 'Bukti penyelesaian ditinjau admin.', verifiedOutcome: 'complete', publicSummary: 'Kegiatan selesai; lokasi telah ditangani.',
         publicEvidenceApprovals: [{ mediaId: completeAfter, renditionId: completeRendition, channels: ['web'] }], requestedEvidence: [],
       }, { 'If-Match': '1', 'Idempotency-Key': randomUUID() });
       assert.equal(completeDecision.data.verifiedOutcome, 'complete');
       assert.equal((await sql<{ status: string }[]>`SELECT status FROM activities WHERE id=${completeActivityId}`)[0]!.status, 'completed');
       const completeClaim = (await sql<{ id: string; status: string }[]>`SELECT id,status FROM approved_resolution_evidence WHERE source_type='activity_result' AND source_id=${completeResult.data.id}`)[0]!;
       assert.equal(completeClaim.status, 'valid', 'approved complete result creates current resolution evidence');
       assert.equal((await sql<{ status: string }[]>`SELECT status FROM reports WHERE id=${report.id}`)[0]!.status, 'in_progress',
         'complete result approval supplies evidence but does not resolve the incident automatically');
       const publicResults = await call(reader.client, 'get', `/api/v1/activities/${completeActivityId}/public-results`);
       assert.equal(publicResults.data.items[0].outcome, 'complete');
       assert.match(publicResults.data.items[0].evidence[0].url, /public%2F/);
       assert.doesNotMatch(JSON.stringify(publicResults.data), new RegExp(`private/${completeAfter}`));
       const resolvedRevision = (await readById(report.id)).revision;
       const resolvedByActivity = await decideReport(admin.client, report.id, resolvedRevision, 'resolved', { resolutionEvidenceIds: [completeClaim.id] });
       assert.equal(resolvedByActivity.data.status, 'resolved', 'only the explicit report decision consumes complete activity evidence');
       assert.equal((await sql<{ status: string }[]>`SELECT status FROM reports WHERE id=${report.id}`)[0]!.status, 'resolved');
       const completeImpact = await call(reader.client, 'get', `/api/v1/impact/summary?from=${encodeURIComponent(approvalFrom)}&to=${encodeURIComponent(approvalTo)}`);
       assert.equal(completeImpact.data.approvedActivities, 2, 'impact includes both approved partial and complete activity results');
       assert.equal(completeImpact.data.resolvedIncidents, 1);
       const resolvedWeightImpact = await call(reader.client, 'get', `/api/v1/impact/summary?${measurementRange}`);
       assert.equal(resolvedWeightImpact.data.verifiedKg.collected, 0);
       assert.equal(resolvedWeightImpact.data.verifiedKg.handedOver, 2.25, 'resolving the incident does not double-count or erase eligible batch weights');
       assert.equal(resolvedWeightImpact.data.verifiedKg.recycled, 1.5);
       assert.equal(hermesState.mode, 'ok');
    });
  } finally {
    try {
      const suppressed = await suppressDemoBackgroundWork();
      if (demoDatabaseMode) console.info('demo_e2e_background_work_suppressed', suppressed);
    } finally {
      if (app) await app.close();
      await sql.end({ timeout: 5 });
      await new Promise<void>((resolveClose, reject) => hermes.close((error) => error ? reject(error) : resolveClose()));
    }
  }
});

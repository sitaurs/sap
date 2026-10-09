import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from '@sap/config';
import { ExtensionJobs, type ExtensionEvent } from '../src/extension-jobs.js';
import { ReportNotificationProcessor, reportDecisionNotice } from '../src/report-notification-processor.js';
import type { ReportEmailMessage } from '../src/report-notification-mailer.js';

const reportId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const emailId = '33333333-3333-4333-8333-333333333333';
const config = {
  NODE_ENV: 'test', MAIL_TRANSPORT: 'resend', MAIL_FROM: 'SAP <sap@local.test>', APP_ORIGIN: 'https://sap.local.test',
} as AppConfig;

function decision(status = 'verified', revision = 3): ExtensionEvent {
  return { topic: 'report.decided', aggregate_id: reportId,
    payload_minimal: { reportId, status, aggregateRevision: revision } };
}
const delivery: ExtensionEvent = { topic: 'notification.email', aggregate_id: emailId, payload_minimal: {} };

function harness() {
  const report = { reporter_id: userId as string | null, status: 'verified', revision: 3, public_visibility: 'hidden' };
  const user = { id: userId, email_normalized: 'reporter@local.test', email_verified_at: new Date(),
    deleted_at: null as Date | null, report_email_enabled: true };
  let missingReport = false;
  let missingUser = false;
  const notifications = new Map<string, unknown[]>();
  const emails = new Map<string, Record<string, unknown>>();
  const outbox = new Map<string, unknown[]>();
  const decisions = new Map<string, ExtensionEvent>();
  const statements: string[] = [];
  const sent: ReportEmailMessage[] = [];
  let rejectSend = false;
  let rejectCommit = false;
  const querySql = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?');
    statements.push(query);
    if (query.includes('SELECT payload_minimal FROM outbox_events')) {
      const source = decisions.get(String(values[0]));
      return source && source.aggregate_id === values[1]
        && `report-decided:${source.aggregate_id}:${source.payload_minimal.aggregateRevision}` === values[2]
        ? [{ payload_minimal: source.payload_minimal }] : [];
    }
    if (query.includes('SELECT reporter_id,status,revision FROM reports')) return missingReport ? [] : [{ ...report }];
    if (query.includes('FROM users')) return missingUser ? [] : [{ ...user }];
    if (query.includes('INSERT INTO notifications')) {
      const key = String(values[1]);
      if (notifications.has(key)) return [];
      notifications.set(key, values);
      return [{ id: 'notice' }];
    }
    if (query.includes('INSERT INTO report_notification_emails')) {
      if (emails.size) return [];
      const [event_key, report_id, user_id, report_revision, report_status, recipient_email,
        sender_email, mail_transport, subject, body_text] = values;
      emails.set(emailId, { id: emailId, event_key, report_id, user_id, report_revision, report_status,
        recipient_email, sender_email, mail_transport, subject, body_text, status: 'pending', first_attempt_at: null });
      return [{ id: emailId }];
    }
    if (query.includes('INSERT INTO outbox_events')) {
      outbox.set(String(values[2]), values);
      return [];
    }
    if (query.includes('SELECT * FROM report_notification_emails')) {
      const email = emails.get(String(values[0]));
      return email ? [{ ...email }] : [];
    }
    if (query.includes('UPDATE report_notification_emails')) {
      const email = emails.get(String(values[0]));
      if (!email) return [];
      if (query.includes('first_attempt_at=COALESCE') && email.status === 'pending') email.first_attempt_at ??= new Date();
      if (query.includes("status='sent'")) { email.status = 'sent'; email.sent_at = new Date(); }
      if (query.includes("status='skipped'")) email.status = 'skipped';
      return [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  }, { json: (value: unknown) => value });
  const sql = Object.assign(querySql, {
    begin: async <T>(callback: (tx: typeof querySql) => Promise<T>): Promise<T> => {
      const before = structuredClone({ notifications, emails, outbox });
      try {
        const result = await callback(sql);
        if (rejectCommit) { rejectCommit = false; throw new Error('COMMIT_FAILED'); }
        return result;
      } catch (error) {
        for (const [map, previous] of [[notifications, before.notifications], [emails, before.emails], [outbox, before.outbox]] as const) {
          map.clear();
          for (const [key, value] of previous) (map as Map<string, unknown>).set(key, value);
        }
        throw error;
      }
    },
  });
  const mailer = { send: async (message: ReportEmailMessage) => {
    sent.push(message);
    if (rejectSend) throw new Error('PROVIDER_FAILED');
  } };
  const processor = () => new ReportNotificationProcessor(sql as never, config, mailer);
  return { report, user, notifications, emails, outbox, decisions, sent, statements, processor,
    missingReport: () => { missingReport = true; }, missingUser: () => { missingUser = true; },
    rejectSend: (value: boolean) => { rejectSend = value; }, rejectCommit: () => { rejectCommit = true; } };
}

test('hidden report decision notifies its original reporter and atomically queues one email on replay', async () => {
  const h = harness();
  await h.processor().process(decision());
  await h.processor().process(decision());
  assert.equal(h.notifications.size, 1);
  const notice = [...h.notifications.values()][0]!;
  assert.equal(notice[0], userId);
  assert.equal(notice[1], `report-reporter:${reportId}:3`);
  assert.equal(notice[4], '/dashboard?view=reports');
  assert.equal(h.emails.size, 1);
  assert.equal(h.outbox.size, 1);
  assert.equal(h.sent.length, 0);
  assert.ok(h.statements.some(q => q.includes('FROM reports') && q.includes('FOR UPDATE')));
});

test('a newer decision gets a distinct report-and-revision key', async () => {
  const h = harness();
  h.user.report_email_enabled = false;
  await h.processor().process(decision());
  h.report.revision = 4; h.report.status = 'resolved';
  await h.processor().process(decision('resolved', 4));
  assert.equal(h.notifications.size, 2);
});

test('rapid consecutive decisions retain validated in-app history but email only the latest status', async () => {
  const h = harness(); h.report.status = 'resolved'; h.report.revision = 4;
  const earlier = { ...decision(), outbox_id: userId };
  h.decisions.set(userId, earlier);
  await h.processor().process(earlier);
  await h.processor().process(earlier);
  await h.processor().process(decision('resolved', 4));
  assert.equal(h.notifications.size, 2);
  const notice = h.notifications.get(`report-reporter:${reportId}:3`)!;
  assert.match(String(notice[2]), /^Keputusan sebelumnya:/);
  assert.match(String(notice[3]), /Status laporan mungkin sudah berubah/);
  assert.equal(h.emails.size, 1);
  assert.equal(h.emails.get(emailId)?.report_status, 'resolved');
});

test('stale status payload must match its authoritative persisted outbox event', async () => {
  const h = harness(); h.report.status = 'resolved'; h.report.revision = 4;
  const source = { ...decision('rejected'), outbox_id: userId };
  h.decisions.set(userId, source);
  await h.processor().process({ ...decision(), outbox_id: userId });
  assert.equal(h.notifications.size, 0);
  h.decisions.clear();
  await h.processor().process(source);
  assert.equal(h.notifications.size, 0);
});

for (const status of ['submitted', 'verified', 'in_progress', 'resolved', 'rejected', 'duplicate']) {
  test(`${status} has bounded status-specific copy without report content or moderation reasons`, async () => {
    const h = harness(); h.report.status = status;
    const event = decision(status);
    event.payload_minimal.reason = 'PRIVATE MODERATION REASON';
    event.payload_minimal.description = 'PRIVATE REPORT CONTENT';
    await h.processor().process(event);
    const email = h.emails.get(emailId)!;
    const notice = reportDecisionNotice(status)!;
    assert.equal(email.subject, notice.title);
    assert.equal(email.body_text, `${notice.message}\n\nhttps://sap.local.test/dashboard?view=reports`);
    assert.doesNotMatch(JSON.stringify([...h.notifications.values(), email]), /PRIVATE/);
  });
}

for (const change of ['old revision', 'different status', 'missing revision', 'string revision', 'unknown status', 'cross report']) {
  test(`ignores ${change} without inventing a current decision`, async () => {
    const h = harness(); const event = decision();
    if (change === 'old revision') event.payload_minimal.aggregateRevision = 2;
    if (change === 'different status') event.payload_minimal.status = 'resolved';
    if (change === 'missing revision') delete event.payload_minimal.aggregateRevision;
    if (change === 'string revision') event.payload_minimal.aggregateRevision = '3';
    if (change === 'unknown status') event.payload_minimal.status = 'invented';
    if (change === 'cross report') event.payload_minimal.reportId = userId;
    await h.processor().process(event);
    assert.equal(h.notifications.size, 0);
    assert.equal(h.emails.size, 0);
  });
}

for (const change of ['anonymous', 'deleted', 'missing user', 'missing report']) {
  test(`${change} reporter/report receives no notification or email`, async () => {
    const h = harness();
    if (change === 'anonymous') h.report.reporter_id = null;
    if (change === 'deleted') h.user.deleted_at = new Date();
    if (change === 'missing user') h.missingUser();
    if (change === 'missing report') h.missingReport();
    await h.processor().process(decision());
    assert.equal(h.notifications.size, 0);
    assert.equal(h.outbox.size, 0);
  });
}

for (const change of ['no opt-in', 'unverified']) {
  test(`${change} receives in-app only, including after an opt-in and event replay`, async () => {
    const h = harness();
    if (change === 'no opt-in') h.user.report_email_enabled = false;
    if (change === 'unverified') (h.user as { email_verified_at: Date | null }).email_verified_at = null;
    await h.processor().process(decision());
    assert.equal(h.notifications.size, 1);
    assert.equal(h.outbox.size, 0);
    h.user.report_email_enabled = true; h.user.email_verified_at = new Date();
    await h.processor().process(decision());
    assert.equal(h.outbox.size, 0);
  });
}

test('transaction rollback leaves no partial inbox/email/outbox writes', async () => {
  const h = harness(); h.rejectCommit();
  await assert.rejects(h.processor().process(decision()), /COMMIT_FAILED/);
  assert.equal(h.notifications.size + h.emails.size + h.outbox.size, 0);
  await h.processor().process(decision());
  assert.equal(h.outbox.size, 1);
});

test('email survives restart and repeated tickets do not send twice after durable acceptance', async () => {
  const h = harness();
  await h.processor().process(decision());
  await h.processor().process(delivery);
  await h.processor().process(delivery);
  assert.equal(h.sent.length, 1);
  assert.equal(h.emails.get(emailId)?.status, 'sent');
  assert.equal(h.sent[0]?.idempotencyKey, `report-reporter:${reportId}:3`);
  assert.ok(h.statements.some(q => q.includes('FROM reports') && q.includes('FOR SHARE')));
  assert.ok(h.statements.some(q => q.includes('FROM users') && q.includes('FOR SHARE')));
});

test('provider failure preserves pending SQL delivery and retries the same payload/key', async () => {
  const h = harness();
  await h.processor().process(decision()); h.rejectSend(true);
  await assert.rejects(h.processor().process(delivery), /PROVIDER_FAILED/);
  const started = h.emails.get(emailId)?.first_attempt_at;
  assert.ok(started instanceof Date);
  assert.equal(h.emails.get(emailId)?.status, 'pending');
  assert.equal(h.outbox.size, 1);
  h.rejectSend(false);
  await h.processor().process(delivery);
  assert.deepEqual(h.sent[0], h.sent[1]);
  assert.deepEqual(h.emails.get(emailId)?.first_attempt_at, started);
});

test('crash after provider acceptance retries with the same Resend idempotency key', async () => {
  const h = harness(); await h.processor().process(decision()); h.rejectCommit();
  await assert.rejects(h.processor().process(delivery), /COMMIT_FAILED/);
  assert.equal(h.emails.get(emailId)?.status, 'pending');
  assert.ok(h.emails.get(emailId)?.first_attempt_at instanceof Date);
  await h.processor().process(delivery);
  assert.deepEqual(h.sent[0], h.sent[1]);
  assert.equal(new Set(h.sent.map(message => message.idempotencyKey)).size, 1);
});

for (const change of ['stale revision', 'changed status', 'deleted', 'opted out', 'unverified', 'email changed', 'reporter changed', 'missing report', 'missing user', 'provider changed']) {
  test(`queued email is skipped when ${change} before delivery`, async () => {
    const h = harness(); await h.processor().process(decision());
    if (change === 'stale revision') h.report.revision++;
    if (change === 'changed status') h.report.status = 'resolved';
    if (change === 'deleted') h.user.deleted_at = new Date();
    if (change === 'opted out') h.user.report_email_enabled = false;
    if (change === 'unverified') (h.user as { email_verified_at: Date | null }).email_verified_at = null;
    if (change === 'email changed') h.user.email_normalized = 'changed@local.test';
    if (change === 'reporter changed') h.report.reporter_id = null;
    if (change === 'missing report') h.missingReport();
    if (change === 'missing user') h.missingUser();
    if (change === 'provider changed') h.emails.get(emailId)!.mail_transport = 'smtp';
    await h.processor().process(delivery);
    await h.processor().process(delivery);
    assert.equal(h.sent.length, 0);
    assert.equal(h.emails.get(emailId)?.status, 'skipped');
  });
}

test('an uncertain Resend attempt outside its deduplication window is skipped', async () => {
  const h = harness(); await h.processor().process(decision());
  h.emails.get(emailId)!.first_attempt_at = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await h.processor().process(delivery);
  assert.equal(h.sent.length, 0);
  assert.equal(h.emails.get(emailId)?.status, 'skipped');
});

test('extension dispatcher handles reporter and email jobs even with extension disabled', async () => {
  const events: ExtensionEvent[] = [];
  const jobs = Object.assign(Object.create(ExtensionJobs.prototype), {
    config: { SAP_EXTENSION_ENABLED: false },
    reportNotifications: { process: async (event: ExtensionEvent) => { events.push(event); } },
  }) as { execute(event: ExtensionEvent): Promise<void> };
  await jobs.execute(decision());
  await jobs.execute(delivery);
  assert.deepEqual(events.map(event => event.topic), ['report.decided', 'notification.email']);
});

test('outbox acknowledgement happens only after email processing succeeds', async () => {
  let failed = true; let acknowledged = 0;
  const jobs = Object.assign(Object.create(ExtensionJobs.prototype), {
    sql: async () => { acknowledged++; },
    reportNotifications: { process: async () => { if (failed) throw new Error('DELIVERY_FAILED'); } },
  }) as { handle(event: ExtensionEvent): Promise<void> };
  const event = { ...delivery, outbox_id: emailId };
  await assert.rejects(jobs.handle(event), /DELIVERY_FAILED/);
  assert.equal(acknowledged, 0);
  failed = false;
  await jobs.handle(event);
  assert.equal(acknowledged, 1);
});

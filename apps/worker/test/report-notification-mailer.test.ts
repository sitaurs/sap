import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from '@sap/config';
import { ReportNotificationMailer, type ReportEmailMessage } from '../src/report-notification-mailer.js';

const message: ReportEmailMessage = { from: 'SAP <sap@local.test>', to: 'reporter@local.test',
  subject: 'Laporan Anda terverifikasi', text: 'Buka SAP.', idempotencyKey: 'report-reporter:report:3' };

test('NODE_ENV=test never calls SMTP or Resend', async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('NETWORK_MUST_NOT_BE_USED'); };
  t.after(() => { globalThis.fetch = original; });
  for (const transport of ['smtp', 'resend']) {
    await new ReportNotificationMailer({ NODE_ENV: 'test', MAIL_TRANSPORT: transport } as AppConfig).send(message);
  }
});

test('Resend receives a stable idempotency header and immutable mail body', async t => {
  const requests: RequestInit[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    requests.push(init!);
    return new Response('{}', { status: 200 });
  };
  t.after(() => { globalThis.fetch = original; });
  const mailer = new ReportNotificationMailer({ NODE_ENV: 'development', MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'fake' } as AppConfig);
  await mailer.send(message); await mailer.send(message);
  assert.equal(new Headers(requests[0]?.headers).get('Idempotency-Key'), message.idempotencyKey);
  const { idempotencyKey: _, ...body } = message;
  assert.deepEqual(JSON.parse(String(requests[0]?.body)), body);
  assert.equal(requests[0]?.body, requests[1]?.body);
});

test('SMTP uses a stable Message-ID and does not claim provider-level deduplication', async () => {
  const sent: Record<string, unknown>[] = [];
  const mailer = new ReportNotificationMailer({ NODE_ENV: 'development', MAIL_TRANSPORT: 'smtp' } as AppConfig);
  Object.assign(mailer, { smtp: { sendMail: async (body: Record<string, unknown>) => { sent.push(body); } } });
  await mailer.send(message); await mailer.send(message);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.messageId, sent[1]?.messageId);
  assert.equal(sent[0]?.to, message.to);
});

test('provider rejection and sensitive errors are sanitized for worker logs', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const mailer = new ReportNotificationMailer({ NODE_ENV: 'development', MAIL_TRANSPORT: 'resend' } as AppConfig);
  globalThis.fetch = async () => new Response('PRIVATE PROVIDER RESPONSE', { status: 429 });
  await assert.rejects(mailer.send(message), /^Error: REPORT_EMAIL_DELIVERY_FAILED$/);
  globalThis.fetch = async () => { throw new Error('SECRET recipient@local.test'); };
  await assert.rejects(mailer.send(message), /^Error: REPORT_EMAIL_DELIVERY_FAILED$/);
});

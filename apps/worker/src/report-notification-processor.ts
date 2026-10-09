import type { AppConfig } from '@sap/config';
import type { Sql } from 'postgres';
import type { ExtensionEvent } from './extension-jobs.js';
import { ReportNotificationMailer, type ReportEmailSender } from './report-notification-mailer.js';

const REPORTS_PATH = '/dashboard?view=reports';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Leave a margin before Resend's 24-hour deduplication window expires.
const RESEND_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

type ReportRow = { reporter_id: string | null; status: string; revision: number };
type UserRow = {
  id: string; email_normalized: string; email_verified_at: Date | null;
  deleted_at: Date | null; report_email_enabled: boolean;
};
type EmailRow = {
  id: string; event_key: string; report_id: string; user_id: string;
  report_revision: number; report_status: string; recipient_email: string;
  sender_email: string; mail_transport: 'smtp' | 'resend'; subject: string; body_text: string;
  status: 'pending' | 'sent' | 'skipped'; first_attempt_at: Date | null;
};

export function reportDecisionNotice(status: string): { title: string; message: string } | null {
  switch (status) {
    case 'submitted': return { title: 'Laporan Anda ditinjau kembali', message: 'Laporan Anda kembali menunggu peninjauan. Buka SAP untuk melihat status laporan.' };
    case 'verified': return { title: 'Laporan Anda terverifikasi', message: 'Laporan Anda telah diverifikasi. Buka SAP untuk melihat perkembangan laporan.' };
    case 'in_progress': return { title: 'Laporan Anda sedang ditangani', message: 'Penanganan laporan Anda sedang berlangsung. Buka SAP untuk melihat perkembangannya.' };
    case 'resolved': return { title: 'Laporan Anda telah ditangani', message: 'Laporan Anda telah ditandai selesai ditangani. Buka SAP untuk melihat hasil penanganan.' };
    case 'rejected': return { title: 'Laporan Anda belum disetujui', message: 'Laporan Anda belum disetujui. Buka SAP untuk melihat keputusan pada laporan Anda.' };
    case 'duplicate': return { title: 'Laporan Anda ditandai duplikat', message: 'Laporan Anda ditandai sebagai duplikat laporan lain. Buka SAP untuk melihat keputusan pada laporan Anda.' };
    default: return null;
  }
}

export class ReportNotificationProcessor {
  constructor(private readonly sql: Sql, private readonly config: AppConfig,
    private readonly mailer: ReportEmailSender = new ReportNotificationMailer(config)) {}

  async process(event: ExtensionEvent): Promise<void> {
    if (event.topic === 'notification.email') return this.sendEmail(event.aggregate_id);
    if (event.topic !== 'report.decided') return;
    const reportId = event.aggregate_id;
    const revision = event.payload_minimal.aggregateRevision;
    const status = event.payload_minimal.status;
    if (!UUID.test(reportId) || (event.payload_minimal.reportId !== undefined && event.payload_minimal.reportId !== reportId)
      || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1 || typeof status !== 'string') return;
    const notice = reportDecisionNotice(status);
    if (!notice) return;
    await this.sql.begin(async tx => {
      const [report] = await tx<ReportRow[]>`SELECT reporter_id,status,revision FROM reports WHERE id=${reportId} FOR UPDATE`;
      if (!report?.reporter_id || report.revision < revision) return;
      const current = report.revision === revision && report.status === status;
      if (!current) {
        if (revision >= report.revision || !event.outbox_id || !UUID.test(event.outbox_id)) return;
        const [source] = await tx<{ payload_minimal: Record<string, unknown> }[]>`SELECT payload_minimal FROM outbox_events
          WHERE id=${event.outbox_id} AND topic='report.decided' AND aggregate_id=${reportId}
            AND dedup_key=${`report-decided:${reportId}:${revision}`}`;
        if (!source || source.payload_minimal.reportId !== reportId
          || source.payload_minimal.aggregateRevision !== revision || source.payload_minimal.status !== status) return;
      }
      const [user] = await tx<UserRow[]>`SELECT id,email_normalized,email_verified_at,deleted_at,report_email_enabled
        FROM users WHERE id=${report.reporter_id} FOR SHARE`;
      if (!user || user.deleted_at) return;
      const eventKey = `report-reporter:${reportId}:${revision}`;
      const title = current ? notice.title : `Keputusan sebelumnya: ${notice.title}`;
      const message = current ? notice.message
        : `Pada keputusan sebelumnya: ${notice.message} Status laporan mungkin sudah berubah.`;
      const inserted = await tx<{ id: string }[]>`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
        VALUES(${user.id},${eventKey},'incident_updated',${title},${message},${REPORTS_PATH})
        ON CONFLICT(user_id,event_key,type) DO NOTHING RETURNING id`;
      // Opting in later must not turn a replay into a retroactive email.
      if (!current || !inserted.length || !user.report_email_enabled || !user.email_verified_at) return;
      const body = `${notice.message}\n\n${new URL(REPORTS_PATH, this.config.APP_ORIGIN).href}`;
      const [email] = await tx<{ id: string }[]>`INSERT INTO report_notification_emails
        (event_key,report_id,user_id,report_revision,report_status,recipient_email,sender_email,mail_transport,subject,body_text)
        VALUES(${eventKey},${reportId},${user.id},${revision},${status},${user.email_normalized},
          ${this.config.MAIL_FROM},${this.config.MAIL_TRANSPORT},${notice.title},${body})
        ON CONFLICT(event_key) DO NOTHING RETURNING id`;
      if (email) await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key)
        VALUES('notification.email',${email.id},${tx.json({})},${`notification.email:${email.id}`})
        ON CONFLICT(dedup_key) DO NOTHING`;
    });
  }

  private async sendEmail(id: string): Promise<void> {
    if (!UUID.test(id)) return;
    // Commit the first attempt time before the external side effect. It must
    // survive a crash or rollback so expired provider keys are never reused.
    await this.sql`UPDATE report_notification_emails SET first_attempt_at=COALESCE(first_attempt_at,now())
      WHERE id=${id} AND status='pending'`;
    await this.sql.begin(async tx => {
      const [identity] = await tx<EmailRow[]>`SELECT * FROM report_notification_emails WHERE id=${id}`;
      if (!identity || identity.status !== 'pending') return;
      // Lock in report -> user -> delivery order, matching decision processing.
      // Keep status and consent stable through the bounded provider call.
      const [report] = await tx<ReportRow[]>`SELECT reporter_id,status,revision FROM reports WHERE id=${identity.report_id} FOR SHARE`;
      const [user] = await tx<UserRow[]>`SELECT id,email_normalized,email_verified_at,deleted_at,report_email_enabled
        FROM users WHERE id=${identity.user_id} FOR SHARE`;
      const [email] = await tx<EmailRow[]>`SELECT * FROM report_notification_emails WHERE id=${id} FOR UPDATE`;
      if (!email || email.status !== 'pending') return;
      const expired = email.mail_transport === 'resend' && (!email.first_attempt_at
        || Date.now() - new Date(email.first_attempt_at).getTime() >= RESEND_RETRY_WINDOW_MS);
      if (!report || report.reporter_id !== email.user_id || report.revision !== email.report_revision
        || report.status !== email.report_status || !user || user.deleted_at || !user.email_verified_at
        || !user.report_email_enabled || user.email_normalized !== email.recipient_email
        || email.mail_transport !== this.config.MAIL_TRANSPORT || expired) {
        await tx`UPDATE report_notification_emails SET status='skipped' WHERE id=${id}`;
        if (expired) console.error('report_email_retry_window_expired');
        return;
      }
      await this.mailer.send({ from: email.sender_email, to: email.recipient_email,
        subject: email.subject, text: email.body_text, idempotencyKey: email.event_key });
      await tx`UPDATE report_notification_emails SET status='sent',sent_at=now() WHERE id=${id}`;
    });
  }
}

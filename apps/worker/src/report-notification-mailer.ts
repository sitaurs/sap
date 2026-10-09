import type { AppConfig } from '@sap/config';
import type { Transporter } from 'nodemailer';

export interface ReportEmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface ReportEmailSender {
  send(message: ReportEmailMessage): Promise<void>;
}

/** Uses the same transport settings as the API mailer. Never logs provider payloads. */
export class ReportNotificationMailer implements ReportEmailSender {
  private smtp: Transporter | undefined;

  constructor(private readonly config: AppConfig) {}

  async send(message: ReportEmailMessage): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    const { idempotencyKey, ...body } = message;
    try {
      if (this.config.MAIL_TRANSPORT === 'smtp') {
        if (!this.smtp) {
          const { createTransport } = await import('nodemailer');
          this.smtp = createTransport({
            host: this.config.SMTP_HOST,
            port: this.config.SMTP_PORT,
            secure: this.config.SMTP_PORT === 465,
            requireTLS: true,
            auth: { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
            dnsTimeout: 10_000,
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          });
        }
        // A stable Message-ID helps threading, but SMTP cannot guarantee deduplication.
        await this.smtp.sendMail({ ...body, messageId: `<${idempotencyKey.replaceAll(':', '-')}@sap-notifications>` });
        return;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error('REPORT_EMAIL_PROVIDER_REJECTED');
    } catch {
      throw new Error('REPORT_EMAIL_DELIVERY_FAILED');
    }
  }
}

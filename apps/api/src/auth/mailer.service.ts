import { Injectable, Logger } from '@nestjs/common';
import { getConfig } from '@sap/config';
import type { Transporter } from 'nodemailer';

/**
 * Resend HTTPS mailer with an explicit SMTP option for local development.
 * Connections are lazy; NODE_ENV=test sends remain a no-op.
 */
@Injectable()
export class MailerService {
  private readonly config = getConfig();
  private readonly logger = new Logger(MailerService.name);
  private smtpTransporter: Transporter | null = null;

  async sendOtp(to: string, code: string, purpose: 'verify_email' | 'reset_password'): Promise<void> {
    const subject = purpose === 'verify_email' ? 'Verifikasi email SAP' : 'Reset kata sandi SAP';
    const intro =
      purpose === 'verify_email'
        ? 'Gunakan kode berikut untuk memverifikasi alamat email Anda.'
        : 'Gunakan kode berikut untuk mengatur ulang kata sandi Anda.';
    const text = `${intro}\n\nKode: ${code}\n\nKode berlaku selama 10 menit dan hanya dapat digunakan sekali. Abaikan email ini jika Anda tidak meminta.`;
    await this.send({ to, subject, text });
  }

  private async send(message: { to: string; subject: string; text: string }): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    if (this.config.MAIL_TRANSPORT === 'smtp') {
      await this.sendSmtp(message);
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.config.MAIL_FROM, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    if (!response.ok) {
      this.logger.error(`Resend rejected an email request (HTTP ${response.status})`);
      throw new Error(`Email provider rejected the request (HTTP ${response.status})`);
    }
  }

  private async sendSmtp(message: { to: string; subject: string; text: string }): Promise<void> {
    if (!this.smtpTransporter) {
      const { createTransport } = await import('nodemailer');
      this.smtpTransporter = createTransport({
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
    try {
      await this.smtpTransporter.sendMail({ from: this.config.MAIL_FROM, ...message });
    } catch {
      // Provider errors may contain addresses or SMTP responses. Keep them out
      // of logs and the HTTP response; never claim delivery after a rejection.
      this.logger.error('SMTP email delivery failed');
      throw new Error('Email provider rejected the request');
    }
  }
}

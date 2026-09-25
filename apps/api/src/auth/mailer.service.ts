import { Injectable, Logger } from '@nestjs/common';
import { getConfig } from '@sap/config';
import type { Transporter } from 'nodemailer';

/**
 * SMTP mailer for transactional auth email (OTP codes). The transport is created
 * lazily on first send — never at construction — so importing this provider does
 * not open a socket and offline `npm run check` stays green. In NODE_ENV=test the
 * transport is stubbed to a no-op.
 */
@Injectable()
export class MailerService {
  private readonly config = getConfig();
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

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
    const transporter = await this.getTransporter();
    if (!transporter) return;
    await transporter.sendMail({ from: this.config.MAIL_FROM, ...message });
  }

  private async getTransporter(): Promise<Transporter | null> {
    if (this.config.NODE_ENV === 'test') return null;
    if (this.transporter) return this.transporter;
    const { createTransport } = await import('nodemailer');
    this.transporter = createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      secure: this.config.SMTP_PORT === 465,
      auth: { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD },
    });
    return this.transporter;
  }
}

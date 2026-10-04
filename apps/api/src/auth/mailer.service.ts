import { Injectable, Logger } from '@nestjs/common';
import { getConfig } from '@sap/config';

/**
 * Resend HTTPS mailer for transactional auth email (OTP codes). Requests are
 * made only when sending, so importing this provider opens no network connection.
 * In NODE_ENV=test sends are a no-op.
 */
@Injectable()
export class MailerService {
  private readonly config = getConfig();
  private readonly logger = new Logger(MailerService.name);

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
}

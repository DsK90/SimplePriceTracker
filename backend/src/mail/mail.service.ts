import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (key) this.resend = new Resend(key);
  }

  async sendWelcome(to: string) {
    if (!this.resend) {
      this.log.debug('RESEND_API_KEY not set; skipping welcome email');
      return;
    }
    const from =
      this.config.get<string>('EMAIL_FROM') ||
      this.config.get<string>('MAIL_FROM', 'noreply@example.com');
    try {
      await this.resend.emails.send({
        from,
        to,
        subject: 'Welcome to Simple Price Tracker',
        text: 'Thanks for signing up. You can track up to 5 products at once on the free plan.',
      });
    } catch (e) {
      this.log.warn(`Welcome email failed: ${(e as Error).message}`);
    }
  }

  async sendPriceAlert(to: string, subject: string, text: string) {
    if (!this.resend) {
      this.log.debug('RESEND_API_KEY not set; skipping price alert email');
      return;
    }
    const from =
      this.config.get<string>('EMAIL_FROM') ||
      this.config.get<string>('MAIL_FROM', 'noreply@example.com');
    try {
      await this.resend.emails.send({ from, to, subject, text });
    } catch (e) {
      this.log.warn(`Price alert email failed: ${(e as Error).message}`);
    }
  }
}

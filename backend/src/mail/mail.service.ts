import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailParams, MailerSend, Recipient, Sender } from 'mailersend';

/** Parses `Name <email@domain.com>` or a bare email into MailerSend's Sender. */
function senderFromAddress(raw: string): Sender {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    const name = angle[1].replace(/^["']|["']$/g, '').trim();
    const email = angle[2].trim();
    return new Sender(email, name || undefined);
  }
  return new Sender(trimmed);
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly mailerSend: MailerSend | null = null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('MAILERSEND_API_KEY');
    if (key) this.mailerSend = new MailerSend({ apiKey: key });
  }

  private fromSender(): Sender {
    const raw =
      this.config.get<string>('EMAIL_FROM') ||
      this.config.get<string>('MAIL_FROM', 'noreply@example.com');
    return senderFromAddress(raw);
  }

  private async sendTransactional(to: string, subject: string, text: string) {
    if (!this.mailerSend) return;
    const params = new EmailParams()
      .setFrom(this.fromSender())
      .setTo([new Recipient(to)])
      .setSubject(subject)
      .setText(text)
      .setHtml(`<div style="font-family:sans-serif">${plainTextToHtml(text)}</div>`);
    await this.mailerSend.email.send(params);
  }

  async sendWelcome(to: string) {
    if (!this.mailerSend) {
      this.log.debug('MAILERSEND_API_KEY not set; skipping welcome email');
      return;
    }
    const text =
      'Thanks for signing up. On the free plan you can track up to 5 active products. ' +
      'Email price alerts are optional and limited to 2 products (10 on Pro); push and in-app alerts are unlimited. ' +
      'See our Fair Use Policy on the website.';
    try {
      await this.sendTransactional(to, 'Welcome to Pricefly', text);
    } catch (e) {
      this.log.warn(`Welcome email failed: ${(e as Error).message}`);
    }
  }

  async sendPriceAlert(to: string, subject: string, text: string) {
    if (!this.mailerSend) {
      this.log.debug('MAILERSEND_API_KEY not set; skipping price alert email');
      return;
    }
    try {
      await this.sendTransactional(to, subject, text);
    } catch (e) {
      this.log.warn(`Price alert email failed: ${(e as Error).message}`);
    }
  }
}

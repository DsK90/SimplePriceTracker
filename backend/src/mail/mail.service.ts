import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

/**
 * Transactional e-mail via Brevo (`transactionalEmails.sendTransacEmail` only — no marketing campaigns).
 *
 * - **Welcome** after the user confirms their e-mail (verification link).
 * - **Verify e-mail** link on sign-up when double opt-in is active.
 * - **Price alerts**: only if `SEND_PRICE_ALERT_EMAILS` is truthy (`true`, `1`, `yes`). If unset, defaults to
 *   enabled so existing deployments keep behaviour; set `SEND_PRICE_ALERT_EMAILS=false` for sign-up-only mail.
 *
 * MailerSend reference: `mailersend-transactional.reference.ts` (not wired).
 */

/** Parses `Name <email@domain.com>` or a bare email into Brevo's sender shape. */
function brevoSenderFromAddress(raw: string): { name: string; email: string } {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    const name = angle[1].replace(/^["']|["']$/g, '').trim();
    const email = angle[2].trim();
    return { name: name || email.split('@')[0] || 'Pricefly', email };
  }
  return { name: trimmed.split('@')[0] || 'Pricefly', email: trimmed };
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/** Env unset → allow price-alert mail (backward compatible). Explicit false/0/off → skip. */
function envAllowsPriceAlertEmails(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly brevo: BrevoClient | null = null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('BREVO_API_KEY');
    if (key) this.brevo = new BrevoClient({ apiKey: key });
  }

  private fromSender() {
    const raw =
      this.config.get<string>('EMAIL_FROM') ||
      this.config.get<string>('MAIL_FROM', 'noreply@example.com');
    return brevoSenderFromAddress(raw);
  }

  private async sendTransactional(to: string, subject: string, text: string) {
    if (!this.brevo) return;
    const sender = this.fromSender();
    await this.brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: `<div style="font-family:sans-serif">${plainTextToHtml(text)}</div>`,
    });
  }

  async sendEmailVerification(to: string, verifyUrl: string) {
    if (!this.brevo) {
      this.log.debug('BREVO_API_KEY not set; skipping verification email');
      return;
    }
    const text =
      'Please confirm your e-mail address to activate your Pricefly account.\n\n' +
      'Open this link (valid 48 hours):\n' +
      verifyUrl +
      '\n\nIf you did not sign up, you can ignore this message.';
    try {
      await this.sendTransactional(to, 'Confirm your Pricefly e-mail', text);
    } catch (e) {
      this.log.warn(`Verification e-mail failed: ${(e as Error).message}`);
    }
  }

  async sendWelcome(to: string) {
    if (!this.brevo) {
      this.log.debug('BREVO_API_KEY not set; skipping welcome email');
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
    if (!envAllowsPriceAlertEmails(this.config.get<string>('SEND_PRICE_ALERT_EMAILS'))) {
      this.log.debug('SEND_PRICE_ALERT_EMAILS disabled; skipping price alert email');
      return;
    }
    if (!this.brevo) {
      this.log.debug('BREVO_API_KEY not set; skipping price alert email');
      return;
    }
    try {
      await this.sendTransactional(to, subject, text);
    } catch (e) {
      this.log.warn(`Price alert email failed: ${(e as Error).message}`);
    }
  }
}

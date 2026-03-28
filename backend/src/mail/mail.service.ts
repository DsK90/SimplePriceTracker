import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import { normalizeMailLocale } from './i18n/mail-locale';
import {
  verificationEmailBody,
  verificationEmailHtml,
  verificationEmailSubject,
} from './i18n/verification-email';
import { welcomeEmailBody, welcomeEmailSubject } from './i18n/welcome-email';

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

  private async sendTransactional(to: string, subject: string, text: string, htmlOverride?: string) {
    if (!this.brevo) return;
    const sender = this.fromSender();
    const htmlContent =
      htmlOverride ?? `<div style="font-family:sans-serif">${plainTextToHtml(text)}</div>`;
    await this.brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent,
    });
  }

  async sendEmailVerification(to: string, verifyUrl: string, localeRaw?: string | null) {
    if (!this.brevo) {
      this.log.debug('BREVO_API_KEY not set; skipping verification email');
      return;
    }
    const locale = normalizeMailLocale(localeRaw);
    const subject = verificationEmailSubject(locale);
    const text = verificationEmailBody(locale, verifyUrl);
    const html = verificationEmailHtml(locale, verifyUrl);
    try {
      await this.sendTransactional(to, subject, text, html);
    } catch (e) {
      this.log.warn(`Verification e-mail failed: ${(e as Error).message}`);
    }
  }

  async sendWelcome(to: string, localeRaw?: string | null) {
    if (!this.brevo) {
      this.log.debug('BREVO_API_KEY not set; skipping welcome email');
      return;
    }
    const locale = normalizeMailLocale(localeRaw);
    const subject = welcomeEmailSubject(locale);
    const text = welcomeEmailBody(locale);
    try {
      await this.sendTransactional(to, subject, text);
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

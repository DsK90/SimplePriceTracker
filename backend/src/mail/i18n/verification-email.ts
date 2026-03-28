import type { MailLocale } from './mail-locale';
import { PRODUCT_TAGLINE } from './brand-tagline';

type Frag = {
  subject: string;
  intro: string;
  linkHint: string;
  /** Short label for the primary confirmation button (HTML &lt;a&gt;). */
  linkButton: string;
  footer: string;
};

const frags: Record<MailLocale, Frag> = {
  de: {
    subject: 'PriceFly – E-Mail-Adresse bestätigen',
    intro: 'Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.',
    linkHint: 'Öffnen Sie diesen Link (48 Stunden gültig):',
    linkButton: 'E-Mail bestätigen',
    footer: 'Wenn Sie sich nicht registriert haben, können Sie diese Nachricht ignorieren.',
  },
  en: {
    subject: 'Confirm your PriceFly email',
    intro: 'Please confirm your email address to activate your account.',
    linkHint: 'Open this link (valid 48 hours):',
    linkButton: 'Confirm email',
    footer: 'If you did not sign up, you can ignore this message.',
  },
  fr: {
    subject: 'PriceFly – confirmez votre adresse e-mail',
    intro: 'Veuillez confirmer votre adresse e-mail pour activer votre compte.',
    linkHint: 'Ouvrez ce lien (valable 48 heures) :',
    linkButton: 'Confirmer l’e-mail',
    footer: 'Si vous ne vous êtes pas inscrit, vous pouvez ignorer ce message.',
  },
  es: {
    subject: 'PriceFly – confirma tu correo electrónico',
    intro: 'Confirma tu dirección de correo para activar tu cuenta.',
    linkHint: 'Abre este enlace (válido 48 horas):',
    linkButton: 'Confirmar correo',
    footer: 'Si no te registraste, puedes ignorar este mensaje.',
  },
  it: {
    subject: 'PriceFly – conferma la tua e-mail',
    intro: 'Conferma il tuo indirizzo e-mail per attivare il tuo account.',
    linkHint: 'Apri questo link (valido 48 ore):',
    linkButton: 'Conferma e-mail',
    footer: 'Se non ti sei registrato, puoi ignorare questo messaggio.',
  },
  da: {
    subject: 'PriceFly – bekræft din e-mail',
    intro: 'Bekræft din e-mailadresse for at aktivere din konto.',
    linkHint: 'Åbn dette link (gyldigt i 48 timer):',
    linkButton: 'Bekræft e-mail',
    footer: 'Hvis du ikke har tilmeldt dig, kan du se bort fra denne besked.',
  },
  ru: {
    subject: 'PriceFly — подтвердите адрес электронной почты',
    intro: 'Подтвердите адрес электронной почты, чтобы активировать аккаунт.',
    linkHint: 'Откройте эту ссылку (действительна 48 часов):',
    linkButton: 'Подтвердить e-mail',
    footer: 'Если вы не регистрировались, проигнорируйте это письмо.',
  },
  zh: {
    subject: 'PriceFly – 请确认您的电子邮箱',
    intro: '请确认您的电子邮箱地址以激活账户。',
    linkHint: '打开以下链接（48 小时内有效）：',
    linkButton: '确认邮箱',
    footer: '若您未注册，请忽略此邮件。',
  },
};

function plainBody(locale: MailLocale, verifyUrl: string): string {
  const f = frags[locale];
  return (
    PRODUCT_TAGLINE[locale] +
    '\n\n' +
    f.intro +
    '\n\n' +
    f.linkHint +
    '\n' +
    verifyUrl +
    '\n\n' +
    f.footer
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * HTML body with an explicit &lt;a href&gt; so clients show a clickable confirmation link
 * (plain-text URL inside &lt;br/&gt; divs is often not linkified).
 */
export function verificationEmailHtml(locale: MailLocale, verifyUrl: string): string {
  const f = frags[locale];
  const href = escapeHtmlAttr(verifyUrl);
  const urlText = escapeHtml(verifyUrl);
  return (
    `<div style="font-family:sans-serif;line-height:1.5;color:#1f2937;max-width:560px">` +
    `<p style="margin:0 0 12px">${escapeHtml(PRODUCT_TAGLINE[locale])}</p>` +
    `<p style="margin:0 0 12px">${escapeHtml(f.intro)}</p>` +
    `<p style="margin:0 0 8px">${escapeHtml(f.linkHint)}</p>` +
    `<p style="margin:16px 0">` +
    `<a href="${href}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">` +
    escapeHtml(f.linkButton) +
    `</a></p>` +
    `<p style="margin:0 0 16px;font-size:13px;word-break:break-all">` +
    `<a href="${href}" style="color:#2563eb;text-decoration:underline">${urlText}</a>` +
    `</p>` +
    `<p style="margin:0;font-size:14px;color:#4b5563">${escapeHtml(f.footer)}</p>` +
    `</div>`
  );
}

export function verificationEmailSubject(locale: MailLocale): string {
  return frags[locale].subject;
}

export function verificationEmailBody(locale: MailLocale, verifyUrl: string): string {
  return plainBody(locale, verifyUrl);
}

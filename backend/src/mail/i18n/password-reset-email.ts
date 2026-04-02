import type { MailLocale } from './mail-locale';
import { PRODUCT_TAGLINE } from './brand-tagline';

type Frag = {
  subject: string;
  intro: string;
  linkHint: string;
  linkButton: string;
  footer: string;
};

const frags: Record<MailLocale, Frag> = {
  de: {
    subject: 'PriceFly – Passwort zurücksetzen',
    intro:
      'Sie haben angefordert, Ihr Passwort zurückzusetzen. Klicken Sie auf den Button oder öffnen Sie den Link unten.',
    linkHint: 'Dieser Link ist 1 Stunde gültig:',
    linkButton: 'Neues Passwort setzen',
    footer:
      'Wenn Sie keine Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail — Ihr Passwort bleibt unverändert.',
  },
  en: {
    subject: 'Reset your PriceFly password',
    intro: 'You asked to reset your password. Use the button or link below.',
    linkHint: 'This link is valid for 1 hour:',
    linkButton: 'Set new password',
    footer: "If you didn't request a reset, you can ignore this email — your password will stay the same.",
  },
  fr: {
    subject: 'PriceFly – réinitialiser le mot de passe',
    intro: 'Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le bouton ou le lien ci-dessous.',
    linkHint: 'Ce lien est valable 1 heure :',
    linkButton: 'Définir un nouveau mot de passe',
    footer:
      "Si vous n'avez pas demandé de réinitialisation, ignorez cet e-mail — votre mot de passe reste inchangé.",
  },
  es: {
    subject: 'PriceFly – restablecer contraseña',
    intro: 'Solicitaste restablecer tu contraseña. Usa el botón o el enlace de abajo.',
    linkHint: 'Este enlace es válido durante 1 hora:',
    linkButton: 'Establecer nueva contraseña',
    footer:
      'Si no solicitaste un restablecimiento, ignora este correo — tu contraseña no cambiará.',
  },
  it: {
    subject: 'PriceFly – reimposta la password',
    intro: 'Hai richiesto di reimpostare la password. Usa il pulsante o il link qui sotto.',
    linkHint: 'Questo link è valido per 1 ora:',
    linkButton: 'Imposta nuova password',
    footer:
      'Se non hai richiesto il ripristino, ignora questa email — la password resterà invariata.',
  },
  da: {
    subject: 'PriceFly – nulstil adgangskode',
    intro: 'Du har anmodet om at nulstille din adgangskode. Brug knappen eller linket nedenfor.',
    linkHint: 'Dette link er gyldigt i 1 time:',
    linkButton: 'Angiv ny adgangskode',
    footer:
      'Hvis du ikke har anmodet om nulstilling, kan du ignorere denne e-mail — din adgangskode forbliver uændret.',
  },
  ru: {
    subject: 'PriceFly — сброс пароля',
    intro: 'Вы запросили сброс пароля. Используйте кнопку или ссылку ниже.',
    linkHint: 'Ссылка действительна 1 час:',
    linkButton: 'Задать новый пароль',
    footer:
      'Если вы не запрашивали сброс, проигнорируйте это письмо — пароль не изменится.',
  },
  zh: {
    subject: 'PriceFly – 重置密码',
    intro: '您请求重置密码。请点击下方按钮或链接。',
    linkHint: '链接 1 小时内有效：',
    linkButton: '设置新密码',
    footer: '若您未请求重置，请忽略此邮件 — 密码将保持不变。',
  },
};

function plainBody(locale: MailLocale, resetUrl: string): string {
  const f = frags[locale];
  return (
    PRODUCT_TAGLINE[locale] +
    '\n\n' +
    f.intro +
    '\n\n' +
    f.linkHint +
    '\n' +
    resetUrl +
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

export function passwordResetEmailHtml(locale: MailLocale, resetUrl: string): string {
  const f = frags[locale];
  const href = escapeHtmlAttr(resetUrl);
  const urlText = escapeHtml(resetUrl);
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

export function passwordResetEmailSubject(locale: MailLocale): string {
  return frags[locale].subject;
}

export function passwordResetEmailBody(locale: MailLocale, resetUrl: string): string {
  return plainBody(locale, resetUrl);
}

/** UI / mail languages aligned with `frontend/public/assets/i18n/*.json`. */
export const MAIL_LOCALES = ['de', 'en', 'fr', 'es', 'it', 'da', 'ru', 'zh'] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];

export function normalizeMailLocale(raw?: string | null): MailLocale {
  if (raw == null || String(raw).trim() === '') return 'en';
  const base = String(raw).split(/[-_]/)[0]!.toLowerCase();
  return (MAIL_LOCALES as readonly string[]).includes(base) ? (base as MailLocale) : 'en';
}

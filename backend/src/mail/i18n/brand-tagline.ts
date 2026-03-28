import type { MailLocale } from './mail-locale';

/** Full product name + tagline for transactional e-mails (per locale). */
export const PRODUCT_TAGLINE: Record<MailLocale, string> = {
  de: 'PriceFly – Preistracker und Benachrichtigungen',
  en: 'PriceFly – Price tracker and notifications',
  fr: 'PriceFly – suivi des prix et notifications',
  es: 'PriceFly – seguimiento de precios y notificaciones',
  it: 'PriceFly – monitoraggio prezzi e notifiche',
  da: 'PriceFly – pristjek og notifikationer',
  ru: 'PriceFly — отслеживание цен и уведомления',
  zh: 'PriceFly — 价格跟踪与通知',
};

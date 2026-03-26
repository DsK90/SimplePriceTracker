/** ngx-translate keys (frontend `public/assets/i18n/*.json`). */
export const PRICE_ALERT_I18N_KEYS = {
  belowTitle: 'notifications.priceAlert.belowTitle',
  belowBody: 'notifications.priceAlert.belowBody',
  aboveTitle: 'notifications.priceAlert.aboveTitle',
  aboveBody: 'notifications.priceAlert.aboveBody',
} as const;

export type PriceAlertI18nPayload = {
  i18n: {
    titleKey: string;
    bodyKey: string;
    params: Record<string, string>;
  };
};

/** English `title`/`body` for email + web push; `payload` drives in-app translations. */
export function buildPriceAlertMessages(
  variant: 'below' | 'above',
  th: { toString(): string },
  currency: string,
  label: string,
  price: { toString(): string },
): { titleEn: string; bodyEn: string; payload: PriceAlertI18nPayload } {
  const ths = th.toString();
  const ps = price.toString();
  const keys =
    variant === 'below'
      ? { titleKey: PRICE_ALERT_I18N_KEYS.belowTitle, bodyKey: PRICE_ALERT_I18N_KEYS.belowBody }
      : { titleKey: PRICE_ALERT_I18N_KEYS.aboveTitle, bodyKey: PRICE_ALERT_I18N_KEYS.aboveBody };
  const params: Record<string, string> = {
    threshold: ths,
    currency,
    productLabel: label,
    price: ps,
  };
  const titleEn =
    variant === 'below'
      ? `Price at or below ${ths} ${currency}`
      : `Price at or above ${ths} ${currency}`;
  const bodyEn =
    variant === 'below'
      ? `${label} is now ${ps} ${currency} (target: ≤ ${ths} ${currency}).`
      : `${label} is now ${ps} ${currency} (target: ≥ ${ths} ${currency}).`;
  return {
    titleEn,
    bodyEn,
    payload: { i18n: { ...keys, params } },
  };
}

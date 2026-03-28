/** Map ISO 4217 currency to Steam `cc` (store region) for /api/appdetails */
const CURRENCY_TO_CC: Record<string, string> = {
  EUR: 'de',
  USD: 'us',
  GBP: 'uk',
  CAD: 'ca',
  AUD: 'au',
  JPY: 'jp',
  CHF: 'ch',
  PLN: 'pl',
  CNY: 'cn',
  BRL: 'br',
  INR: 'in',
  KRW: 'kr',
  NZD: 'nz',
  SEK: 'se',
  NOK: 'no',
  DKK: 'dk',
  MXN: 'mx',
  TWD: 'tw',
};

export function parseSteamAppIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith('steampowered.com')) return null;
    const m = u.pathname.match(/^\/app\/(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function steamCurrencyToCc(iso: string): string {
  const u = iso.trim().toUpperCase();
  return CURRENCY_TO_CC[u] ?? 'us';
}

type SteamAppDetailsResponse = Record<
  string,
  | {
      success: true;
      data: {
        name?: string;
        is_free?: boolean;
        price_overview?: {
          currency: string;
          final: number;
          initial: number;
        };
      };
    }
  | { success: false }
>;

export type SteamProductInfo = {
  name: string;
  price: number;
  currency: string;
};

/** Identifies our app to Steam; set `PUBLIC_IMPRESSUM_URL` to your public imprint/legal notice URL (https…). */
function steamStoreUserAgent(): string {
  const imprint = process.env['PUBLIC_IMPRESSUM_URL']?.trim();
  const id = 'Pricefly/1.0';
  if (imprint && /^https?:\/\//i.test(imprint)) {
    return `Mozilla/5.0 (compatible; ${id}; +${imprint}`;
  }
  return `Mozilla/5.0 (compatible; ${id})`;
}

export async function fetchSteamProduct(
  appId: string,
  currencyIso: string,
): Promise<SteamProductInfo | null> {
  const cc = steamCurrencyToCc(currencyIso);
  const apiUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=${cc}&l=en`;
  const res = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': steamStoreUserAgent(),
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as SteamAppDetailsResponse;
  const entry = json[appId];
  if (!entry || !('success' in entry) || !entry.success || !('data' in entry)) return null;
  const data = entry.data;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) return null;
  if (data.is_free) {
    return { name, price: 0, currency: currencyIso.trim().toUpperCase() };
  }
  const po = data.price_overview;
  if (!po) return null;
  return {
    name,
    price: po.final / 100,
    currency: po.currency,
  };
}

export async function fetchSteamPrice(
  appId: string,
  currencyIso: string,
): Promise<{ price: number; currency: string } | null> {
  const p = await fetchSteamProduct(appId, currencyIso);
  if (!p) return null;
  return { price: p.price, currency: p.currency };
}

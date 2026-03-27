/** Map ASOS URL country prefix to API store code + default currency */
const COUNTRY_TO_STORE: Record<string, { store: string; currency: string }> = {
  de: { store: 'DE', currency: 'EUR' },
  fr: { store: 'FR', currency: 'EUR' },
  it: { store: 'IT', currency: 'EUR' },
  es: { store: 'ES', currency: 'EUR' },
  nl: { store: 'NL', currency: 'EUR' },
  se: { store: 'SE', currency: 'SEK' },
  dk: { store: 'DK', currency: 'DKK' },
  pl: { store: 'PL', currency: 'PLN' },
  au: { store: 'AU', currency: 'AUD' },
  us: { store: 'US', currency: 'USD' },
};

const DEFAULT_STORE = { store: 'US', currency: 'USD' };

export function parseAsosProductIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes('asos.com')) return null;
    const m = u.pathname.match(/\/prd\/(\d+)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function parseAsosCountry(url: string): { store: string; currency: string } {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const first = segments[0]?.toLowerCase();
    if (first && COUNTRY_TO_STORE[first]) return COUNTRY_TO_STORE[first];
  } catch {
    /* ignore */
  }
  return DEFAULT_STORE;
}

type AsosStockPriceResponse = Array<{
  productId: number;
  productPrice?: {
    current?: { value?: number; text?: string };
    previous?: { value?: number; text?: string };
    currency?: string;
  };
  isInStock?: boolean;
}>;

export type AsosProductInfo = {
  price: number;
  currency: string;
};

export async function fetchAsosPrice(
  productId: string,
  pageUrl: string,
  currencyOverride?: string,
): Promise<AsosProductInfo | null> {
  const { store, currency: defaultCurrency } = parseAsosCountry(pageUrl);
  const currency = currencyOverride ?? defaultCurrency;

  const apiUrl = `https://www.asos.com/api/product/catalogue/v4/stockprice?productIds=${encodeURIComponent(productId)}&store=${store}&currency=${currency}`;
  const res = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: pageUrl,
    },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as AsosStockPriceResponse;
  const entry = json.find((e) => String(e.productId) === productId);
  if (!entry?.productPrice?.current?.value) return null;

  return {
    price: entry.productPrice.current.value,
    currency: entry.productPrice.currency ?? currency,
  };
}

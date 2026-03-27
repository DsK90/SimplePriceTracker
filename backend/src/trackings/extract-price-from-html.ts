import * as cheerio from 'cheerio';
import { extractInstantGamingPriceFromHtml } from './instant-gaming';

export type PriceExtractSource =
  | 'meta_og'
  | 'microdata_meta'
  | 'microdata_text'
  | 'instant_gaming'
  | 'json_ld'
  | 'css_selector'
  | null;

/** Heuristic price extraction (no CSS selectors). */
export function extractListedPriceWithSource(html: string): {
  raw: string | null;
  source: PriceExtractSource;
} {
  const $ = cheerio.load(html);
  const meta =
    $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content');
  if (meta?.trim()) return { raw: meta.trim(), source: 'meta_og' };
  const microMeta = $('meta[itemprop="price"]').attr('content');
  if (microMeta?.trim()) return { raw: microMeta.trim(), source: 'microdata_meta' };
  const itempropPrice = $('[itemprop="price"]').not('meta').first().text().trim();
  if (itempropPrice) return { raw: itempropPrice, source: 'microdata_text' };
  const ig = extractInstantGamingPriceFromHtml(html);
  if (ig) return { raw: ig, source: 'instant_gaming' };
  const fromLd = extractPriceFromJsonLd($);
  if (fromLd) return { raw: fromLd, source: 'json_ld' };
  const fromCss = extractPriceFromCssSelectors($);
  if (fromCss) return { raw: fromCss, source: 'css_selector' };
  return { raw: null, source: null };
}

function expandJsonLdNodes(data: unknown): unknown[] {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) return data.flatMap(expandJsonLdNodes);
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const nested: unknown[] = [];
    if (Array.isArray(o['@graph'])) {
      nested.push(...o['@graph'].flatMap(expandJsonLdNodes));
    }
    if (Array.isArray(o['hasVariant'])) {
      nested.push(...o['hasVariant'].flatMap(expandJsonLdNodes));
    }
    return [...nested, data];
  }
  return [];
}

/**
 * Last-resort extraction via CSS selectors used by major retailers
 * whose pages have no structured data (LD+JSON / meta / microdata).
 */
function extractPriceFromCssSelectors($: cheerio.CheerioAPI): string | null {
  // Amazon: <span class="a-price-whole">229,</span><span class="a-price-fraction">00</span>
  const amzWhole = $('.a-price-whole').first().text().trim().replace(/[.,]$/, '');
  if (amzWhole) {
    const amzFraction = $('.a-price-fraction').first().text().trim();
    const combined = amzFraction ? `${amzWhole}.${amzFraction}` : amzWhole;
    if (/^\d[\d.,]*\d$|^\d+$/.test(combined)) return combined;
  }

  // Generic: element with data-price attribute
  const dataPrice = $('[data-price]').first().attr('data-price');
  if (dataPrice?.trim() && /[\d]/.test(dataPrice)) return dataPrice.trim();

  // Common CSS patterns across retail sites
  const selectors = [
    '.product-price .price',
    '.product-price',
    '.price-current',
    '.current-price',
    '[data-testid="current-price"]',
    '[data-testid="product-price"]',
    '.pdp-price',
    '.price-tag',
  ];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    const match = text.match(/([\d]+[.,]\d{2})/);
    if (match) return match[1];
  }

  return null;
}

function extractPriceFromJsonLd($: cheerio.CheerioAPI): string | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).html();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw.trim()) as unknown;
      const candidates = expandJsonLdNodes(data);
      for (const obj of candidates) {
        if (!obj || typeof obj !== 'object') continue;
        const o = obj as Record<string, unknown>;
        const type = o['@type'];
        const types = Array.isArray(type) ? type : type ? [type] : [];
        const isProductType = types.some(
          (x) =>
            x === 'Product' ||
            x === 'SoftwareApplication' ||
            x === 'IndividualProduct' ||
            x === 'ProductGroup' ||
            x === 'ProductModel',
        );
        if (!isProductType) continue;
        const offers = o['offers'];
        if (!offers) continue;
        const offerArr = Array.isArray(offers) ? offers : [offers];
        for (const off of offerArr) {
          if (!off || typeof off !== 'object') continue;
          const price = (off as Record<string, unknown>)['price'];
          if (typeof price === 'number' || typeof price === 'string') {
            const s = String(price).trim();
            if (s) return s;
          }
        }
      }
    } catch {
      /* invalid JSON-LD */
    }
  }
  return null;
}

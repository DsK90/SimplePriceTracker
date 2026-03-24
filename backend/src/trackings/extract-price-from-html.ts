import * as cheerio from 'cheerio';
import { extractInstantGamingPriceFromHtml } from './instant-gaming';

export type PriceExtractSource =
  | 'meta_og'
  | 'microdata_meta'
  | 'microdata_text'
  | 'instant_gaming'
  | 'json_ld'
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
  return { raw: null, source: null };
}

function expandJsonLdNodes(data: unknown): unknown[] {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) return data.flatMap(expandJsonLdNodes);
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const graph = o['@graph'];
    if (Array.isArray(graph)) {
      return [...graph.flatMap(expandJsonLdNodes), data];
    }
    return [data];
  }
  return [];
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
        if (
          !types.some(
            (x) => x === 'Product' || x === 'SoftwareApplication' || x === 'IndividualProduct',
          )
        ) {
          continue;
        }
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

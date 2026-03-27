import * as cheerio from 'cheerio';

const MAX_NAME = 200;
const MAX_COMPANY = 120;

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** Split "Product | Shop" / "Product – Shop" style titles */
function splitTitleAndSite(s: string): { product: string; company: string | null } {
  const t = s.trim();
  const splitRe = /\s+[\|\u2013\u2014\-]\s+|\s+-\s+/;
  const parts = t.split(splitRe).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { product: parts[0], company: parts[parts.length - 1] };
  }
  return { product: t, company: null };
}

function cleanDocumentTitle(t: string): string {
  let s = t.replace(/\s+/g, ' ').trim();
  const lower = s.toLowerCase();
  for (const suf of [
    ' | ikea',
    ' - ikea',
    ' | zalando',
    ' | amazon',
    ' | ebay',
  ]) {
    if (lower.endsWith(suf)) {
      s = s.slice(0, -suf.length).trim();
      break;
    }
  }
  return s;
}

/**
 * Strip leading store CTA verbs (e.g. German "Kaufe …", English "Buy …") from titles.
 * These often come from og:title / <title> and are not part of the actual product name.
 */
function sanitizeRetailProductTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim();
  // Whole leading phrase, case-insensitive; repeat in case of doubled junk.
  const leadingCta = [
    /^(?:kaufe|kaufen(?:\s+sie)?|jetzt\s+kaufen|bestelle|bestellen|hole\s+dir|hol\s+dir|entdecke|shoppe)\s+/iu,
    /^(?:buy|buy\s+now|shop\s+now|order\s+now|purchase|get)\s+/iu,
  ];
  for (let i = 0; i < 4; i++) {
    const before = t;
    for (const re of leadingCta) {
      t = t.replace(re, '').trim();
    }
    if (t === before) break;
  }
  return t;
}

function prettyHostname(hostname: string): string {
  const h = hostname.replace(/^www\./i, '').split('.')[0] ?? hostname;
  if (!h) return hostname;
  return h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
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

function brandToString(brand: unknown): string | null {
  if (typeof brand === 'string') return brand.trim() || null;
  if (brand && typeof brand === 'object' && 'name' in brand) {
    const n = (brand as { name?: unknown }).name;
    if (typeof n === 'string') return n.trim() || null;
  }
  return null;
}

function extractProductFromJsonLd($: cheerio.CheerioAPI): { name?: string; brand?: string } | null {
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
        const name = o['name'];
        const brand = brandToString(o['brand']);
        const n = typeof name === 'string' ? name.trim() : null;
        if (n || brand) return { name: n ?? undefined, brand: brand ?? undefined };
      }
    } catch {
      /* invalid JSON-LD */
    }
  }
  return null;
}

export function fallbackProductNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      const decoded = decodeURIComponent(last.replace(/\.html?$/i, ''));
      const words = decoded.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
      if (words) return truncate(words, MAX_NAME);
    }
    return truncate(prettyHostname(u.hostname), MAX_NAME);
  } catch {
    return 'Product';
  }
}

/**
 * Best-effort product title and store/brand from HTML + URL (Open Graph, JSON-LD, microdata, hostname).
 */
export function extractProductAndCompany(
  html: string,
  pageUrl: string,
): { productName: string | null; companyName: string | null } {
  const $ = cheerio.load(html);

  let productName: string | null = null;
  let companyName: string | null =
    $('meta[property="og:site_name"]').attr('content')?.trim() ||
    $('meta[name="application-name"]').attr('content')?.trim() ||
    null;

  const ld = extractProductFromJsonLd($);
  if (ld?.name) productName = ld.name;
  if (ld?.brand) companyName = companyName || ld.brand;

  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
  if (ogTitle) {
    const sp = splitTitleAndSite(ogTitle);
    if (!productName) productName = sp.product;
    if (!companyName && sp.company) companyName = sp.company;
  }

  const tw = $('meta[name="twitter:title"]').attr('content')?.trim();
  if (tw && !productName) {
    const sp = splitTitleAndSite(tw);
    productName = sp.product;
    if (!companyName && sp.company) companyName = sp.company;
  }

  if (!productName) {
    const ip = $('[itemprop="name"]').first();
    const txt = ip.text().trim();
    if (txt) productName = txt;
  }

  // Amazon: dedicated #productTitle element
  if (!productName) {
    const amzTitle = $('#productTitle').first().text().trim();
    if (amzTitle) productName = amzTitle;
  }

  const brandContent = $('meta[itemprop="brand"][content]').attr('content')?.trim();
  if (brandContent) companyName = companyName || brandContent;

  if (!productName) {
    const docTitle = $('title').first().text().trim();
    if (docTitle) productName = cleanDocumentTitle(docTitle);
  }

  if (!companyName) {
    try {
      companyName = prettyHostname(new URL(pageUrl).hostname);
    } catch {
      /* ignore */
    }
  }

  if (productName) {
    productName = sanitizeRetailProductTitle(productName);
    if (!productName) productName = null;
  }

  return {
    productName: productName ? truncate(productName, MAX_NAME) : null,
    companyName: companyName ? truncate(companyName, MAX_COMPANY) : null,
  };
}

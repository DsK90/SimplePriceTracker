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

/** Heuristic price extraction across structured data and CSS selectors. */
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
  const lowPriceMeta = $('meta[itemprop="lowPrice"]').attr('content')?.trim();
  if (lowPriceMeta && /[\d]/.test(lowPriceMeta))
    return { raw: lowPriceMeta, source: 'microdata_meta' };
  const itempropPrice = $('[itemprop="price"]').not('meta').first().text().trim();
  if (itempropPrice) return { raw: itempropPrice, source: 'microdata_text' };
  const ig = extractInstantGamingPriceFromHtml(html);
  if (ig) return { raw: ig, source: 'instant_gaming' };
  const fromLd = extractPriceFromJsonLd($);
  if (fromLd) return { raw: fromLd, source: 'json_ld' };
  const fromCss = extractPriceFromCssSelectors($, html);
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
    if (o['object'] && typeof o['object'] === 'object') {
      nested.push(...expandJsonLdNodes(o['object']));
    }
    return [...nested, data];
  }
  return [];
}

function firstPriceMatch($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = $(sel).first();
    const text = el.text().trim();
    const match = text.match(/([\d]+[.,]\d{2})/);
    if (match) return match[1];
    const content = el.attr('content')?.trim();
    if (content) {
      const cm = content.match(/([\d]+[.,]\d{2})/);
      if (cm) return cm[1];
    }
  }
  return null;
}

/**
 * Last-resort extraction via CSS selectors used by major retailers
 * whose pages have no structured data (LD+JSON / meta / microdata).
 */
function extractPriceFromCssSelectors(
  $: cheerio.CheerioAPI,
  html: string,
): string | null {
  // --- Amazon ---
  const amzContainers = [
    '#corePrice_feature_div',
    '#corePriceDisplay_desktop_feature_div',
    '#apex_desktop',
    '#newBuyBoxPrice',
    '#price_inside_buybox',
  ];
  for (const container of amzContainers) {
    const offscreen = $(`${container} .a-price .a-offscreen`).first().text().trim();
    if (offscreen) {
      const m = offscreen.match(/([\d]+[.,]\d{2})/);
      if (m) return m[1].replace(',', '.');
    }
    const whole = $(`${container} .a-price-whole`).first().text().trim().replace(/[.,]$/, '');
    if (whole) {
      const frac = $(`${container} .a-price-fraction`).first().text().trim();
      const combined = frac ? `${whole}.${frac}` : whole;
      if (/^\d[\d.,]*\d$|^\d+$/.test(combined)) return combined;
    }
  }

  // --- eBay ---
  const ebay = firstPriceMatch($, [
    '.x-price-primary span[itemprop="price"]',
    '.x-price-primary .ux-textspans',
    '[data-testid="x-price-primary"] .ux-textspans',
    '.x-buybox__price-section .ux-textspans',
    '#prcIsum',
    '#mm-saleDscPrc',
  ]);
  if (ebay) return ebay;

  // --- MediaMarkt / Saturn (MSX platform) ---
  const msx = firstPriceMatch($, [
    '[data-test="branded-price-whole-value"]',
    '[data-test="product-price"]',
    '[data-test="current-price"]',
    '.price--total',
    '.product-details__price',
    '[class*="StyledPriceTypo"]',
    '[class*="PriceBox"]',
  ]);
  if (msx) return msx;

  // --- Idealo (aggregator) ---
  const idealo = firstPriceMatch($, [
    '[data-testid="cheapest-price"]',
    '.productOffers-listItemOfferPrice',
    '.offerList-item-priceMain',
    '.price-module__price',
    '.oopStage-conditionButton-price-value',
  ]);
  if (idealo) return idealo;

  // --- Geizhals (aggregator) ---
  const gh = firstPriceMatch($, [
    '.variant__header__pricehistory__pricerange b',
    '.product__price__amount',
    '#product-detail-price-container .gh_price',
    '.offer__price',
    '.gh_price',
  ]);
  if (gh) return gh;

  // --- Kaufland marketplace ---
  const kl = firstPriceMatch($, [
    '[data-testid="offer-price"]',
    '.rd-price-information__price',
    '.a-price-buy-box .price',
    '.price-tag__price',
  ]);
  if (kl) return kl;

  // --- Cyberport ---
  const cp = firstPriceMatch($, [
    '.price--current',
    '.productDetails__price',
    '[data-price-amount]',
    '.product-price__current',
  ]);
  if (cp) return cp;

  // --- Alternate ---
  const alt = firstPriceMatch($, [
    '.price .price--normal',
    '.productPriceContainer .price',
    '#product-top-price .price',
    '.price-module__price',
  ]);
  if (alt) return alt;

  // --- Notebooksbilliger ---
  const nbb = firstPriceMatch($, [
    '.product-price__regular',
    '.pdp__price .price__amount',
    '.product-price--main',
    '.nbb-product-price__main',
  ]);
  if (nbb) return nbb;

  // --- Mindfactory ---
  const mf = firstPriceMatch($, [
    '#product_detail .pprice',
    '.product-price-container .price',
    '.ppricetag',
  ]);
  if (mf) return mf;

  // --- Caseking ---
  const ck = firstPriceMatch($, [
    '.product--price .price--default',
    '.product--price .price--content',
    '.artdetail-price .price',
  ]);
  if (ck) return ck;

  // --- Conrad ---
  const conrad = firstPriceMatch($, [
    '[data-testid="pdp-price"]',
    '.productDetailPrice__price',
    '.product-prices__price',
    '.price-tag--selling .price-tag__price-label',
  ]);
  if (conrad) return conrad;

  // --- Euronics ---
  const euronics = firstPriceMatch($, [
    '.product-price-container .product-price',
    '.price--primary',
    '.price-area .price',
  ]);
  if (euronics) return euronics;

  // --- Thomann ---
  const thomann = firstPriceMatch($, [
    '.product__price-primary .product__price',
    '.rs-prod-price',
    '.fx-typography-price-primary',
  ]);
  if (thomann) return thomann;

  // --- Hornbach ---
  const hornbach = firstPriceMatch($, [
    '[data-testid="article-price"]',
    '.article-price__price',
    '.price-tag .price',
  ]);
  if (hornbach) return hornbach;

  // --- OBI ---
  const obi = firstPriceMatch($, [
    '[data-testid="product-price"]',
    '.product-info__price-amount',
    '.mso-price__value',
    '.price-value',
  ]);
  if (obi) return obi;

  // --- Lidl ---
  const lidl = firstPriceMatch($, [
    '.m-price__price',
    '.buybox__price',
    '.pricebox__price',
    '[data-price]',
  ]);
  if (lidl) return lidl;

  // --- Zalando ---
  const zalando = firstPriceMatch($, [
    '[data-testid="pdp-price-reduced"]',
    '[data-testid="pdp-price"]',
    '.z-price-text',
    '.price_mainPrice .z-price',
    '.WELtj',
  ]);
  if (zalando) return zalando;

  // --- About You ---
  const ay = firstPriceMatch($, [
    '[data-testid="productPrice"]',
    '[class*="ProductPrice"]',
    '.product-price--sale',
    '.product-price--regular',
  ]);
  if (ay) return ay;

  // --- H&M ---
  const hm = firstPriceMatch($, [
    '.product-item-price .price-value',
    '.ProductPrice-module--productPrice',
    '[data-testid="product-price"]',
  ]);
  if (hm) return hm;

  // --- Decathlon ---
  const dec = firstPriceMatch($, [
    '.prc__active-price',
    '.product-price--main',
    '[data-testid="product-price"]',
  ]);
  if (dec) return dec;

  // --- Apple Store (DE) ---
  const apple = firstPriceMatch($, [
    '.rc-prices-currentprice',
    '.rc-prices-fullprice',
    '[data-autom="full-price"]',
    '[data-autom="current-price"]',
    '.as-price-currentprice',
    '.rf-bfe-buystrip-price',
  ]);
  if (apple) return apple;

  // --- Samsung Store ---
  const samsung = firstPriceMatch($, [
    '.PriceInfoArea__price-info-area__price',
    '.typePriceLarge .price',
    '[data-testid="product-price"]',
    '.product-buy__price',
  ]);
  if (samsung) return samsung;

  // --- Dell ---
  const dell = firstPriceMatch($, [
    '.ps-dell-price .dell-price',
    '.cf-dell-price .dell-price',
    '[data-testid="sharedPSPDellPrice"]',
    '.sticky-header-price',
    '.ps-top-price .dell-price',
  ]);
  if (dell) return dell;

  // --- Lenovo ---
  const lenovo = firstPriceMatch($, [
    '.price_box .final_price',
    '.pricingSummary-details__final-price',
    '.e-pricingSummary_finalPrice',
    '.product-hero-price .final-price',
    '.m-price_final',
  ]);
  if (lenovo) return lenovo;

  // --- Alza ---
  const alza = firstPriceMatch($, [
    '.price-box__price',
    '.priceDollar',
    '.price-box .c2',
    '#prices .price',
  ]);
  if (alza) return alza;

  // --- Generic: element with data-price attribute ---
  const dataPrice = $('[data-price]').first().attr('data-price');
  if (dataPrice?.trim() && /[\d]/.test(dataPrice)) return dataPrice.trim();

  // --- Generic patterns common across many retail platforms ---
  const generic = firstPriceMatch($, [
    '.product-price .price',
    '.product-price',
    '.price-current',
    '.current-price',
    '[data-testid="current-price"]',
    '[data-testid="product-price"]',
    '.pdp-price',
    '.price-tag',
    '.product-detail__price',
    '.product__price',
    '.buy-box__price',
    '.price--default',
    '.price--offer',
    '.offer-price',
    '.price-main',
    '.main-price',
    '.price-new',
    '.sale-price',
    '.special-price .price',
  ]);
  if (generic) return generic;

  return null;
}

function extractPriceFromOffer(off: Record<string, unknown>): string | null {
  const price = off['price'];
  if (typeof price === 'number' || typeof price === 'string') {
    const s = String(price).trim();
    if (s && /[\d]/.test(s)) return s;
  }
  const lowPrice = off['lowPrice'];
  if (typeof lowPrice === 'number' || typeof lowPrice === 'string') {
    const s = String(lowPrice).trim();
    if (s && /[\d]/.test(s)) return s;
  }
  const highPrice = off['highPrice'];
  if (
    lowPrice == null &&
    price == null &&
    (typeof highPrice === 'number' || typeof highPrice === 'string')
  ) {
    const s = String(highPrice).trim();
    if (s && /[\d]/.test(s)) return s;
  }
  return null;
}

const PRODUCT_LD_TYPES = new Set([
  'Product',
  'SoftwareApplication',
  'IndividualProduct',
  'ProductGroup',
  'ProductModel',
]);

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
        const isProductType = types.some((x) => PRODUCT_LD_TYPES.has(x as string));
        if (!isProductType) continue;
        const offers = o['offers'];
        if (!offers) continue;
        const offerArr = Array.isArray(offers) ? offers : [offers];
        for (const off of offerArr) {
          if (!off || typeof off !== 'object') continue;
          const result = extractPriceFromOffer(off as Record<string, unknown>);
          if (result) return result;
          const nested = (off as Record<string, unknown>)['offers'];
          if (nested) {
            const nestedArr = Array.isArray(nested) ? nested : [nested];
            for (const n of nestedArr) {
              if (!n || typeof n !== 'object') continue;
              const r = extractPriceFromOffer(n as Record<string, unknown>);
              if (r) return r;
            }
          }
        }
      }
    } catch {
      /* invalid JSON-LD */
    }
  }
  return null;
}

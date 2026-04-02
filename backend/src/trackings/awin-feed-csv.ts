/**
 * Minimal CSV parser (quoted fields, commas) for Awin product export files.
 * @see https://wiki.awin.com/index.php/Data_Feed_-_Field_List
 */

/** Yields one row at a time — avoids allocating a full `string[][]` (OOM on large feeds). */
export function* iterCsvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((cell) => cell.length > 0)) {
        yield row;
      }
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) {
    yield row;
  }
}

export function parseCsv(text: string): string[][] {
  return [...iterCsvRows(text)];
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

export type AwinFeedRow = {
  feedKey: string;
  advertiserId: string | null;
  advertiserName: string | null;
  awProductId: string | null;
  merchantProductId: string | null;
  ean: string | null;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  merchantDeepLink: string;
  imageUrl: string | null;
  category: string | null;
  categoryPath: string | null;
  brand: string | null;
  productModel: string | null;
  modelNumber: string | null;
  rrpPrice: number | null;
  basePrice: number | null;
  deliveryCost: number | null;
  imageUrl2: string | null;
  reviewsText: string | null;
  averageRating: number | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  awDeepLink: string | null;
  language: string | null;
  categoryId: string | null;
  dataFeedId: string | null;
  displayPriceRaw: string | null;
  /** Raw `store_price` from feed (sale price remains `price` / search_price). */
  storePrice: number | null;
  savingsPercent: number | null;
  savingAmount: number | null;
  promotionalText: string | null;
  feedProductUpdatedAt: Date | null;
  /** Single field for substring / token search in the API */
  searchText: string;
};

/** Build normalized search blob from feed fields (ids, title, description, URL slug text, extras). */
export function buildCatalogSearchText(parts: {
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  categoryPath: string | null;
  productModel: string | null;
  modelNumber: string | null;
  advertiserName: string | null;
  feedKey: string;
  advertiserId: string | null;
  merchantDeepLink: string;
  awProductId: string | null;
  merchantProductId: string | null;
  ean: string | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  averageRating: number | null;
  promotionalText: string | null;
  savingsPercent: number | null;
  savingAmount: number | null;
  extras: string[];
}): string {
  const chunks = [
    parts.title,
    parts.description,
    parts.brand,
    parts.category,
    parts.categoryPath,
    parts.productModel,
    parts.modelNumber,
    parts.advertiserName,
    parts.feedKey,
    parts.advertiserId,
    parts.awProductId,
    parts.merchantProductId,
    parts.ean,
    parts.merchantDeepLink,
    parts.stockStatus,
    parts.stockQuantity != null ? String(parts.stockQuantity) : null,
    parts.averageRating != null ? String(parts.averageRating) : null,
    parts.promotionalText,
    parts.savingsPercent != null ? String(parts.savingsPercent) : null,
    parts.savingAmount != null ? String(parts.savingAmount) : null,
    ...parts.extras,
  ];
  return chunks
    .filter((c) => c != null && String(c).trim().length > 0)
    .map((c) => String(c).trim())
    .join(' ');
}

function col(map: Record<string, number>, aliases: string[]): number | undefined {
  for (const a of aliases) {
    const i = map[a];
    if (i !== undefined) return i;
  }
  return undefined;
}

/** Parse optional decimal from feed cell (comma or dot). */
export function parseOptionalDecimal(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseOptionalInt(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/\s+/g, '').replace(/,/g, '');
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Awin star ratings are usually 0–5. */
export function parseStarRating(raw: string | undefined): number | null {
  const n = parseOptionalDecimal(raw);
  if (n == null) return null;
  if (n >= 0 && n <= 5) return Math.round(n * 100) / 100;
  return null;
}

const MAX_REVIEWS_CHARS = 48_000;
const MAX_PROMOTIONAL_CHARS = 12_000;

/** Parse Awin `last_updated` (ISO or common EU date). */
export function parseOptionalFeedDate(raw: string | undefined): Date | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d;
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const y = m[3];
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const d2 = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function pickSecondaryImageUrl(
  map: Record<string, number>,
  cells: string[],
  primary: string | null,
): string | null {
  const keys = [
    'alternate_image',
    'alternate_image_two',
    'alternate_image_three',
    'alternate_image_four',
    'aw_image_url',
    'merchant_image_url',
  ];
  for (const key of keys) {
    const i = map[key];
    if (i === undefined) continue;
    const u = (cells[i] ?? '').trim();
    if (u.startsWith('http') && u !== primary) return u;
  }
  return null;
}

/**
 * Stored in `rrpPrice`: list/compare-at price for discount UI when above sale price.
 * Prefer `rrp_price`; if missing or not above sale, use max of `store_price` / prior-price columns.
 */
export function pickCompareAtPrice(
  salePrice: number,
  rrp: number | null,
  store: number | null,
  productPriceOld: number | null,
): number | null {
  if (rrp != null && rrp > salePrice) return rrp;
  const alt: number[] = [];
  if (store != null && store > salePrice) alt.push(store);
  if (productPriceOld != null && productPriceOld > salePrice) alt.push(productPriceOld);
  if (alt.length === 0) return null;
  return Math.max(...alt);
}

/** When feed omits `saving` / `savings_percent`, derive from stored compare-at (`rrpPrice`) vs sale. */
export function deriveSavingsFromCompareAt(
  salePrice: number,
  compareAt: number | null,
): { savingsPercent: number | null; savingAmount: number | null } {
  if (compareAt == null || compareAt <= salePrice) {
    return { savingsPercent: null, savingAmount: null };
  }
  const savingAmount = Math.round((compareAt - salePrice) * 100) / 100;
  const savingsPercent =
    Math.round(((compareAt - salePrice) / compareAt) * 10000) / 100;
  return { savingsPercent, savingAmount };
}

/**
 * Map one data row using header indices from the first row of the feed.
 */
export function rowToAwinFeedRow(
  headers: string[],
  cells: string[],
): AwinFeedRow | { skip: true; reason: string } {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = normHeader(h);
    if (k) map[k] = i;
  });

  const advIdIdx = col(map, ['advertiser_id', 'advertiserid', 'merchant_id']);
  const prodIdIdx = col(map, ['aw_product_id', 'product_id', 'aw_productid']);
  const feedKeyIdx = col(map, ['feed_key', 'awin_feed_key', 'catalog_key']);

  let feedKey: string | null = null;
  if (feedKeyIdx !== undefined && cells[feedKeyIdx]?.trim()) {
    feedKey = cells[feedKeyIdx].trim();
  } else if (advIdIdx !== undefined && prodIdIdx !== undefined) {
    const a = cells[advIdIdx]?.trim() ?? '';
    const p = cells[prodIdIdx]?.trim() ?? '';
    if (a && p) feedKey = `${a}:${p}`;
  }
  if (!feedKey) return { skip: true, reason: 'missing_feed_key' };

  const titleIdx = col(map, ['product_name', 'aw_product_name', 'title', 'name']);
  const priceIdx = col(map, ['search_price', 'price', 'display_price', 'aw_deep_link_price']);
  const currencyIdx = col(map, ['currency']);
  const linkIdx = col(map, ['merchant_deep_link', 'aw_deep_link', 'deep_link', 'merchant_link']);

  const title = titleIdx !== undefined ? (cells[titleIdx] ?? '').trim() : '';
  const priceRaw = priceIdx !== undefined ? (cells[priceIdx] ?? '').trim().replace(',', '.') : '';
  const price = Number.parseFloat(priceRaw);
  const merchantDeepLink = linkIdx !== undefined ? (cells[linkIdx] ?? '').trim() : '';

  if (!title) return { skip: true, reason: 'missing_title' };
  if (!Number.isFinite(price) || price < 0) return { skip: true, reason: 'bad_price' };
  if (!merchantDeepLink || !merchantDeepLink.startsWith('http')) {
    return { skip: true, reason: 'bad_link' };
  }

  const descIdx = col(map, ['description', 'product_short_description']);
  const shortDescOnlyIdx = col(map, ['product_short_description']);
  // Prefer larger sources first to avoid blurry cards on desktop grids.
  const imgIdx = col(map, [
    'large_image',
    'alternate_image',
    'alternate_image_two',
    'alternate_image_three',
    'alternate_image_four',
    'aw_image_url',
    'merchant_image_url',
    'aw_thumb_url',
    'merchant_thumb_url',
  ]);
  const merchIdx = col(map, ['merchant_name', 'store_name']);
  const catNameIdx = col(map, ['category_name', 'merchant_category']);
  const catPathIdx = col(map, ['merchant_product_category_path']);
  const brandIdx = col(map, ['brand_name', 'brand']);
  const mpIdx = col(map, ['merchant_product_id', 'merchant_sku']);
  const eanIdx = col(map, ['ean', 'product_gtin', 'upc']);
  const productModelIdx = col(map, ['product_model']);
  const modelNumberIdx = col(map, ['model_number', 'mpn']);
  const rrpIdx = col(map, ['rrp_price']);
  const storeIdx = col(map, ['store_price']);
  const oldPriceIdx = col(map, ['product_price_old', 'was_price']);
  const basePriceIdx = col(map, ['base_price', 'base_price_amount']);
  const deliveryIdx = col(map, ['delivery_cost']);
  const kwIdx = col(map, ['keywords']);
  const specIdx = col(map, ['specifications']);
  const promoIdx = col(map, ['promotional_text']);
  const awDeepIdx = col(map, ['aw_deep_link']);
  const languageIdx = col(map, ['language']);
  const categoryIdIdx = col(map, ['category_id']);
  const dataFeedIdIdx = col(map, ['data_feed_id']);
  const displayPriceIdx = col(map, ['display_price']);
  const lastUpdatedIdx = col(map, ['last_updated']);
  const reviewsIdx = col(map, ['reviews']);
  const avgRatingIdx = col(map, ['average_rating', 'rating']);
  const numberAvailableIdx = col(map, ['number_available']);
  const inStockIdx = col(map, ['in_stock']);
  const savingsPercentIdx = col(map, ['savings_percent']);
  const savingEuroIdx = col(map, ['saving']);

  const awProductId = prodIdIdx !== undefined ? (cells[prodIdIdx]?.trim() || null) : null;
  const merchantProductId = mpIdx !== undefined ? (cells[mpIdx]?.trim() || null) : null;

  let ean: string | null = null;
  if (eanIdx !== undefined) {
    const v = (cells[eanIdx] ?? '').trim();
    if (v) ean = v;
  }

  const description = descIdx !== undefined ? (cells[descIdx] ?? '').trim() || null : null;

  const extras: string[] = [];
  if (
    shortDescOnlyIdx !== undefined &&
    descIdx !== undefined &&
    shortDescOnlyIdx !== descIdx
  ) {
    const sd = (cells[shortDescOnlyIdx] ?? '').trim();
    if (sd) extras.push(sd);
  }
  for (const idx of [kwIdx, specIdx]) {
    if (idx === undefined) continue;
    const v = (cells[idx] ?? '').trim();
    if (v) extras.push(v);
  }

  const advertiserId = advIdIdx !== undefined ? (cells[advIdIdx]?.trim() || null) : null;
  const advertiserName = merchIdx !== undefined ? (cells[merchIdx]?.trim() || null) : null;
  const imageUrl = imgIdx !== undefined ? (cells[imgIdx]?.trim() || null) : null;
  const imageUrl2 = pickSecondaryImageUrl(map, cells, imageUrl);
  const category = catNameIdx !== undefined ? (cells[catNameIdx]?.trim() || null) : null;
  const categoryPath = catPathIdx !== undefined ? (cells[catPathIdx]?.trim() || null) : null;
  const brand = brandIdx !== undefined ? (cells[brandIdx]?.trim() || null) : null;
  const productModel =
    productModelIdx !== undefined ? (cells[productModelIdx]?.trim() || null) : null;
  const modelNumber =
    modelNumberIdx !== undefined ? (cells[modelNumberIdx]?.trim() || null) : null;
  const rrpParsed = rrpIdx !== undefined ? parseOptionalDecimal(cells[rrpIdx]) : null;
  const storeParsed = storeIdx !== undefined ? parseOptionalDecimal(cells[storeIdx]) : null;
  const oldParsed = oldPriceIdx !== undefined ? parseOptionalDecimal(cells[oldPriceIdx]) : null;
  const rrpPrice = pickCompareAtPrice(price, rrpParsed, storeParsed, oldParsed);
  const basePrice = basePriceIdx !== undefined ? parseOptionalDecimal(cells[basePriceIdx]) : null;
  const deliveryCost = deliveryIdx !== undefined ? parseOptionalDecimal(cells[deliveryIdx]) : null;

  let savingsPercentOut =
    savingsPercentIdx !== undefined ? parseOptionalDecimal(cells[savingsPercentIdx]) : null;
  let savingAmountOut =
    savingEuroIdx !== undefined ? parseOptionalDecimal(cells[savingEuroIdx]) : null;

  const feedHasSavings =
    (savingsPercentOut != null && savingsPercentOut > 0) ||
    (savingAmountOut != null && savingAmountOut > 0);

  if (!feedHasSavings) {
    const derived = deriveSavingsFromCompareAt(price, rrpPrice);
    savingsPercentOut = derived.savingsPercent;
    savingAmountOut = derived.savingAmount;
  }

  const reviewsRaw = reviewsIdx !== undefined ? (cells[reviewsIdx] ?? '').trim() : '';
  let reviewsText: string | null = null;
  if (reviewsRaw) {
    reviewsText =
      reviewsRaw.length > MAX_REVIEWS_CHARS
        ? reviewsRaw.slice(0, MAX_REVIEWS_CHARS)
        : reviewsRaw;
  }

  const stockStatus =
    inStockIdx !== undefined
      ? (cells[inStockIdx] ?? '').trim().slice(0, 128) || null
      : null;
  const stockQuantity =
    numberAvailableIdx !== undefined ? parseOptionalInt(cells[numberAvailableIdx]) : null;

  const averageRating =
    avgRatingIdx !== undefined ? parseStarRating(cells[avgRatingIdx]) : null;

  const awDeepRaw = awDeepIdx !== undefined ? (cells[awDeepIdx] ?? '').trim() : '';
  const awDeepLink =
    awDeepRaw.startsWith('http') ? awDeepRaw.slice(0, 8000) : null;

  const language =
    languageIdx !== undefined
      ? (cells[languageIdx] ?? '').trim().slice(0, 16) || null
      : null;
  const categoryId =
    categoryIdIdx !== undefined
      ? (cells[categoryIdIdx] ?? '').trim().slice(0, 64) || null
      : null;
  const dataFeedId =
    dataFeedIdIdx !== undefined
      ? (cells[dataFeedIdIdx] ?? '').trim().slice(0, 32) || null
      : null;
  const displayPriceRaw =
    displayPriceIdx !== undefined
      ? (cells[displayPriceIdx] ?? '').trim().slice(0, 512) || null
      : null;

  const storePriceRaw = storeIdx !== undefined ? parseOptionalDecimal(cells[storeIdx]) : null;

  let promotionalText: string | null = null;
  if (promoIdx !== undefined) {
    const pr = (cells[promoIdx] ?? '').trim();
    if (pr) {
      promotionalText =
        pr.length > MAX_PROMOTIONAL_CHARS ? pr.slice(0, MAX_PROMOTIONAL_CHARS) : pr;
    }
  }

  const feedProductUpdatedAt =
    lastUpdatedIdx !== undefined ? parseOptionalFeedDate(cells[lastUpdatedIdx]) : null;

  const searchText = buildCatalogSearchText({
    title,
    description,
    brand,
    category,
    categoryPath,
    productModel,
    modelNumber,
    advertiserName,
    feedKey,
    advertiserId,
    merchantDeepLink,
    awProductId,
    merchantProductId,
    ean,
    stockStatus,
    stockQuantity,
    averageRating,
    promotionalText,
    savingsPercent: savingsPercentOut,
    savingAmount: savingAmountOut,
    extras,
  });

  return {
    feedKey,
    advertiserId,
    advertiserName,
    awProductId,
    merchantProductId,
    ean,
    title,
    description,
    price,
    currency:
      currencyIdx !== undefined && cells[currencyIdx]?.trim()
        ? cells[currencyIdx].trim().toUpperCase().slice(0, 8)
        : 'EUR',
    merchantDeepLink,
    imageUrl,
    imageUrl2,
    category,
    categoryPath,
    brand,
    productModel,
    modelNumber,
    rrpPrice,
    basePrice,
    deliveryCost,
    reviewsText,
    averageRating,
    stockStatus,
    stockQuantity,
    awDeepLink,
    language,
    categoryId,
    dataFeedId,
    displayPriceRaw,
    storePrice: storePriceRaw,
    savingsPercent: savingsPercentOut,
    savingAmount: savingAmountOut,
    promotionalText,
    feedProductUpdatedAt,
    searchText,
  };
}

export function parseAwinFeedRows(csvText: string): {
  rows: AwinFeedRow[];
  skipped: number;
} {
  const it = iterCsvRows(csvText.trim());
  const first = it.next();
  if (first.done) return { rows: [], skipped: 0 };
  const headers = first.value;
  const rows: AwinFeedRow[] = [];
  let skipped = 0;
  for (const cells of it) {
    if (!cells || cells.every((c) => !String(c).trim())) {
      skipped++;
      continue;
    }
    const out = rowToAwinFeedRow(headers, cells);
    if ('skip' in out) {
      skipped++;
      continue;
    }
    rows.push(out);
  }
  return { rows, skipped };
}

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
  const basePriceIdx = col(map, ['base_price']);
  const deliveryIdx = col(map, ['delivery_cost']);
  const kwIdx = col(map, ['keywords']);
  const specIdx = col(map, ['specifications']);
  const promoIdx = col(map, ['promotional_text']);
  const reviewsIdx = col(map, ['reviews']);
  const avgRatingIdx = col(map, ['average_rating']);
  const numberAvailableIdx = col(map, ['number_available']);

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
  for (const idx of [
    kwIdx,
    specIdx,
    promoIdx,
    reviewsIdx,
    avgRatingIdx,
    numberAvailableIdx,
  ]) {
    if (idx === undefined) continue;
    const v = (cells[idx] ?? '').trim();
    if (v) extras.push(v);
  }

  const advertiserId = advIdIdx !== undefined ? (cells[advIdIdx]?.trim() || null) : null;
  const advertiserName = merchIdx !== undefined ? (cells[merchIdx]?.trim() || null) : null;
  const imageUrl = imgIdx !== undefined ? (cells[imgIdx]?.trim() || null) : null;
  const category = catNameIdx !== undefined ? (cells[catNameIdx]?.trim() || null) : null;
  const categoryPath = catPathIdx !== undefined ? (cells[catPathIdx]?.trim() || null) : null;
  const brand = brandIdx !== undefined ? (cells[brandIdx]?.trim() || null) : null;
  const productModel =
    productModelIdx !== undefined ? (cells[productModelIdx]?.trim() || null) : null;
  const modelNumber =
    modelNumberIdx !== undefined ? (cells[modelNumberIdx]?.trim() || null) : null;
  const rrpPrice = rrpIdx !== undefined ? parseOptionalDecimal(cells[rrpIdx]) : null;
  const basePrice = basePriceIdx !== undefined ? parseOptionalDecimal(cells[basePriceIdx]) : null;
  const deliveryCost = deliveryIdx !== undefined ? parseOptionalDecimal(cells[deliveryIdx]) : null;

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
    category,
    categoryPath,
    brand,
    productModel,
    modelNumber,
    rrpPrice,
    basePrice,
    deliveryCost,
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

/**
 * Minimal CSV parser (quoted fields, commas) for Awin product export files.
 * @see https://wiki.awin.com/index.php/Data_Feed_-_Field_List
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
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
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

export type AwinFeedRow = {
  feedKey: string;
  advertiserId: string | null;
  advertiserName: string | null;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  merchantDeepLink: string;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
};

function col(map: Record<string, number>, aliases: string[]): number | undefined {
  for (const a of aliases) {
    const i = map[a];
    if (i !== undefined) return i;
  }
  return undefined;
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

  const advIdIdx = col(map, ['advertiser_id', 'advertiserid']);
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
  const imgIdx = col(map, ['aw_image_url', 'merchant_image_url', 'large_image']);
  const merchIdx = col(map, ['merchant_name', 'store_name']);
  const catIdx = col(map, ['category_name', 'merchant_product_category_path']);
  const brandIdx = col(map, ['brand_name', 'brand']);

  return {
    feedKey,
    advertiserId: advIdIdx !== undefined ? (cells[advIdIdx]?.trim() || null) : null,
    advertiserName: merchIdx !== undefined ? (cells[merchIdx]?.trim() || null) : null,
    title,
    description: descIdx !== undefined ? (cells[descIdx]?.trim() || null) : null,
    price,
    currency:
      currencyIdx !== undefined && cells[currencyIdx]?.trim()
        ? cells[currencyIdx].trim().toUpperCase().slice(0, 8)
        : 'EUR',
    merchantDeepLink,
    imageUrl: imgIdx !== undefined ? (cells[imgIdx]?.trim() || null) : null,
    category: catIdx !== undefined ? (cells[catIdx]?.trim() || null) : null,
    brand: brandIdx !== undefined ? (cells[brandIdx]?.trim() || null) : null,
  };
}

export function parseAwinFeedRows(csvText: string): {
  rows: AwinFeedRow[];
  skipped: number;
} {
  const table = parseCsv(csvText.trim());
  if (table.length < 2) return { rows: [], skipped: 0 };
  const headers = table[0];
  const rows: AwinFeedRow[] = [];
  let skipped = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
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

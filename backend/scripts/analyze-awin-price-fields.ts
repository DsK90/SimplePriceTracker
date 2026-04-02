/**
 * Stats for price/discount columns in the configured Awin gzip feed.
 * npx tsx scripts/analyze-awin-price-fields.ts [maxRows]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s
    .trim()
    .replace(/€|EUR|eur|\s/g, '')
    .replace(/(\d)\.(\d{3})\b/g, '$1$2')
    .replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function nonempty(s: string | undefined): boolean {
  return s != null && String(s).trim().length > 0;
}

function readFeedUrl(): string {
  const p = path.join(process.cwd(), 'config', 'awin-feeds.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { sources: { url: string; enabled?: boolean }[] };
  const s = j.sources.find((x) => x.enabled !== false);
  if (!s?.url) throw new Error('No enabled source in config/awin-feeds.json');
  return s.url;
}

async function main() {
  const maxRows = Math.min(150_000, Math.max(5000, Number.parseInt(process.argv[2] ?? '60000', 10) || 60_000));
  const url = readFeedUrl();

  const stats = {
    sampleRows: 0,
    nonempty: {
      search_price: 0,
      display_price: 0,
      store_price: 0,
      rrp_price: 0,
      product_price_old: 0,
      saving: 0,
      savings_percent: 0,
      base_price: 0,
      base_price_amount: 0,
    },
    vsSearchPrice: {
      rrpGt: 0,
      storeGt: 0,
      oldGt: 0,
      anyCompareGt: 0,
    },
    promoFields: {
      savingPositive: 0,
      savingsPercentPositive: 0,
      savingMatchesRrpDelta: 0,
      savingChecked: 0,
    },
  };

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const nodeIn = Readable.fromWeb(res.body as import('stream/web').ReadableStream<Uint8Array>);
  const gunzip = createGunzip();
  const parser = parse({
    columns: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });

  let loggedHeaders = false;

  await new Promise<void>((resolve) => {
    const onRow = (row: Record<string, string>) => {
      if (!loggedHeaders) {
        loggedHeaders = true;
        const keys = Object.keys(row);
        const priceish = keys.filter((k) => /price|saving|rrp|display|base/i.test(k));
        console.log('CSV columns (price-related):', priceish.join(', ') || '(none matched filter)');
        console.log('Total columns:', keys.length);
      }
      if (stats.sampleRows >= maxRows) return;
      stats.sampleRows++;

      const sp = num(row.search_price);
      if (sp == null || sp <= 0) return;

      for (const k of Object.keys(stats.nonempty) as (keyof typeof stats.nonempty)[]) {
        if (nonempty(row[k])) stats.nonempty[k]++;
      }

      const rrp = num(row.rrp_price);
      const st = num(row.store_price);
      const oldp = num(row.product_price_old);
      if (rrp != null && rrp > sp) stats.vsSearchPrice.rrpGt++;
      if (st != null && st > sp) stats.vsSearchPrice.storeGt++;
      if (oldp != null && oldp > sp) stats.vsSearchPrice.oldGt++;
      if ((rrp != null && rrp > sp) || (st != null && st > sp) || (oldp != null && oldp > sp)) {
        stats.vsSearchPrice.anyCompareGt++;
      }

      const sav = num(row.saving);
      const pct = num(row.savings_percent);
      if (sav != null && sav > 0) stats.promoFields.savingPositive++;
      if (pct != null && pct > 0) stats.promoFields.savingsPercentPositive++;

      if (rrp != null && rrp > sp && sav != null && sav > 0) {
        stats.promoFields.savingChecked++;
        if (Math.abs(rrp - sp - sav) < 0.02 || Math.abs(rrp - sp - sav) / rrp < 0.02) {
          stats.promoFields.savingMatchesRrpDelta++;
        }
      }

      if (stats.sampleRows >= maxRows) {
        parser.off('data', onRow);
        nodeIn.destroy();
        gunzip.destroy();
        setImmediate(() => resolve());
      }
    };

    parser.on('data', onRow);
    parser.on('end', () => resolve());
    parser.on('error', () => resolve());
    nodeIn.on('error', () => resolve());
    gunzip.on('error', () => resolve());
    nodeIn.pipe(gunzip).pipe(parser);
  });

  const n = stats.sampleRows;
  const pct = (c: number) => (n ? ((100 * c) / n).toFixed(2) : '0') + '% of rows';

  console.log('Feed URL (truncated):', url.slice(0, 90) + '…');
  console.log('Sample rows:', n);
  console.log('\nNon-empty (among rows with valid search_price parsed): counts are over full sample; see percentages vs total rows.');
  console.log('Non-empty field counts:', stats.nonempty);
  console.log('\nCompare-at vs search_price (numeric):');
  console.log({ ...stats.vsSearchPrice, note: pct(stats.vsSearchPrice.anyCompareGt) + ' have any list price > search' });
  console.log('\nAwin promo columns:');
  console.log({
    ...stats.promoFields,
    savingAlignsWithRrpMinusSearch:
      stats.promoFields.savingChecked > 0
        ? `${((100 * stats.promoFields.savingMatchesRrpDelta) / stats.promoFields.savingChecked).toFixed(1)}% of rows with rrp>search and saving>0`
        : 'n/a',
  });
  console.log('\n--- Interpretation ---');
  console.log(
    'search_price: primary sale/tracking price (used as product price in app).',
  );
  console.log(
    'display_price: often formatted text; app prefers search_price (see priceIdx order in awin-feed-csv).',
  );
  console.log(
    'Discount UI in app uses DB rrpPrice = pickCompareAt(rrp, store, product_price_old) vs price.',
  );
  console.log(
    'saving / savings_percent: not stored in DB today; only folded into searchText for search.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

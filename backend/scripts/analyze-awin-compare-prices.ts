/**
 * Count how often compare-at columns exceed search_price (streamed CSV).
 * Usage: npx tsx scripts/analyze-awin-compare-prices.ts [path-to.csv]
 */
import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const path = process.argv[2] ?? './data/awin/expert-de/latest.csv';
  const stream = createReadStream(path, { encoding: 'utf8' }).pipe(
    parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    }),
  );

  const stats = {
    total: 0,
    validPrice: 0,
    rrpGtSearch: 0,
    storeGtSearch: 0,
    oldGtSearch: 0,
    anyCompareGtSearch: 0,
    gainFromStoreOrOld: 0,
  };

  for await (const row of stream) {
    const r = row as Record<string, string>;
    stats.total++;
    const sp = num(r.search_price);
    if (sp == null || sp <= 0) continue;
    stats.validPrice++;

    const rrp = num(r.rrp_price);
    const store = num(r.store_price);
    const oldp = num(r.product_price_old);

    const rrpOk = rrp != null && rrp > sp;
    const storeOk = store != null && store > sp;
    const oldOk = oldp != null && oldp > sp;

    if (rrpOk) stats.rrpGtSearch++;
    if (storeOk) stats.storeGtSearch++;
    if (oldOk) stats.oldGtSearch++;

    if (rrpOk || storeOk || oldOk) {
      stats.anyCompareGtSearch++;
      if (!rrpOk && (storeOk || oldOk)) stats.gainFromStoreOrOld++;
    }
  }

  console.log('File:', path);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

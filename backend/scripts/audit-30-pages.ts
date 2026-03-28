/**
 * Tests 30+ real product pages using the actual app extraction pipeline.
 * Run: npx tsx scripts/audit-30-pages.ts
 */
import { parsePriceFromText } from '../src/trackings/price-parse';
import { extractListedPriceWithSource } from '../src/trackings/extract-price-from-html';
import { extractProductAndCompany } from '../src/trackings/extract-product-metadata';
import { fetchSteamProduct, parseSteamAppIdFromUrl } from '../src/trackings/steam-store';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua': '"Chromium";v="120", "Not_A Brand";v="8", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
};

type Row = { shop: string; url: string };

const PAGES: Row[] = [
  // H&M (bot-protected)
  { shop: 'H&M DE', url: 'https://www2.hm.com/de_de/productpage.1323366001.html' },

  // Steam (should use API)
  { shop: 'Steam', url: 'https://store.steampowered.com/app/1771300/Kingdom_Come_Deliverance_II/' },

  // Sites that should work with structured data
  { shop: 'Nike DE', url: 'https://www.nike.com/de/t/air-force-1-07-herrenschuh-5QMjNf/CW2288-111' },
  { shop: 'C&A DE', url: 'https://www.c-and-a.com/de/de/shop/basic-t-shirt-2239938/1' },
  { shop: 'GOG', url: 'https://www.gog.com/en/game/the_witcher_3_wild_hunt' },
  { shop: 'ARLT', url: 'https://www.arlt.com/Notebook/Notebooks/GreenIT-Refurbished/T1A-Lenovo-ThinkPad-X1-Yoga-Gen-5-Refurbished-Full-HD-14-Zoll-Notebook.html' },
  { shop: 'Zooplus DE', url: 'https://www.zooplus.de/shop/katzen/katzenfutter_trockenfutter/royal_canin_katzenfutter/royal_canin_indoor/130394' },
  { shop: 'Instant Gaming', url: 'https://www.instant-gaming.com/de/8988-kaufen-kingdom-come-deliverance-ii-pc-steam/' },

  // More real product URLs
  { shop: 'Amazon DE', url: 'https://www.amazon.de/dp/B0CHX3DDHM' },
  { shop: 'eBay DE', url: 'https://www.ebay.de/itm/123456789' },
  { shop: 'Otto DE', url: 'https://www.otto.de/p/jack-jones-t-shirt-herren-S0M1Y0CJ/' },
  { shop: 'Adidas DE', url: 'https://www.adidas.de/samba-og-schuh/B75806.html' },
  { shop: 'Puma DE', url: 'https://eu.puma.com/de/de/pd/suede-classic-xxi-sneakers/374915.html' },
  { shop: 'Bergfreunde', url: 'https://www.bergfreunde.de/ortovox-fleece-light-jacket-fleecejacke/' },

  // Sites likely needing JS (expected to fail)
  { shop: 'IKEA DE', url: 'https://www.ikea.com/de/de/p/kallax-regal-schwarzbraun-s29047437/' },
  { shop: 'Zalando DE', url: 'https://www.zalando.de/adidas-originals-samba-og-sneaker-low-cloud-whitecorblacgum-ad121a0f4-a11.html' },
  { shop: 'Saturn DE', url: 'https://www.saturn.de/de/product/_apple-iphone-16-128-gb-3001414.html' },
  { shop: 'MediaMarkt DE', url: 'https://www.mediamarkt.de/de/product/_apple-iphone-16-128-gb-3001414.html' },
  { shop: 'Bonprix DE', url: 'https://www.bonprix.de/produkt/maxi-shirt-weiss-926429/' },
  { shop: 'dm DE', url: 'https://www.dm.de/nivea-tagespflege-essentials-feuchtigkeit-und-frische-tagesfluid-lsf-15-p4005808918638.html' },
  { shop: 'AboutYou DE', url: 'https://www.aboutyou.de/p/levis/501-original-jeans-9795089' },
  { shop: 'Rossmann DE', url: 'https://www.rossmann.de/de/pflege-und-duft-nivea-men-creme-150-ml/p/4005808089802' },
  { shop: 'Douglas DE', url: 'https://www.douglas.de/de/p/5013590072' },
  { shop: 'Deichmann DE', url: 'https://www.deichmann.com/de-de/p-sneaker-damen-12085302' },
  { shop: 'Thalia DE', url: 'https://www.thalia.de/shop/home/artikeldetails/A1070551675' },
  { shop: 'Hornbach DE', url: 'https://www.hornbach.de/p/bosch-professional-akku-bohrschrauber-gsr-12v-35-inkl-2x-akku-2-0-ah-und-ladegeraet-in-l-boxx/10468816/' },
  { shop: 'Alternate DE', url: 'https://www.alternate.de/Apple/iPhone-16-128-GB-Smartphone/html/product/100100988' },
  { shop: 'Decathlon DE', url: 'https://www.decathlon.de/p/rucksack-wandern-nh-arpenaz-100-10-liter/_/R-p-2250' },
];

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch {
    return { ok: false, status: 0, html: '' };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Auditing ${PAGES.length} pages with improved extraction pipeline\n`);

  const results: {
    shop: string;
    http: number;
    source: string;
    product: string;
    parsed: number | null;
    raw: string;
    detect: 'yes' | 'no' | 'parse_fail' | 'bot_block';
  }[] = [];

  for (const p of PAGES) {
    // Steam API
    const steamAppId = parseSteamAppIdFromUrl(p.url);
    if (steamAppId) {
      const steam = await fetchSteamProduct(steamAppId, 'EUR');
      if (steam) {
        results.push({
          shop: p.shop, http: 200, source: 'steam_api',
          product: steam.name.slice(0, 40), parsed: steam.price,
          raw: `${steam.price} ${steam.currency}`, detect: 'yes',
        });
      } else {
        results.push({ shop: p.shop, http: 0, source: 'steam_api', product: '—', parsed: null, raw: '', detect: 'no' });
      }
      await sleep(300);
      continue;
    }

    // Generic HTML extraction
    const { ok, status, html } = await fetchHtml(p.url);
    if (!ok || html.length < 500) {
      results.push({ shop: p.shop, http: status, source: '—', product: '—', parsed: null, raw: '', detect: 'no' });
      await sleep(300);
      continue;
    }

    // Check for bot challenge pages
    const isChallenge = html.includes('sec-if-cpt-container') || 
                        (html.length < 5000 && html.includes('challenge'));
    
    const { raw, source } = extractListedPriceWithSource(html);
    const meta = extractProductAndCompany(html, p.url);
    const parsed = raw ? parsePriceFromText(raw) : null;

    let detect: 'yes' | 'no' | 'parse_fail' | 'bot_block' = 'no';
    if (isChallenge && !raw) detect = 'bot_block';
    else if (raw && parsed !== null) detect = 'yes';
    else if (raw) detect = 'parse_fail';

    results.push({
      shop: p.shop, http: status, source: source ?? '—',
      product: (meta.productName ?? '—').slice(0, 40),
      parsed, raw: raw ? raw.slice(0, 30) : '', detect,
    });
    await sleep(300);
  }

  const yes = results.filter((r) => r.detect === 'yes').length;
  const no = results.filter((r) => r.detect === 'no').length;
  const pf = results.filter((r) => r.detect === 'parse_fail').length;
  const bot = results.filter((r) => r.detect === 'bot_block').length;

  console.log('shop'.padEnd(20) + '| HTTP | source'.padEnd(20) + '| price'.padEnd(14) + '| product name');
  console.log('-'.repeat(100));
  for (const r of results) {
    const icon = r.detect === 'yes' ? '✓' : r.detect === 'bot_block' ? '🛡' : r.detect === 'parse_fail' ? '⚠' : '✗';
    const line = `${icon} ${r.shop.padEnd(18)}| ${String(r.http).padEnd(5)}| ${(r.source ?? '—').padEnd(18)}| ${(r.parsed !== null ? String(r.parsed) : '—').padEnd(12)}| ${r.product}`;
    console.log(line);
  }

  console.log('\n--- Summary ---');
  console.log(`Total: ${results.length}`);
  console.log(`✓ Price detected + parsed: ${yes}`);
  console.log(`🛡 Bot-blocked (JS required): ${bot}`);
  console.log(`✗ No structured price: ${no}`);
  console.log(`⚠ Raw found but parse failed: ${pf}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

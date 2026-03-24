/**
 * Fetches many retailer product pages (not Amazon) and checks whether the app's
 * generic HTML price extraction finds a parseable price.
 *
 * Run: npx tsx scripts/audit-retail-pages.ts
 */
import { parsePriceFromText } from '../src/trackings/price-parse';
import { extractListedPriceWithSource } from '../src/trackings/extract-price-from-html';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Row = { shop: string; label: string; url: string };

/** 55+ distinct product/detail pages across many retailers (Amazon excluded). */
const PAGES: Row[] = [
  { shop: 'IKEA DE', label: 'KALLAX', url: 'https://www.ikea.com/de/de/p/kallax-regal-schwarzbraun-s29047437/' },
  { shop: 'IKEA UK', label: 'BILLY', url: 'https://www.ikea.com/gb/en/p/billy-bookcase-white-s39017808/' },
  { shop: 'H&M DE', label: 'T-shirt', url: 'https://www2.hm.com/de_de/productpage.0570000001.html' },
  { shop: 'Zara DE', label: 'Knit', url: 'https://www.zara.com/de/en/knit-sweater-p00000000.html' },
  { shop: 'ASOS', label: 'Jeans', url: 'https://www.asos.com/asos-design/asos-design-relaxed-tapered-jeans-in-washed-black/prd/20469978' },
  { shop: 'Cider', label: 'Dress', url: 'https://www.shopcider.com/product/mini-dress-123456' },
  { shop: 'C&A DE', label: 'Jeans', url: 'https://www.c-and-a.com/de/de/shop/damen-jeans' },
  { shop: 'Marktkauf', label: 'Accessory', url: 'https://www.marktkauf.de/aplic-tablet-tastatur-kunstledercase-fuer-ipad-pro-10-5-bluetooth-keyboard-mit-apple-layout/produkt-2659841000' },
  { shop: 'Saturn DE', label: 'Product', url: 'https://www.saturn.de/de/product/_apple-iphone-15-2911935.html' },
  { shop: 'MediaMarkt DE', label: 'Product', url: 'https://www.mediamarkt.de/de/product/_samsung-galaxy-s24-2958444.html' },
  { shop: 'Zalando DE', label: 'Shoes', url: 'https://www.zalando.de/adidas-originals-samba-vegan-sneaker-low-core-black-cloud-white-gum-ad121a0f4-q11.html' },
  { shop: 'Otto DE', label: 'Sofa', url: 'https://www.otto.de/p/couch-123456789/' },
  { shop: 'Douglas DE', label: 'Fragrance', url: 'https://www.douglas.de/de/p/3000001234' },
  { shop: 'Decathlon DE', label: 'Bike', url: 'https://www.decathlon.de/p/rockrider-st-100/301653' },
  { shop: 'Nike DE', label: 'Shoes', url: 'https://www.nike.com/de/t/air-max-90-shoes-123456' },
  { shop: 'Adidas DE', label: 'Sneaker', url: 'https://www.adidas.de/sambarose-schuhe/EE4687.html' },
  { shop: 'Snipes DE', label: 'Sneaker', url: 'https://www.snipes.com/p/nike-air-force-1-123456' },
  { shop: 'New Yorker', label: 'Top', url: 'https://www.newyorker.de/products/top-123456/' },
  { shop: 'Bonprix DE', label: 'Dress', url: 'https://www.bonprix.de/produkt/kleid-1234567890/' },
  { shop: 'About You DE', label: 'Jeans', url: 'https://www.aboutyou.de/p/brand/jeans-123456' },
  { shop: 'Thalia DE', label: 'Book', url: 'https://www.thalia.de/shop/home/artikeldetails/ID1234567890.html' },
  { shop: 'Alternate DE', label: 'GPU', url: 'https://www.alternate.de/ASUS/RTX-4070/html/product/1234567' },
  { shop: 'notebooksbilliger', label: 'Laptop', url: 'https://www.notebooksbilliger.de/produkt/Lenovo+ThinkPad/123456' },
  { shop: 'Mindfactory', label: 'CPU', url: 'https://www.mindfactory.de/product_info.php/info/p123456' },
  { shop: 'Cyberport DE', label: 'Monitor', url: 'https://www.cyberport.de?pid=123456' },
  { shop: 'Coolblue DE', label: 'TV', url: 'https://www.coolblue.de/produkt/123456/samsung-tv.html' },
  { shop: 'Bol DE', label: 'Book', url: 'https://www.bol.com/nl/nl/p/book/1234567890/' },
  { shop: 'dm DE', label: 'Care', url: 'https://www.dm.de/product/1234567890' },
  { shop: 'Rossmann DE', label: 'Care', url: 'https://www.rossmann.de/de/shop/product/123456' },
  { shop: 'Hornbach DE', label: 'Paint', url: 'https://www.hornbach.de/shop/paint/1234567890' },
  { shop: 'Bauhaus DE', label: 'Tool', url: 'https://www.bauhaus.info/werkzeug/bosch-bohrmaschine/p/12345678' },
  { shop: 'XXXLutz DE', label: 'Chair', url: 'https://www.xxxlutz.de/p/stuhl-123456' },
  { shop: 'POCO DE', label: 'Shelf', url: 'https://www.poco.de/p/regal-123456' },
  { shop: 'Pull&Bear', label: 'Jeans', url: 'https://www.pullandbear.com/de/jeans-l1234567890p1234567890.html' },
  { shop: 'Bershka', label: 'Skirt', url: 'https://www.bershka.com/de/skirt-l1234567890p1234567890.html' },
  { shop: 'Mango', label: 'Coat', url: 'https://shop.mango.com/de/damen/mantel_12345678' },
  { shop: 'Stradivarius', label: 'Top', url: 'https://www.stradivarius.com/de/top-l1234567890p1234567890.html' },
  { shop: 'Massimo Dutti', label: 'Shirt', url: 'https://www.massimodutti.com/de/hemd-12345678' },
  { shop: 'Reserved', label: 'Dress', url: 'https://www.reserved.com/de/de/dress-123456' },
  { shop: 'Lidl DE', label: 'Food', url: 'https://www.lidl.de/p/product-name/p1000000000001' },
  { shop: 'Aldi Süd', label: 'Offer', url: 'https://www.aldi-sued.de/de/angebote/artikel123.html' },
  { shop: 'Kaufland', label: 'TV', url: 'https://www.kaufland.de/product/123456789/' },
  { shop: 'Expert DE', label: 'Washer', url: 'https://www.expert.de/shop/product/123456' },
  { shop: 'Euronics DE', label: 'Fridge', url: 'https://www.euronics.de/artikel-123456' },
  { shop: 'Fnac FR', label: 'Book', url: 'https://www.fnac.com/a12345678/Livre' },
  { shop: 'Elkjøp NO', label: 'Laptop', url: 'https://www.elkjop.no/product/laptop/123456' },
  { shop: 'Zooplus DE', label: 'Pet food', url: 'https://www.zooplus.de/shop/katzen/trockenfutter/royal_canin/123456' },
  { shop: 'ARLT', label: 'ThinkPad', url: 'https://www.arlt.com/Notebook/Notebooks/GreenIT-Refurbished/T1A-Lenovo-ThinkPad-X1-Yoga-Gen-5-Refurbished-Full-HD-14-Zoll-Notebook.html' },
  { shop: 'Instant Gaming', label: 'Game', url: 'https://www.instant-gaming.com/de/8988-kaufen-kingdom-come-deliverance-ii-pc-steam/' },
  { shop: 'Steam', label: 'App page', url: 'https://store.steampowered.com/app/1771300/Kingdom_Come_Deliverance_II/' },
  { shop: 'GOG', label: 'Game', url: 'https://www.gog.com/en/game/the_witcher_3_wild_hunt' },
  { shop: 'AnoaShop', label: 'Jewelry', url: 'https://www.anoashop.com/products/gold-necklace-1' },
  { shop: 'Deichmann DE', label: 'Shoes', url: 'https://www.deichmann.com/DE/de/shop/schuh1234567890.html' },
  { shop: 'Schuh DE', label: 'Boots', url: 'https://www.schuh.de/p/boots-123456' },
  { shop: 'Foot Locker DE', label: 'Sneaker', url: 'https://www.footlocker.de/de/product/nike-air-123456' },
  { shop: 'JD Sports DE', label: 'Sneaker', url: 'https://www.jdsports.de/product/nike-123456' },
  { shop: 'SportScheck', label: 'Jacket', url: 'https://www.sportscheck.de/p/jacket-123456' },
  { shop: 'Globetrotter', label: 'Tent', url: 'https://www.globetrotter.de/artikel/tent-123456' },
  { shop: 'Bergfreunde', label: 'Backpack', url: 'https://www.bergfreunde.de/osprey-backpack-123456/' },
  { shop: 'Campz', label: 'Sleeping bag', url: 'https://www.campz.de/sleeping-bag-123456' },
  { shop: 'Obi DE', label: 'Drill', url: 'https://www.obi.de/artikel/bosch-bohrmaschine-123456' },
  { shop: 'Toom DE', label: 'Lamp', url: 'https://www.toom.de/artikel/lampe-123456' },
  { shop: 'Hellweg DE', label: 'Tile', url: 'https://www.hellweg.de/fliese-123456' },
  { shop: 'Roller DE', label: 'Sofa', url: 'https://www.roller.de/sofa-123456' },
  { shop: 'Möbel Boss', label: 'Desk', url: 'https://www.moebel-boss.de/schreibtisch-123456' },
  { shop: 'Segmüller', label: 'Bed', url: 'https://www.segmueller.de/bett-123456' },
  { shop: 'Müller DE', label: 'Cosmetics', url: 'https://www.mueller.de/p/creme-123456' },
  { shop: 'Rituals DE', label: 'Gift', url: 'https://www.rituals.com/de-de/gift-set-123456' },
  { shop: 'The Body Shop DE', label: 'Shower', url: 'https://www.thebodyshop.com/de-de/product/shower-123456' },
  { shop: 'Lush DE', label: 'Bath', url: 'https://uk.lush.com/products/bath-bomb-123' },
  { shop: 'Waterdrop DE', label: 'Filter', url: 'https://www.waterdropfilter.com/de/products/filter-123' },
];

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });
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
  console.log(`Auditing ${PAGES.length} pages (generic extract + parsePriceFromText; Steam API not used here)\n`);

  const results: {
    shop: string;
    label: string;
    http: number;
    okFetch: boolean;
    source: string;
    raw: string;
    parsed: number | null;
    detect: 'yes' | 'no' | 'parse_fail';
  }[] = [];

  for (const p of PAGES) {
    const { ok, status, html } = await fetchHtml(p.url);
    if (!ok || html.length < 500) {
      results.push({
        shop: p.shop,
        label: p.label,
        http: status,
        okFetch: ok,
        source: '—',
        raw: '',
        parsed: null,
        detect: 'no',
      });
      await sleep(250);
      continue;
    }
    const { raw, source } = extractListedPriceWithSource(html);
    const parsed = raw ? parsePriceFromText(raw) : null;
    let detect: 'yes' | 'no' | 'parse_fail' = 'no';
    if (raw && parsed !== null) detect = 'yes';
    else if (raw) detect = 'parse_fail';

    results.push({
      shop: p.shop,
      label: p.label,
      http: status,
      okFetch: ok,
      source: source ?? '—',
      raw: raw ? raw.slice(0, 40) : '',
      parsed,
      detect,
    });
    await sleep(250);
  }

  const yes = results.filter((r) => r.detect === 'yes').length;
  const no = results.filter((r) => r.detect === 'no').length;
  const pf = results.filter((r) => r.detect === 'parse_fail').length;

  console.log('shop | http | source | parsed | raw (trim)');
  console.log('-'.repeat(90));
  for (const r of results) {
    const line = `${r.shop.padEnd(18)} | ${String(r.http).padEnd(4)} | ${String(r.source).padEnd(16)} | ${r.parsed !== null ? String(r.parsed) : '—'.padEnd(8)} | ${r.raw}`;
    console.log(line);
  }

  console.log('\n--- Summary ---');
  console.log(`Total: ${results.length}`);
  console.log(`Price detected + parsed: ${yes}`);
  console.log(`No structured price / bad HTTP: ${no}`);
  console.log(`Raw found but parse failed: ${pf}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

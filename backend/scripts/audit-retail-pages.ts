/**
 * Fetches many retailer product pages and checks whether the app's
 * generic HTML price extraction finds a parseable price.
 *
 * Run: npx tsx scripts/audit-retail-pages.ts
 */
import { parsePriceFromText } from '../src/trackings/price-parse';
import { extractListedPriceWithSource } from '../src/trackings/extract-price-from-html';
import { extractProductAndCompany } from '../src/trackings/extract-product-metadata';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Row = { shop: string; label: string; url: string };

const PAGES: Row[] = [
  // ── Marketplaces / Aggregators ──
  { shop: 'eBay.de', label: 'AirPods Pro 2', url: 'https://www.ebay.de/itm/356612237569' },
  { shop: 'Kaufland.de', label: 'AirPods Pro 2', url: 'https://www.kaufland.de/product/413529498/' },
  { shop: 'Idealo.de', label: 'AirPods Pro 2', url: 'https://www.idealo.de/preisvergleich/OffersOfProduct/202092559_-airpods-pro-2-apple.html' },
  { shop: 'Geizhals.de', label: 'AirPods Pro 2', url: 'https://geizhals.de/apple-airpods-pro-2-generation-mqd83zm-a-a2807066.html' },

  // ── Electronics (core) ──
  { shop: 'MediaMarkt', label: 'AirPods Pro 2', url: 'https://www.mediamarkt.de/de/product/_apple-airpods-pro-2-generation-mit-magsafe-case-usbc-in-ear-kopfhorer-bluetooth-white-2897990.html' },
  { shop: 'Saturn', label: 'AirPods Pro 2', url: 'https://www.saturn.de/de/product/_apple-airpods-pro-2-generation-in-ear-kopfhorer-bluetooth-weiss-2832770.html' },
  { shop: 'Cyberport', label: 'AirPods Pro 2', url: 'https://www.cyberport.de/apple-und-zubehoer/apple-kopfhoerer/apple/pdp/2261-239/apple-airpods-pro-2-generation-mit-magsafe-ladecase-usb-c.html' },
  { shop: 'notebooksbilliger', label: 'AirPods Pro 2', url: 'https://www.notebooksbilliger.de/apple+airpods+pro+2nd+gen+mit+magsafe+usb+c+mtjv3zma+815236' },
  {
    shop: 'notebooksbilliger',
    label: 'MSI Katana 17 HX',
    url: 'https://www.notebooksbilliger.de/msi+katana+17+hx+b14wgk+061+879938',
  },
  { shop: 'Alternate', label: 'AirPods Pro 2', url: 'https://www.alternate.de/Apple/AirPods-Pro-2-Generation-Kopfh%C3%B6rer/html/product/100015992' },
  { shop: 'Mindfactory', label: 'Samsung 980 Pro 1TB', url: 'https://www.mindfactory.de/product_info.php/1TB-Samsung-980-Pro-M-2-PCIe-4--3D-NAND-TLC--MZ-V8P1T0BW-_1374976.html' },
  { shop: 'Caseking', label: 'RTX 4070 Super', url: 'https://www.caseking.de/msi-geforce-rtx-4070-super-ventus-2x-oc-12g-12288-mb-gddr6x/GCMC-389.html' },
  { shop: 'Alza.de', label: 'AirPods Pro 2', url: 'https://www.alza.de/apple-airpods-pro-2-d7605498.htm' },
  { shop: 'Conrad', label: 'Bosch Akku-Bohrschrauber', url: 'https://www.conrad.de/de/p/bosch-professional-gsr-12v-35-fc-06019h3001-akku-bohrschrauber-12-v-li-ion-inkl-2-akku-inkl-ladegeraet-inkl-koffer-2148684.html' },
  { shop: 'EURONICS', label: 'AirPods Pro 2', url: 'https://www.euronics.de/tv-und-audio/hifi-und-audio/kopfhoerer/in-ear-kopfhoerer-mit-bluetooth/airpods-pro-2nd-gen.-true-wireless-kopfhoerer-inkl.-magsafe-case-usb-c-4065327778663' },

  // ── Brand / Direct Shops ──
  { shop: 'Apple.com/de', label: 'iPhone 15', url: 'https://www.apple.com/de/shop/buy-iphone/iphone-15' },
  { shop: 'Samsung.com/de', label: 'Galaxy S24', url: 'https://www.samsung.com/de/smartphones/galaxy-s24/' },
  { shop: 'Dell.com/de', label: 'XPS 13', url: 'https://www.dell.com/de-de/shop/dell-notebooks/xps-13/spd/xps-13-9315-laptop/cn93410sc' },
  { shop: 'Lenovo.com/de', label: 'ThinkPad X1 Carbon', url: 'https://www.lenovo.com/de/de/p/laptops/thinkpad/thinkpadx1/thinkpad-x1-carbon-gen-11-(14-inch-intel)/len101t0049' },

  // ── General Retail ──
  { shop: 'Lidl.de', label: 'Silvercrest Küchenmaschine', url: 'https://www.lidl.de/p/silvercrest-kuechenmaschine-km-900-a1/p100399203' },
  { shop: 'Hornbach', label: 'Bosch Akkuschrauber', url: 'https://www.hornbach.de/p/akkuschrauber-bosch-ixo-7-basic/10581157/' },
  { shop: 'OBI', label: 'Makita Akkuschrauber', url: 'https://www.obi.de/p/3655503/makita-18-v-akkuschrauber-dtp141z-solo' },

  // ── Fashion ──
  { shop: 'Zalando', label: 'Nike Air Force 1', url: 'https://www.zalando.de/nike-sportswear-air-force-1-sneaker-low-whitemetallic-gold-ni111a0zi-a11.html' },
  { shop: 'AboutYou', label: 'Adidas Hoodie', url: 'https://www.aboutyou.de/p/adidas-originals/zip-up-hoodie-premium-essentials-22334370' },
  { shop: 'H&M.com/de', label: 'T-Shirt', url: 'https://www2.hm.com/de_de/productpage.1266155002.html' },

  // ── Niche / Special ──
  { shop: 'Thomann', label: 'Shure SM7B', url: 'https://www.thomann.de/de/shure_sm7b_studiomikro.htm' },
  { shop: 'Decathlon', label: 'Fahrradhelm', url: 'https://www.decathlon.de/p/fahrradhelm-city-500-schwarz/_/R-p-325660' },

  // ── Extra shops from original audit ──
  { shop: 'IKEA DE', label: 'KALLAX', url: 'https://www.ikea.com/de/de/p/kallax-regal-schwarzbraun-s29047437/' },
  { shop: 'ARLT', label: 'ThinkPad', url: 'https://www.arlt.com/Notebook/Notebooks/GreenIT-Refurbished/T1A-Lenovo-ThinkPad-X1-Yoga-Gen-5-Refurbished-Full-HD-14-Zoll-Notebook.html' },
  { shop: 'Instant Gaming', label: 'Game', url: 'https://www.instant-gaming.com/de/8988-kaufen-kingdom-come-deliverance-ii-pc-steam/' },
  { shop: 'Steam', label: 'Kingdom Come 2', url: 'https://store.steampowered.com/app/1771300/Kingdom_Come_Deliverance_II/' },
];

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Ch-Ua': '"Chromium";v="120", "Not_A Brand";v="8", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch (e) {
    return { ok: false, status: 0, html: '' };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const COL = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

async function main() {
  console.log(
    `${COL.bold}Auditing ${PAGES.length} pages (generic extract + parsePriceFromText)${COL.reset}\n`,
  );

  const results: {
    shop: string;
    label: string;
    http: number;
    okFetch: boolean;
    source: string;
    raw: string;
    parsed: number | null;
    detect: 'yes' | 'no' | 'parse_fail';
    productName: string;
    companyName: string;
  }[] = [];

  for (const p of PAGES) {
    process.stdout.write(`  ${COL.dim}${p.shop}…${COL.reset}`);
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
        productName: '',
        companyName: '',
      });
      process.stdout.write(` ${COL.red}HTTP ${status}${COL.reset}\n`);
      await sleep(500);
      continue;
    }

    const { raw, source } = extractListedPriceWithSource(html);
    const parsed = raw ? parsePriceFromText(raw) : null;
    let detect: 'yes' | 'no' | 'parse_fail' = 'no';
    if (raw && parsed !== null) detect = 'yes';
    else if (raw) detect = 'parse_fail';

    const meta = extractProductAndCompany(html, p.url);

    results.push({
      shop: p.shop,
      label: p.label,
      http: status,
      okFetch: ok,
      source: source ?? '—',
      raw: raw ? raw.slice(0, 40) : '',
      parsed,
      detect,
      productName: meta.productName?.slice(0, 50) ?? '',
      companyName: meta.companyName?.slice(0, 30) ?? '',
    });

    const icon = detect === 'yes' ? `${COL.green}✓` : detect === 'parse_fail' ? `${COL.yellow}⚠` : `${COL.red}✗`;
    process.stdout.write(` ${icon} ${parsed ?? '—'}${COL.reset}\n`);
    await sleep(500);
  }

  console.log(`\n${COL.bold}${'Shop'.padEnd(22)} | HTTP | Source           | Parsed    | Product Name${COL.reset}`);
  console.log('-'.repeat(110));
  for (const r of results) {
    const icon = r.detect === 'yes' ? `${COL.green}✓` : r.detect === 'parse_fail' ? `${COL.yellow}⚠` : `${COL.red}✗`;
    const line = `${icon} ${r.shop.padEnd(20)}${COL.reset} | ${String(r.http).padEnd(4)} | ${String(r.source).padEnd(16)} | ${r.parsed !== null ? String(r.parsed).padEnd(9) : '—'.padEnd(9)} | ${r.productName || '—'}`;
    console.log(line);
  }

  const yes = results.filter((r) => r.detect === 'yes').length;
  const no = results.filter((r) => r.detect === 'no').length;
  const pf = results.filter((r) => r.detect === 'parse_fail').length;

  console.log(`\n${COL.bold}--- Summary ---${COL.reset}`);
  console.log(`Total: ${results.length}`);
  console.log(`${COL.green}Price detected + parsed: ${yes}${COL.reset}`);
  console.log(`${COL.red}No structured price / bad HTTP: ${no}${COL.reset}`);
  console.log(`${COL.yellow}Raw found but parse failed: ${pf}${COL.reset}`);

  if (no > 0 || pf > 0) {
    console.log(`\n${COL.bold}Failed shops (need browser fallback or site-specific logic):${COL.reset}`);
    for (const r of results.filter((r) => r.detect !== 'yes')) {
      console.log(`  ${COL.red}${r.shop}${COL.reset} — HTTP ${r.http}, source: ${r.source}, raw: "${r.raw}"`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

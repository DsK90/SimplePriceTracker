/**
 * Same flow as TrackingsService: fetchHtml (incl. 403→browser) + extract + Playwright fallback.
 * Run: npx tsx scripts/audit-retail-full-pipeline.ts
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { parsePriceFromText } from '../src/trackings/price-parse';
import { extractListedPriceWithSource } from '../src/trackings/extract-price-from-html';
import { BrowserService } from '../src/trackings/browser.service';

const FETCH_RETRY_WITH_BROWSER = new Set([403, 429, 502, 503]);

type Row = { shop: string; url: string };

const PAGES: Row[] = [
  { shop: 'Amazon.de', url: 'https://www.amazon.de/Apple-AirPods-Pro-2-Generation/dp/B0BDJ37NF5' },
  { shop: 'eBay.de', url: 'https://www.ebay.de/itm/356612237569' },
  { shop: 'Kaufland.de', url: 'https://www.kaufland.de/product/413529498/' },
  { shop: 'OTTO.de', url: 'https://www.otto.de/p/apple-airpods-pro-2-generation-mit-magsafe-ladecase-usb-c-S0V2G0C8/' },
  { shop: 'Idealo.de', url: 'https://www.idealo.de/preisvergleich/OffersOfProduct/202092559_-airpods-pro-2-apple.html' },
  { shop: 'Geizhals.de', url: 'https://geizhals.de/apple-airpods-pro-2-generation-mqd83zm-a-a2807066.html' },
  { shop: 'MediaMarkt', url: 'https://www.mediamarkt.de/de/product/_apple-airpods-pro-2-generation-mit-magsafe-case-usbc-in-ear-kopfhorer-bluetooth-white-2897990.html' },
  { shop: 'Saturn', url: 'https://www.saturn.de/de/product/_apple-airpods-pro-2-generation-in-ear-kopfhorer-bluetooth-weiss-2832770.html' },
  { shop: 'Cyberport', url: 'https://www.cyberport.de/apple-und-zubehoer/apple-kopfhoerer/apple/pdp/2261-239/apple-airpods-pro-2-generation-mit-magsafe-ladecase-usb-c.html' },
  { shop: 'notebooksbilliger', url: 'https://www.notebooksbilliger.de/apple+airpods+pro+2nd+gen+mit+magsafe+usb+c+mtjv3zma+815236' },
  { shop: 'Alternate', url: 'https://www.alternate.de/Apple/AirPods-Pro-2-Generation-Kopfh%C3%B6rer/html/product/100015992' },
  { shop: 'Mindfactory', url: 'https://www.mindfactory.de/product_info.php/1TB-Samsung-980-Pro-M-2-PCIe-4--3D-NAND-TLC--MZ-V8P1T0BW-_1374976.html' },
  { shop: 'Caseking', url: 'https://www.caseking.de/msi-geforce-rtx-4070-super-ventus-2x-oc-12g-12288-mb-gddr6x/GCMC-389.html' },
  { shop: 'Alza.de', url: 'https://www.alza.de/apple-airpods-pro-2-d7605498.htm' },
  { shop: 'Conrad', url: 'https://www.conrad.de/de/p/bosch-professional-gsr-12v-35-fc-06019h3001-akku-bohrschrauber-12-v-li-ion-inkl-2-akku-inkl-ladegeraet-inkl-koffer-2148684.html' },
  { shop: 'EURONICS', url: 'https://www.euronics.de/tv-und-audio/hifi-und-audio/kopfhoerer/in-ear-kopfhoerer-mit-bluetooth/airpods-pro-2nd-gen.-true-wireless-kopfhoerer-inkl.-magsafe-case-usb-c-4065327778663' },
  { shop: 'Apple.com/de', url: 'https://www.apple.com/de/shop/buy-iphone/iphone-15' },
  { shop: 'Samsung.com/de', url: 'https://www.samsung.com/de/smartphones/galaxy-s24/' },
  { shop: 'Dell.com/de', url: 'https://www.dell.com/de-de/shop/dell-notebooks/xps-13/spd/xps-13-9315-laptop/cn93410sc' },
  { shop: 'Lenovo.com/de', url: 'https://www.lenovo.com/de/de/p/laptops/thinkpad/thinkpadx1/thinkpad-x1-carbon-gen-11-(14-inch-intel)/len101t0049' },
  { shop: 'Lidl.de', url: 'https://www.lidl.de/p/silvercrest-kuechenmaschine-km-900-a1/p100399203' },
  { shop: 'Rewe.de', url: 'https://shop.rewe.de/p/philips-airfryer-xxl-hd9650-90/' },
  { shop: 'Hornbach', url: 'https://www.hornbach.de/p/akkuschrauber-bosch-ixo-7-basic/10581157/' },
  { shop: 'OBI', url: 'https://www.obi.de/p/3655503/makita-18-v-akkuschrauber-dtp141z-solo' },
  { shop: 'Zalando', url: 'https://www.zalando.de/nike-sportswear-air-force-1-sneaker-low-whitemetallic-gold-ni111a0zi-a11.html' },
  { shop: 'AboutYou', url: 'https://www.aboutyou.de/p/adidas-originals/zip-up-hoodie-premium-essentials-22334370' },
  { shop: 'H&M.com/de', url: 'https://www2.hm.com/de_de/productpage.1266155002.html' },
  { shop: 'Thomann', url: 'https://www.thomann.de/de/shure_sm7b_studiomikro.htm' },
  { shop: 'Decathlon', url: 'https://www.decathlon.de/p/fahrradhelm-city-500-schwarz/_/R-p-325660' },
  { shop: 'IKEA DE', url: 'https://www.ikea.com/de/de/p/kallax-regal-schwarzbraun-s29047437/' },
];

async function fetchHtmlLikeApp(
  url: string,
): Promise<{ status: number; html: string; allowBrowser: boolean }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
    if (res.ok) return { status: res.status, html: await res.text(), allowBrowser: true };
    if (FETCH_RETRY_WITH_BROWSER.has(res.status)) {
      await res.text().catch(() => {});
      return { status: res.status, html: '', allowBrowser: true };
    }
    await res.text().catch(() => {});
    return { status: res.status, html: '', allowBrowser: false };
  } catch {
    return { status: 0, html: '', allowBrowser: true };
  }
}

function tryExtract(html: string): { raw: string; source: string; price: number | null } {
  const { raw, source } = extractListedPriceWithSource(html);
  const price = raw ? parsePriceFromText(raw) : null;
  return { raw: raw ?? '', source: source ?? '—', price };
}

async function main() {
  const mod = await Test.createTestingModule({ providers: [BrowserService] }).compile();
  const browser = mod.get(BrowserService);

  console.log('Shop\tfetchHTTP\tpath\tprice\tsource');
  console.log('----\t--------\t----\t-----\t------');

  for (const p of PAGES) {
    const { status, html: h0, allowBrowser } = await fetchHtmlLikeApp(p.url);
    let path: 'fetch' | 'browser' | 'http_fail' = 'fetch';
    let html = h0;
    let ex = tryExtract(html);

    if (ex.price === null && allowBrowser) {
      try {
        html = await browser.fetchRenderedHtml(p.url);
        path = 'browser';
        ex = tryExtract(html);
      } catch {
        path = ex.raw ? path : 'browser';
      }
    } else if (ex.price === null && !allowBrowser) {
      path = 'http_fail';
    }

    const priceStr =
      ex.price !== null && ex.price > 0 ? String(ex.price) : ex.price === 0 ? '0 (bad)' : '—';
    console.log(`${p.shop}\t${status || 'ERR'}\t${path}\t${priceStr}\t${ex.source}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  await browser.onModuleDestroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

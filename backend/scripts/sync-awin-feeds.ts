/**
 * Download one or more Awin CSV feeds, store them per advertiser, and upsert into catalog.
 *
 * Usage:
 *   1) Copy config/awin-feeds.example.json -> config/awin-feeds.json
 *   2) Fill each source URL (Awin feedList / CSV URL)
 *   3) npm run sync-awin-feeds
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseAwinFeedRows, parseCsv } from '../src/trackings/awin-feed-csv';

type FeedSource = {
  id: string;
  url: string;
  enabled?: boolean;
  advertiserId?: string;
  advertiserName?: string;
  feedId?: string;
  headers?: Record<string, string>;
};

type FeedConfig = {
  sources: FeedSource[];
};

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readConfig(absPath: string): FeedSource[] {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Feed config not found: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf8').trim();
  if (!raw) throw new Error(`Feed config is empty: ${absPath}`);
  const parsed = JSON.parse(raw) as FeedConfig | FeedSource[];
  const sources = Array.isArray(parsed) ? parsed : parsed.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(`No feed sources found in config: ${absPath}`);
  }
  return sources.filter((s) => s && s.enabled !== false);
}

function looksLikeGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

async function downloadText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  const isGzip = url.endsWith('.gz') || looksLikeGzip(body);
  const decoded = isGzip ? gunzipSync(body) : body;
  return decoded.toString('utf8');
}

function pickFeedUrlFromFeedList(source: FeedSource, csvText: string): string | null {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) return null;
  const headers = rows[0];
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = normHeader(h);
    if (k) map[k] = i;
  });
  const urlIdx = map.url;
  const advertiserIdIdx = map.advertiser_id;
  const advertiserNameIdx = map.advertiser_name;
  const feedIdIdx = map.feed_id;
  if (urlIdx === undefined || advertiserIdIdx === undefined) return null;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const advertiserId = (cells[advertiserIdIdx] ?? '').trim();
    const advertiserName = advertiserNameIdx !== undefined ? (cells[advertiserNameIdx] ?? '').trim() : '';
    const feedId = feedIdIdx !== undefined ? (cells[feedIdIdx] ?? '').trim() : '';

    const idMatches = source.advertiserId ? advertiserId === source.advertiserId.trim() : true;
    const nameMatches = source.advertiserName
      ? advertiserName.toLowerCase() === source.advertiserName.trim().toLowerCase()
      : true;
    const feedMatches = source.feedId ? feedId === source.feedId.trim() : true;

    if (idMatches && nameMatches && feedMatches) {
      return (cells[urlIdx] ?? '').trim() || null;
    }
  }

  return null;
}

async function upsertRows(prisma: PrismaClient, csvText: string): Promise<{ parsed: number; skipped: number; upserted: number }> {
  const { rows, skipped } = parseAwinFeedRows(csvText);
  let upserted = 0;

  for (const r of rows) {
    await prisma.awinCatalogProduct.upsert({
      where: { feedKey: r.feedKey },
      create: {
        feedKey: r.feedKey,
        advertiserId: r.advertiserId,
        advertiserName: r.advertiserName,
        title: r.title,
        description: r.description,
        price: new Prisma.Decimal(r.price),
        currency: r.currency,
        merchantDeepLink: r.merchantDeepLink,
        imageUrl: r.imageUrl,
        category: r.category,
        brand: r.brand,
      },
      update: {
        advertiserId: r.advertiserId,
        advertiserName: r.advertiserName,
        title: r.title,
        description: r.description,
        price: new Prisma.Decimal(r.price),
        currency: r.currency,
        merchantDeepLink: r.merchantDeepLink,
        imageUrl: r.imageUrl,
        category: r.category,
        brand: r.brand,
      },
    });
    upserted++;
  }

  return { parsed: rows.length, skipped, upserted };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const configPathRaw = process.env.AWIN_FEEDS_CONFIG_PATH?.trim() || './config/awin-feeds.json';
  const storageRootRaw = process.env.AWIN_FEEDS_STORAGE_DIR?.trim() || './data/awin';

  const configPath = path.isAbsolute(configPathRaw)
    ? configPathRaw
    : path.join(process.cwd(), configPathRaw);
  const storageRoot = path.isAbsolute(storageRootRaw)
    ? storageRootRaw
    : path.join(process.cwd(), storageRootRaw);

  const sources = readConfig(configPath);
  fs.mkdirSync(storageRoot, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    let totalParsed = 0;
    let totalSkipped = 0;
    let totalUpserted = 0;

    for (const source of sources) {
      const slug = toSlug(source.id || 'unknown-advertiser');
      if (!slug) throw new Error(`Invalid feed source id: "${source.id}"`);

      console.log(`\n==> Sync source: ${source.id}`);
      const firstDownload = await downloadText(source.url, source.headers ?? {});
      const feedUrl = pickFeedUrlFromFeedList(source, firstDownload);
      const csvText = feedUrl
        ? await downloadText(feedUrl, source.headers ?? {})
        : firstDownload;
      if (feedUrl) {
        console.log(`[${source.id}] resolved feed URL from feed list`);
      }

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
      const advertiserDir = path.join(storageRoot, slug);
      const downloadsDir = path.join(advertiserDir, 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      fs.writeFileSync(path.join(advertiserDir, 'latest.csv'), csvText, 'utf8');
      if (feedUrl) {
        fs.writeFileSync(path.join(advertiserDir, 'latest-feed-list.csv'), firstDownload, 'utf8');
      }
      fs.writeFileSync(path.join(downloadsDir, `${datePart}-${timePart}.csv`), csvText, 'utf8');

      const stats = await upsertRows(prisma, csvText);
      console.log(
        `[${source.id}] parsed=${stats.parsed} skipped=${stats.skipped} upserted=${stats.upserted}`,
      );
      totalParsed += stats.parsed;
      totalSkipped += stats.skipped;
      totalUpserted += stats.upserted;
    }

    console.log('\nSync complete.');
    console.log(
      `Totals: parsed=${totalParsed} skipped=${totalSkipped} upserted=${totalUpserted}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

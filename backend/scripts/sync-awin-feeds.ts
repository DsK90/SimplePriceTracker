/**
 * Download one or more Awin CSV feeds, store them per advertiser, and upsert into catalog.
 * Large feeds: HTTP response is streamed to disk; CSV is parsed with csv-parse streams (no full-file RAM).
 *
 * Usage:
 *   1) Copy config/awin-feeds.example.json -> config/awin-feeds.json
 *   2) Fill each source URL (Awin feedList / CSV URL)
 *   3) npm run sync-awin-feeds
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  downloadUrlToFile,
  looksLikeDarwinFeedListFile,
  pickFeedUrlFromFeedListFile,
  upsertAwinFeedFromFile,
} from './awin-feed-stream';

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
      const advertiserDir = path.join(storageRoot, slug);
      const downloadsDir = path.join(advertiserDir, 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
      const hdr = source.headers ?? {};

      const firstPath = path.join(downloadsDir, `${datePart}-${timePart}-first.bin`);
      await downloadUrlToFile(source.url, firstPath, hdr);

      let productPath = firstPath;
      const isFeedList = await looksLikeDarwinFeedListFile(firstPath);

      if (isFeedList) {
        fs.copyFileSync(firstPath, path.join(advertiserDir, 'latest-feed-list.feed'));
        const feedUrl = await pickFeedUrlFromFeedListFile(source, firstPath);
        if (feedUrl) {
          console.log(`[${source.id}] resolved feed URL from feed list`);
          productPath = path.join(downloadsDir, `${datePart}-${timePart}-product.bin`);
          await downloadUrlToFile(feedUrl, productPath, hdr);
        }
      }

      fs.copyFileSync(productPath, path.join(advertiserDir, 'latest.feed'));
      fs.copyFileSync(productPath, path.join(downloadsDir, `${datePart}-${timePart}.feed`));

      const stats = await upsertAwinFeedFromFile(prisma, productPath, (n) =>
        console.log(`  ... upserted ${n} rows`),
      );
      console.log(
        `[${source.id}] parsed=${stats.parsed} skipped=${stats.skipped} upserted=${stats.upserted}`,
      );
      totalParsed += stats.parsed;
      totalSkipped += stats.skipped;
      totalUpserted += stats.upserted;

      try {
        fs.unlinkSync(firstPath);
      } catch {
        /* ignore */
      }
      if (productPath !== firstPath) {
        try {
          fs.unlinkSync(productPath);
        } catch {
          /* ignore */
        }
      }
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

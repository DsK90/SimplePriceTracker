/**
 * Import / refresh Awin product feed CSV into AwinCatalogProduct.
 *
 * Usage:
 *   AWIN_FEED_CSV_PATH=./fixtures/awin-sample.csv npx tsx scripts/import-awin-feed.ts
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseAwinFeedRows } from '../src/trackings/awin-feed-csv';

async function main() {
  const csvPath = process.env.AWIN_FEED_CSV_PATH?.trim();
  if (!csvPath) {
    console.error('Set AWIN_FEED_CSV_PATH to a UTF-8 CSV file (Awin product export).');
    process.exit(1);
  }
  const abs = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  const raw = fs.readFileSync(abs, 'utf8');
  const { rows, skipped } = parseAwinFeedRows(raw);
  console.log(`Parsed ${rows.length} products, skipped ${skipped} rows.`);

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
  console.log(`Upserted ${upserted} rows into AwinCatalogProduct.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

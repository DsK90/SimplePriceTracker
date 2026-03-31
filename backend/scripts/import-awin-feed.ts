/**
 * Import / refresh Awin product feed CSV into AwinCatalogProduct.
 * Streams CSV from disk (gzip supported) — suitable for large files.
 *
 * Usage:
 *   AWIN_FEED_CSV_PATH=./fixtures/awin-sample.csv npx tsx scripts/import-awin-feed.ts
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { upsertAwinFeedFromFile } from './awin-feed-stream';

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

  const stats = await upsertAwinFeedFromFile(prisma, abs);
  console.log(
    `Upserted ${stats.upserted} rows into AwinCatalogProduct (skipped ${stats.skipped} invalid/empty rows).`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

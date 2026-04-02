/**
 * Stream download + stream CSV parse for large Awin feeds (100k+ rows) without loading the full file into RAM.
 */
import * as fs from 'node:fs';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { AwinFeedRow } from '../src/trackings/awin-feed-csv';
import { rowToAwinFeedRow } from '../src/trackings/awin-feed-csv';

/** Parallel upserts per round-trip batch (default 48). Set AWIN_FEED_UPSERT_BATCH=1 to mimic old row-by-row. */
function upsertBatchSize(): number {
  const raw = process.env.AWIN_FEED_UPSERT_BATCH?.trim();
  if (!raw) return 48;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 48;
  return Math.min(200, Math.max(1, n));
}

function upsertOne(prisma: PrismaClient, r: AwinFeedRow) {
  return prisma.awinCatalogProduct.upsert({
    where: { feedKey: r.feedKey },
    create: {
      feedKey: r.feedKey,
      advertiserId: r.advertiserId,
      advertiserName: r.advertiserName,
      awProductId: r.awProductId,
      merchantProductId: r.merchantProductId,
      ean: r.ean,
      title: r.title,
      description: r.description,
      price: new Prisma.Decimal(r.price),
      currency: r.currency,
      merchantDeepLink: r.merchantDeepLink,
      imageUrl: r.imageUrl,
      category: r.category,
      categoryPath: r.categoryPath,
      brand: r.brand,
      productModel: r.productModel,
      modelNumber: r.modelNumber,
      rrpPrice: r.rrpPrice != null ? new Prisma.Decimal(r.rrpPrice) : null,
      basePrice: r.basePrice != null ? new Prisma.Decimal(r.basePrice) : null,
      deliveryCost: r.deliveryCost != null ? new Prisma.Decimal(r.deliveryCost) : null,
      searchText: r.searchText,
    },
    update: {
      advertiserId: r.advertiserId,
      advertiserName: r.advertiserName,
      awProductId: r.awProductId,
      merchantProductId: r.merchantProductId,
      ean: r.ean,
      title: r.title,
      description: r.description,
      price: new Prisma.Decimal(r.price),
      currency: r.currency,
      merchantDeepLink: r.merchantDeepLink,
      imageUrl: r.imageUrl,
      category: r.category,
      categoryPath: r.categoryPath,
      brand: r.brand,
      productModel: r.productModel,
      modelNumber: r.modelNumber,
      rrpPrice: r.rrpPrice != null ? new Prisma.Decimal(r.rrpPrice) : null,
      basePrice: r.basePrice != null ? new Prisma.Decimal(r.basePrice) : null,
      deliveryCost: r.deliveryCost != null ? new Prisma.Decimal(r.deliveryCost) : null,
      searchText: r.searchText,
    },
  });
}

export function fileLooksLikeGzip(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(2);
    const n = fs.readSync(fd, buf, 0, 2, 0);
    return n >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  } finally {
    fs.closeSync(fd);
  }
}

export async function downloadUrlToFile(
  url: string,
  destPath: string,
  headers: Record<string, string> = {},
): Promise<void> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  if (!res.body) {
    throw new Error(`No response body for ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(destPath));
}

function createCsvParser() {
  return parse({
    columns: false,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    bom: true,
  });
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

function headerMapFromRow(cells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((h, i) => {
    const k = normHeader(h);
    if (k) map[k] = i;
  });
  return map;
}

/** Darwin feed list export has URL + Advertiser ID columns; product CSVs do not. */
export async function looksLikeDarwinFeedListFile(filePath: string): Promise<boolean> {
  const parser = createCsvParser();
  const read = fs.createReadStream(filePath);
  const input = fileLooksLikeGzip(filePath) ? read.pipe(createGunzip()) : read;
  input.pipe(parser);
  try {
    for await (const row of parser) {
      const cells = row as string[];
      const map = headerMapFromRow(cells);
      return map.url !== undefined && map.advertiser_id !== undefined;
    }
  } finally {
    parser.destroy();
    read.destroy();
  }
  return false;
}

export type FeedListSource = {
  advertiserId?: string;
  advertiserName?: string;
  feedId?: string;
};

/** Stream-parse a Darwin feed list CSV and return the product CSV URL for the given advertiser/feed filters. */
export async function pickFeedUrlFromFeedListFile(
  source: FeedListSource,
  filePath: string,
): Promise<string | null> {
  const parser = createCsvParser();
  const read = fs.createReadStream(filePath);
  const input = fileLooksLikeGzip(filePath) ? read.pipe(createGunzip()) : read;
  input.pipe(parser);

  let headers: string[] | null = null;
  let urlIdx = -1;
  let advertiserIdIdx = -1;
  let advertiserNameIdx: number | undefined;
  let feedIdIdx: number | undefined;

  try {
    for await (const row of parser) {
      const cells = row as string[];
      if (!headers) {
        headers = cells;
        const map = headerMapFromRow(cells);
        urlIdx = map.url ?? -1;
        advertiserIdIdx = map.advertiser_id ?? -1;
        advertiserNameIdx = map.advertiser_name;
        feedIdIdx = map.feed_id;
        if (urlIdx < 0 || advertiserIdIdx < 0) return null;
        continue;
      }

      const advertiserId = (cells[advertiserIdIdx] ?? '').trim();
      const advertiserName =
        advertiserNameIdx !== undefined ? (cells[advertiserNameIdx] ?? '').trim() : '';
      const feedId = feedIdIdx !== undefined ? (cells[feedIdIdx] ?? '').trim() : '';

      const idMatches = source.advertiserId ? advertiserId === source.advertiserId.trim() : true;
      const nameMatches = source.advertiserName
        ? advertiserName.toLowerCase() === source.advertiserName.trim().toLowerCase()
        : true;
      const feedMatches = source.feedId ? feedId === source.feedId.trim() : true;

      if (idMatches && nameMatches && feedMatches) {
        const u = (cells[urlIdx] ?? '').trim();
        if (u) return u;
      }
    }
  } finally {
    parser.destroy();
    read.destroy();
  }

  return null;
}

/** Stream-parse a product feed file and upsert rows (constant memory for CSV parsing). */
export async function upsertAwinFeedFromFile(
  prisma: PrismaClient,
  filePath: string,
  onProgress?: (upserted: number) => void,
): Promise<{ parsed: number; skipped: number; upserted: number }> {
  const parser = createCsvParser();
  const read = fs.createReadStream(filePath);
  const input = fileLooksLikeGzip(filePath) ? read.pipe(createGunzip()) : read;
  input.pipe(parser);

  let headers: string[] | null = null;
  let skipped = 0;
  let upserted = 0;
  const pending: AwinFeedRow[] = [];
  const batchSize = upsertBatchSize();

  async function flushBatch(): Promise<void> {
    if (pending.length === 0) return;
    const batch = pending.splice(0, batchSize);
    await Promise.all(batch.map((r) => upsertOne(prisma, r)));
    upserted += batch.length;
    if (onProgress && upserted % 5000 === 0) {
      onProgress(upserted);
    }
  }

  try {
    for await (const row of parser) {
      const cells = row as string[];
      if (!headers) {
        headers = cells;
        continue;
      }
      if (!cells || cells.every((c) => !String(c).trim())) {
        skipped++;
        continue;
      }
      const out = rowToAwinFeedRow(headers, cells);
      if ('skip' in out) {
        skipped++;
        continue;
      }
      pending.push(out);
      if (pending.length >= batchSize) {
        await flushBatch();
      }
    }
    while (pending.length > 0) {
      await flushBatch();
    }
    if (onProgress && upserted > 0 && upserted % 5000 !== 0) {
      onProgress(upserted);
    }
  } finally {
    parser.destroy();
    read.destroy();
  }

  return { parsed: upserted, skipped, upserted };
}

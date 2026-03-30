import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AwinFeedRow } from './awin-feed-csv';

const CATALOG_SEARCH_SELECT = {
  feedKey: true,
  title: true,
  price: true,
  currency: true,
  advertiserName: true,
  brand: true,
  imageUrl: true,
  merchantDeepLink: true,
  category: true,
} satisfies Prisma.AwinCatalogProductSelect;

@Injectable()
export class AwinCatalogService {
  constructor(private prisma: PrismaService) {}

  /** Product search: URLs match `merchantDeepLink`; plain text matches title and (if long enough) description. */
  async search(q: string, limit = 20) {
    const trimmed = q.trim().slice(0, 2000);
    if (trimmed.length < 2) return [];
    const take = Math.min(50, Math.max(1, limit));

    if (this.looksLikeUrl(trimmed)) {
      const byUrl = await this.searchByMerchantUrl(trimmed, take);
      if (byUrl.length > 0) return byUrl;
    }

    return this.searchByProductText(trimmed, take);
  }

  private looksLikeUrl(s: string): boolean {
    return /^https?:\/\//i.test(s) || /^www\./i.test(s);
  }

  /** Substrings to try against stored deep links (full paste, origin+path without query, path-only). */
  private urlSearchVariants(raw: string): string[] {
    const t = raw.trim();
    const variants = new Set<string>();
    if (t.length >= 2) variants.add(t);
    try {
      const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      const u = new URL(href);
      const path = u.pathname.replace(/\/$/, '') || '/';
      const originPath = `${u.origin}${path}`;
      if (originPath.length >= 2) variants.add(originPath);
      if (path.length >= 4 && path !== '/') variants.add(path);
    } catch {
      /* keep raw string only */
    }
    return [...variants];
  }

  private async searchByMerchantUrl(trimmed: string, take: number) {
    const variants = this.urlSearchVariants(trimmed);
    if (variants.length === 0) return [];
    return this.prisma.awinCatalogProduct.findMany({
      where: {
        OR: variants.map((v) => ({
          merchantDeepLink: { contains: v, mode: 'insensitive' as const },
        })),
      },
      take,
      orderBy: { title: 'asc' },
      select: CATALOG_SEARCH_SELECT,
    });
  }

  private searchByProductText(trimmed: string, take: number) {
    const or: Prisma.AwinCatalogProductWhereInput[] = [
      { title: { contains: trimmed, mode: 'insensitive' } },
      { brand: { contains: trimmed, mode: 'insensitive' } },
      { category: { contains: trimmed, mode: 'insensitive' } },
      { advertiserName: { contains: trimmed, mode: 'insensitive' } },
    ];
    if (trimmed.length >= 3) {
      or.push({ description: { contains: trimmed, mode: 'insensitive' } });
    }
    return this.prisma.awinCatalogProduct.findMany({
      where: { OR: or },
      take,
      orderBy: { title: 'asc' },
      select: CATALOG_SEARCH_SELECT,
    });
  }

  async getByFeedKey(feedKey: string) {
    return this.prisma.awinCatalogProduct.findUnique({
      where: { feedKey: feedKey.trim() },
    });
  }

  async upsertMany(rows: AwinFeedRow[]): Promise<{ upserted: number }> {
    let upserted = 0;
    for (const r of rows) {
      await this.prisma.awinCatalogProduct.upsert({
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
    return { upserted };
  }
}

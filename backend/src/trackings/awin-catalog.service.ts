import { Injectable, Logger } from '@nestjs/common';
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

type CatalogSearchRow = {
  feedKey: string;
  title: string;
  price: Prisma.Decimal | string | number;
  currency: string;
  advertiserName: string | null;
  brand: string | null;
  imageUrl: string | null;
  merchantDeepLink: string;
  category: string | null;
};

@Injectable()
export class AwinCatalogService {
  private readonly log = new Logger(AwinCatalogService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Product search: URLs match `merchantDeepLink`.
   * Plain text: every token must match via substring (case-insensitive) or pg_trgm `word_similarity` (typo-tolerant).
   */
  async search(q: string, limit = 20) {
    const trimmed = q.trim().slice(0, 2000);
    if (trimmed.length < 2) return [];
    const take = Math.min(50, Math.max(1, limit));

    if (this.looksLikeUrl(trimmed)) {
      const byUrl = await this.searchByMerchantUrl(trimmed, take);
      if (byUrl.length > 0) return byUrl;
    }

    return await this.searchByProductText(trimmed, take);
  }

  /** 0.15–0.55: lower = fuzzier (more typos), more possible noise. */
  private fuzzyMinSimilarity(): number {
    const raw = process.env.AWIN_CATALOG_FUZZY_MIN_SIM?.trim();
    const n = raw ? Number.parseFloat(raw) : 0.28;
    if (!Number.isFinite(n)) return 0.28;
    return Math.min(0.55, Math.max(0.15, n));
  }

  /** Whitespace-separated tokens; each must match (AND). Single token = broad substring search. */
  private static catalogQueryTokens(trimmed: string): string[] {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const tokens: string[] = [];
    for (const p of parts) {
      if (p.length >= 2) tokens.push(p);
      else if (/^\d+$/.test(p)) tokens.push(p);
    }
    if (tokens.length === 0 && trimmed.length >= 2) tokens.push(trimmed);
    return tokens.filter((t) => t.length > 0);
  }

  async count(): Promise<number> {
    return this.prisma.awinCatalogProduct.count();
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

  private async searchByProductText(trimmed: string, take: number): Promise<CatalogSearchRow[]> {
    const tokens = AwinCatalogService.catalogQueryTokens(trimmed);
    if (tokens.length === 0) return [];

    try {
      return await this.searchByProductTextFuzzy(tokens, take);
    } catch (e) {
      this.log.warn(
        `Fuzzy catalog search failed (${e instanceof Error ? e.message : String(e)}); falling back to substring match.`,
      );
      return this.prisma.awinCatalogProduct.findMany({
        where: {
          AND: tokens.map((t) => ({
            searchText: { contains: t, mode: 'insensitive' as const },
          })),
        },
        take,
        orderBy: { title: 'asc' },
        select: CATALOG_SEARCH_SELECT,
      });
    }
  }

  /** Requires `pg_trgm` (see prisma migration). */
  private async searchByProductTextFuzzy(tokens: string[], take: number): Promise<CatalogSearchRow[]> {
    const threshold = this.fuzzyMinSimilarity();
    const tokenSqls = tokens.map((t) => t.toLowerCase().slice(0, 200));

    const whereParts = tokenSqls.map(
      (tok) =>
        Prisma.sql`(strpos(lower("searchText"), ${tok}) > 0 OR word_similarity(${tok}, lower("searchText")) >= ${threshold})`,
    );
    const whereCombined = Prisma.join(whereParts, ' AND ');

    const scoreParts = tokenSqls.map(
      (tok) => Prisma.sql`word_similarity(${tok}, lower("searchText"))`,
    );
    const scoreExpr =
      scoreParts.length === 1
        ? scoreParts[0]
        : Prisma.sql`(${Prisma.join(scoreParts, ' + ')})`;

    const rows = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      SELECT "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl", "merchantDeepLink", "category"
      FROM "AwinCatalogProduct"
      WHERE ${whereCombined}
      ORDER BY ${scoreExpr} DESC, "title" ASC
      LIMIT ${take}
    `);

    return rows;
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
          brand: r.brand,
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
          brand: r.brand,
          searchText: r.searchText,
        },
      });
      upserted++;
    }
    return { upserted };
  }
}

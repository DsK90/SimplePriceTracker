import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AwinFeedRow } from './awin-feed-csv';
import { techOnlyPrismaWhere, techOnlySqlAndFragment } from './catalog-tech-filter';

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
  categoryPath: true,
  description: true,
  productModel: true,
  modelNumber: true,
  rrpPrice: true,
  basePrice: true,
  deliveryCost: true,
} satisfies Prisma.AwinCatalogProductSelect;

export type CatalogSearchRow = {
  feedKey: string;
  title: string;
  price: Prisma.Decimal | string | number;
  currency: string;
  advertiserName: string | null;
  brand: string | null;
  imageUrl: string | null;
  merchantDeepLink: string;
  category: string | null;
  categoryPath: string | null;
  description: string | null;
  productModel: string | null;
  modelNumber: string | null;
  rrpPrice: Prisma.Decimal | string | number | null;
  basePrice: Prisma.Decimal | string | number | null;
  deliveryCost: Prisma.Decimal | string | number | null;
};

export type CatalogSearchOptions = {
  limit?: number;
  offset?: number;
  techOnly?: boolean;
  advertiser?: string;
};

@Injectable()
export class AwinCatalogService {
  private readonly log = new Logger(AwinCatalogService.name);
  private readonly highlightsCache = new Map<
    string,
    { expiresAt: number; rows: CatalogSearchRow[] }
  >();
  private readonly highlightsCacheTtlMs = 45_000;

  constructor(private prisma: PrismaService) {}

  private listFilters(
    techOnly: boolean,
    advertiser?: string,
  ): Prisma.AwinCatalogProductWhereInput {
    const parts: Prisma.AwinCatalogProductWhereInput[] = [];
    if (techOnly) parts.push(techOnlyPrismaWhere());
    const adv = advertiser?.trim();
    if (adv)
      parts.push({ advertiserName: { contains: adv, mode: 'insensitive' as const } });
    if (parts.length === 0) return {};
    return { AND: parts };
  }

  private mergeWhere(
    base: Prisma.AwinCatalogProductWhereInput,
    techOnly: boolean,
    advertiser?: string,
  ): Prisma.AwinCatalogProductWhereInput {
    const extra = this.listFilters(techOnly, advertiser);
    if (Object.keys(extra).length === 0) return base;
    return { AND: [base, extra] };
  }

  /**
   * Product search: URLs match `merchantDeepLink`.
   * Plain text: every token must match via substring (case-insensitive) or pg_trgm `word_similarity` (typo-tolerant).
   */
  async search(q: string, options: CatalogSearchOptions = {}) {
    const trimmed = q.trim().slice(0, 2000);
    if (trimmed.length < 2) return [];
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);
    const techOnly = options.techOnly === true;
    const advertiser = options.advertiser;

    if (this.looksLikeUrl(trimmed)) {
      const byUrl = await this.searchByMerchantUrl(trimmed, limit, offset, techOnly, advertiser);
      if (byUrl.length > 0) return byUrl;
    }

    return await this.searchByProductText(trimmed, limit, offset, techOnly, advertiser);
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

  /**
   * Top products by discount when RRP is present; else recently updated rows (tech filter optional).
   */
  async highlights(
    techOnly: boolean,
    limit: number,
    advertiser?: string,
  ): Promise<CatalogSearchRow[]> {
    const take = Math.min(50, Math.max(1, limit));
    const techSql = techOnly ? techOnlySqlAndFragment() : Prisma.empty;
    const adv = advertiser?.trim();
    const advSql =
      adv && adv.length > 0
        ? Prisma.sql`AND COALESCE("advertiserName", '') ILIKE ${`%${adv}%`}`
        : Prisma.empty;
    const cacheKey = `${techOnly ? 1 : 0}|${take}|${(adv || '').toLowerCase()}`;
    const now = Date.now();
    const cached = this.highlightsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.rows;

    const discounted = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl",
        "merchantDeepLink", "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost"
      FROM "AwinCatalogProduct"
      WHERE "rrpPrice" IS NOT NULL
        AND "rrpPrice" > 0
        AND "price" < "rrpPrice"
      ${techSql}
      ${advSql}
      ORDER BY ("rrpPrice" - "price") / NULLIF("rrpPrice", 0) DESC, "title" ASC
      LIMIT ${take}
    `);
    if (discounted.length >= Math.min(5, take)) {
      this.highlightsCache.set(cacheKey, {
        expiresAt: now + this.highlightsCacheTtlMs,
        rows: discounted,
      });
      return discounted;
    }

    const fallback = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl",
        "merchantDeepLink", "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost"
      FROM "AwinCatalogProduct"
      WHERE 1=1
      ${techSql}
      ${advSql}
      ORDER BY "updatedFromFeedAt" DESC, "title" ASC
      LIMIT ${take}
    `);
    this.highlightsCache.set(cacheKey, {
      expiresAt: now + this.highlightsCacheTtlMs,
      rows: fallback,
    });
    return fallback;
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

  private async searchByMerchantUrl(
    trimmed: string,
    take: number,
    skip: number,
    techOnly: boolean,
    advertiser?: string,
  ) {
    const variants = this.urlSearchVariants(trimmed);
    if (variants.length === 0) return [];
    const base: Prisma.AwinCatalogProductWhereInput = {
      OR: variants.map((v) => ({
        merchantDeepLink: { contains: v, mode: 'insensitive' as const },
      })),
    };
    const where = this.mergeWhere(base, techOnly, advertiser);
    return this.prisma.awinCatalogProduct.findMany({
      where,
      take,
      skip,
      orderBy: { title: 'asc' },
      select: CATALOG_SEARCH_SELECT,
    });
  }

  private async searchByProductText(
    trimmed: string,
    take: number,
    skip: number,
    techOnly: boolean,
    advertiser?: string,
  ): Promise<CatalogSearchRow[]> {
    const tokens = AwinCatalogService.catalogQueryTokens(trimmed);
    if (tokens.length === 0) return [];
    const tokenSqls = tokens.map((t) => t.toLowerCase().slice(0, 200));
    const candidateLimit = Math.min(800, Math.max(150, (take + skip) * 20));
    const threshold = this.fuzzyMinSimilarity();

    const mustMatchParts = tokenSqls.map(
      (tok) => Prisma.sql`(
        "title" ILIKE ${`%${tok}%`}
        OR COALESCE("brand", '') ILIKE ${`%${tok}%`}
        OR COALESCE("advertiserName", '') ILIKE ${`%${tok}%`}
        OR COALESCE("category", '') ILIKE ${`%${tok}%`}
        OR COALESCE("categoryPath", '') ILIKE ${`%${tok}%`}
        OR COALESCE("productModel", '') ILIKE ${`%${tok}%`}
        OR COALESCE("modelNumber", '') ILIKE ${`%${tok}%`}
        OR COALESCE("searchText", '') ILIKE ${`%${tok}%`}
        OR lower(COALESCE("searchText", '')) % ${tok}
        OR word_similarity(${tok}, lower(COALESCE("searchText", ''))) >= ${threshold}
      )`,
    );
    const mustMatchWhere = Prisma.join(mustMatchParts, ' AND ');

    const accessoryPenalty = this.accessoryPenaltySql(tokenSqls);

    const scoreParts = tokenSqls.map(
      (tok) =>
        Prisma.sql`(
          CASE WHEN lower("title") = ${tok} THEN 24 ELSE 0 END
          + CASE WHEN lower("title") LIKE ${`${tok}%`} THEN 16 ELSE 0 END
          + CASE WHEN lower(COALESCE("productModel", '')) LIKE ${`${tok}%`} THEN 12 ELSE 0 END
          + CASE WHEN lower(COALESCE("category", '')) LIKE ${`${tok}%`} THEN 8 ELSE 0 END
          + CASE WHEN lower(COALESCE("title", '')) LIKE ${`% ${tok} %`} THEN 7 ELSE 0 END
          + CASE WHEN lower(COALESCE("title", '')) LIKE ${`%${tok}%`} THEN 5 ELSE 0 END
          + (word_similarity(${tok}, lower("title")) * 10)
          + (word_similarity(${tok}, lower(COALESCE("productModel", ''))) * 5)
          + (word_similarity(${tok}, lower(COALESCE("brand", ''))) * 4)
          + (word_similarity(${tok}, lower(COALESCE("category", ''))) * 2)
          + (word_similarity(${tok}, lower(COALESCE("searchText", ''))) * 3)
        )`,
    );
    const rawScoreExpr =
      scoreParts.length === 1 ? scoreParts[0] : Prisma.sql`(${Prisma.join(scoreParts, ' + ')})`;
    const scoreExpr = Prisma.sql`(${rawScoreExpr} ${accessoryPenalty})`;

    const techSql = techOnly ? techOnlySqlAndFragment() : Prisma.empty;
    const adv = advertiser?.trim();
    const advSql =
      adv && adv.length > 0
        ? Prisma.sql`AND COALESCE("advertiserName", '') ILIKE ${`%${adv}%`}`
        : Prisma.empty;

    try {
      const rows = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      WITH candidate AS (
        SELECT
          "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl",
          "merchantDeepLink", "category", "categoryPath", "description",
          "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost", "searchText",
          ${scoreExpr} AS "__score"
        FROM "AwinCatalogProduct"
        WHERE ${mustMatchWhere}
        ${techSql}
        ${advSql}
        ORDER BY "__score" DESC, "price" DESC, "title" ASC
        LIMIT ${candidateLimit}
      )
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl",
        "merchantDeepLink", "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost"
      FROM candidate
      ORDER BY "__score" DESC, "price" DESC, "title" ASC
      LIMIT ${take} OFFSET ${skip}
    `);
      return rows;
    } catch (e) {
      this.log.warn(
        `Ranked catalog search failed (${e instanceof Error ? e.message : String(e)}); falling back to substring search.`,
      );
      const tokenWhere: Prisma.AwinCatalogProductWhereInput = {
        AND: tokens.map((t) => ({
          searchText: { contains: t, mode: 'insensitive' as const },
        })),
      };
      const where = this.mergeWhere(tokenWhere, techOnly, advertiser);
      return this.prisma.awinCatalogProduct.findMany({
        where,
        take,
        skip,
        orderBy: [{ price: 'desc' }, { title: 'asc' }],
        select: CATALOG_SEARCH_SELECT,
      });
    }
  }

  private accessoryPenaltySql(tokens: string[]): Prisma.Sql {
    const techTerms = [
      'laptop',
      'notebook',
      'computer',
      'ram',
      'ssd',
      'gpu',
      'grafikkarte',
      'kamera',
      'handy',
      'smartphone',
    ];
    const hasTechIntent = tokens.some((t) => techTerms.includes(t));
    if (!hasTechIntent) return Prisma.empty;

    const accessoryTerms = [
      'tasche',
      'bag',
      'hülle',
      'huelle',
      'sleeve',
      'rucksack',
      'case',
      'cover',
      'halterung',
      'dock',
      'kabel',
      'adapter',
    ];
    const checks = accessoryTerms.map((kw) => {
      const like = `%${kw}%`;
      return Prisma.sql`(
        lower("title") LIKE ${like}
        OR lower(COALESCE("category", '')) LIKE ${like}
        OR lower(COALESCE("categoryPath", '')) LIKE ${like}
      )`;
    });
    return Prisma.sql` + (CASE WHEN ${Prisma.join(checks, ' OR ')} THEN -12 ELSE 0 END)`;
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
      upserted++;
    }
    return { upserted };
  }
}

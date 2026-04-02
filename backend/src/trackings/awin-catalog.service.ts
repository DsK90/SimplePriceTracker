import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AwinFeedRow } from './awin-feed-csv';
import { classifyOffersComposition, isOffersAccessoryRow } from './catalog-offers-composition';
import { techOnlyPrismaWhere, techOnlySqlAndFragment } from './catalog-tech-filter';

const CATALOG_SEARCH_SELECT = {
  feedKey: true,
  title: true,
  price: true,
  currency: true,
  advertiserName: true,
  brand: true,
  imageUrl: true,
  imageUrl2: true,
  merchantDeepLink: true,
  awDeepLink: true,
  language: true,
  categoryId: true,
  dataFeedId: true,
  displayPriceRaw: true,
  storePrice: true,
  savingsPercent: true,
  savingAmount: true,
  promotionalText: true,
  feedProductUpdatedAt: true,
  category: true,
  categoryPath: true,
  description: true,
  productModel: true,
  modelNumber: true,
  rrpPrice: true,
  basePrice: true,
  deliveryCost: true,
  reviewsText: true,
  averageRating: true,
  stockStatus: true,
  stockQuantity: true,
} satisfies Prisma.AwinCatalogProductSelect;

export type CatalogSearchRow = {
  feedKey: string;
  title: string;
  price: Prisma.Decimal | string | number;
  currency: string;
  advertiserName: string | null;
  brand: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  merchantDeepLink: string;
  awDeepLink: string | null;
  language: string | null;
  categoryId: string | null;
  dataFeedId: string | null;
  displayPriceRaw: string | null;
  storePrice: Prisma.Decimal | string | number | null;
  savingsPercent: Prisma.Decimal | string | number | null;
  savingAmount: Prisma.Decimal | string | number | null;
  promotionalText: string | null;
  feedProductUpdatedAt: Date | string | null;
  category: string | null;
  categoryPath: string | null;
  description: string | null;
  productModel: string | null;
  modelNumber: string | null;
  rrpPrice: Prisma.Decimal | string | number | null;
  basePrice: Prisma.Decimal | string | number | null;
  deliveryCost: Prisma.Decimal | string | number | null;
  reviewsText: string | null;
  averageRating: Prisma.Decimal | string | number | null;
  stockStatus: string | null;
  stockQuantity: number | null;
};

export type CatalogSearchOptions = {
  limit?: number;
  offset?: number;
  techOnly?: boolean;
  advertiser?: string;
};

export type CatalogHighlightsOptions = {
  advertiser?: string;
  minPrice?: number;
  maxPrice?: number;
  preferredKeywords?: string[];
  /** Final tie-breaker for `price` after preferred score and discount (default desc). */
  priceSort?: 'asc' | 'desc';
  /**
   * Enforce mix: ≥50% laptop/PC systems and ≥20% hardware/GPU (categoryPath from
   * merchant_product_category_path plus text fallbacks).
   * Skips advertiser diversity pass so quotas can be met.
   */
  enforceOffersComposition?: boolean;
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
    options: CatalogHighlightsOptions = {},
  ): Promise<CatalogSearchRow[]> {
    const take = Math.min(50, Math.max(1, limit));
    const techSql = techOnly ? techOnlySqlAndFragment() : Prisma.empty;
    const adv = options.advertiser?.trim();
    const advSql =
      adv && adv.length > 0
        ? Prisma.sql`AND COALESCE("advertiserName", '') ILIKE ${`%${adv}%`}`
        : Prisma.empty;
    const minPrice = Number.isFinite(options.minPrice)
      ? Math.max(0, options.minPrice as number)
      : undefined;
    const maxPrice = Number.isFinite(options.maxPrice)
      ? Math.max(0, options.maxPrice as number)
      : undefined;
    const minPriceSql =
      minPrice != null ? Prisma.sql`AND "price" >= ${new Prisma.Decimal(minPrice)}` : Prisma.empty;
    const maxPriceSql =
      maxPrice != null ? Prisma.sql`AND "price" <= ${new Prisma.Decimal(maxPrice)}` : Prisma.empty;
    const preferredKeywords = (options.preferredKeywords ?? [])
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 2)
      .slice(0, 20);
    const preferredScoreExpr = this.preferredOfferScoreSql(preferredKeywords);
    const compose = options.enforceOffersComposition === true;
    const queryTake =
      adv && adv.length > 0
        ? take
        : compose
          ? Math.min(320, Math.max(take * 10, 60))
          : Math.min(180, Math.max(take * 6, take));
    const priceSort = options.priceSort === 'asc' ? 'asc' : 'desc';
    const priceOrderSql =
      priceSort === 'asc' ? Prisma.sql`"price" ASC` : Prisma.sql`"price" DESC`;

    const cacheKey = [
      techOnly ? '1' : '0',
      String(take),
      (adv || '').toLowerCase(),
      minPrice == null ? '' : String(minPrice),
      maxPrice == null ? '' : String(maxPrice),
      preferredKeywords.join(','),
      priceSort,
      compose ? 'c1' : 'c0',
    ].join('|');
    const now = Date.now();
    const cached = this.highlightsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.rows;

    const withImage = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl", "imageUrl2",
        "merchantDeepLink", "awDeepLink", "language", "categoryId", "dataFeedId", "displayPriceRaw",
        "storePrice", "savingsPercent", "savingAmount", "promotionalText", "feedProductUpdatedAt",
        "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost",
        "reviewsText", "averageRating", "stockStatus", "stockQuantity",
        ${preferredScoreExpr} AS "__preferredScore"
      FROM "AwinCatalogProduct"
      WHERE COALESCE("imageUrl", '') <> ''
      ${techSql}
      ${advSql}
      ${minPriceSql}
      ${maxPriceSql}
      ORDER BY
        "__preferredScore" DESC,
        GREATEST(COALESCE("rrpPrice", 0) - "price", 0) DESC,
        ${priceOrderSql},
        "title" ASC
      LIMIT ${queryTake}
    `);
    if (withImage.length > 0) {
      const finalRows = this.finishHighlightRows(withImage, take, adv, compose);
      this.highlightsCache.set(cacheKey, {
        expiresAt: now + this.highlightsCacheTtlMs,
        rows: finalRows,
      });
      return finalRows;
    }

    const fallback = await this.prisma.$queryRaw<CatalogSearchRow[]>(Prisma.sql`
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl", "imageUrl2",
        "merchantDeepLink", "awDeepLink", "language", "categoryId", "dataFeedId", "displayPriceRaw",
        "storePrice", "savingsPercent", "savingAmount", "promotionalText", "feedProductUpdatedAt",
        "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost",
        "reviewsText", "averageRating", "stockStatus", "stockQuantity",
        ${preferredScoreExpr} AS "__preferredScore"
      FROM "AwinCatalogProduct"
      WHERE 1=1
      ${techSql}
      ${advSql}
      ${minPriceSql}
      ${maxPriceSql}
      ORDER BY
        "__preferredScore" DESC,
        GREATEST(COALESCE("rrpPrice", 0) - "price", 0) DESC,
        ${priceOrderSql},
        "title" ASC
      LIMIT ${queryTake}
    `);
    const finalFallback = this.finishHighlightRows(fallback, take, adv, compose);
    this.highlightsCache.set(cacheKey, {
      expiresAt: now + this.highlightsCacheTtlMs,
      rows: finalFallback,
    });
    return finalFallback;
  }

  private ensureAdvertiserMix(
    rows: CatalogSearchRow[],
    take: number,
    minPerAdvertiser: number,
  ): CatalogSearchRow[] {
    if (rows.length <= take) return rows;
    const groups = new Map<string, CatalogSearchRow[]>();
    for (const row of rows) {
      const key = (row.advertiserName ?? '').trim().toLowerCase() || '__unknown__';
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }

    const picked: CatalogSearchRow[] = [];
    const used = new Set<string>();

    for (let pass = 0; pass < minPerAdvertiser && picked.length < take; pass++) {
      for (const list of groups.values()) {
        const item = list[pass];
        if (!item) continue;
        if (used.has(item.feedKey)) continue;
        picked.push(item);
        used.add(item.feedKey);
        if (picked.length >= take) break;
      }
    }

    if (picked.length < take) {
      for (const row of rows) {
        if (used.has(row.feedKey)) continue;
        picked.push(row);
        used.add(row.feedKey);
        if (picked.length >= take) break;
      }
    }
    return picked;
  }

  private finishHighlightRows(
    rows: CatalogSearchRow[],
    take: number,
    adv: string | undefined,
    compose: boolean,
  ): CatalogSearchRow[] {
    if (rows.length === 0) return rows;
    if (adv && adv.trim().length > 0) return rows.slice(0, take);
    if (compose) return this.ensureOffersComposition(rows, take);
    return this.ensureAdvertiserMix(rows, take, 2);
  }

  /**
   * ≥50% laptop/PC, ≥20% hardware/GPU. Order = quota pass (rank order) then fill pass (rank order),
   * so any prefix of length `n` still meets the minimums when the pool contains enough matches.
   */
  private ensureOffersComposition(rows: CatalogSearchRow[], take: number): CatalogSearchRow[] {
    const n = Math.min(Math.max(1, take), rows.length);
    const minLaptop = Math.ceil(n * 0.5);
    const minHw = Math.ceil(n * 0.2);

    const usedKeys = new Set<string>();
    const picked: CatalogSearchRow[] = [];
    let countL = 0;
    let countH = 0;

    for (let i = 0; i < rows.length && picked.length < n && (countL < minLaptop || countH < minHw); i++) {
      const row = rows[i];
      if (usedKeys.has(row.feedKey)) continue;
      const { laptopOrPc, hardwareGpu } = classifyOffersComposition(row);
      const needL = countL < minLaptop && laptopOrPc;
      const needH = countH < minHw && hardwareGpu;
      if (!needL && !needH) continue;
      usedKeys.add(row.feedKey);
      picked.push(row);
      if (laptopOrPc) countL++;
      if (hardwareGpu) countH++;
    }

    for (let i = 0; i < rows.length && picked.length < n; i++) {
      const row = rows[i];
      if (usedKeys.has(row.feedKey)) continue;
      if (isOffersAccessoryRow(row)) continue;
      const c = classifyOffersComposition(row);
      if (!c.laptopOrPc && !c.hardwareGpu) continue;
      usedKeys.add(row.feedKey);
      picked.push(row);
    }

    return picked;
  }

  private preferredOfferScoreSql(keywords: string[]): Prisma.Sql {
    if (keywords.length === 0) return Prisma.sql`0`;
    const parts = keywords.map((kw) => {
      const like = `%${kw}%`;
      return Prisma.sql`(
        CASE WHEN (
          lower("title") LIKE ${like}
          OR lower(COALESCE("category", '')) LIKE ${like}
          OR lower(COALESCE("categoryPath", '')) LIKE ${like}
          OR lower(COALESCE("productModel", '')) LIKE ${like}
        ) THEN 1 ELSE 0 END
      )`;
    });
    return parts.length === 1 ? parts[0] : Prisma.sql`(${Prisma.join(parts, ' + ')})`;
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
    const tokenWhere: Prisma.AwinCatalogProductWhereInput = {
      AND: tokens.map((t) => ({
        searchText: { contains: t, mode: 'insensitive' as const },
      })),
    };
    const where = this.mergeWhere(tokenWhere, techOnly, advertiser);
    const exact = await this.prisma.awinCatalogProduct.findMany({
      where,
      take,
      skip,
      orderBy: [{ price: 'desc' }, { title: 'asc' }],
      select: CATALOG_SEARCH_SELECT,
    });
    if (exact.length > 0) return exact;

    // Keep fallback cheap; avoid long-running ranked scans for broad terms.
    if (tokens.length > 3 || trimmed.length > 48) return [];

    const tokenSqls = tokens.map((t) => t.toLowerCase().slice(0, 200));
    const candidateLimit = Math.min(220, Math.max(80, (take + skip) * 8));

    const mustMatchParts = tokenSqls.map(
      (tok) => Prisma.sql`(
        "title" ILIKE ${`%${tok}%`}
        OR COALESCE("brand", '') ILIKE ${`%${tok}%`}
        OR COALESCE("advertiserName", '') ILIKE ${`%${tok}%`}
        OR COALESCE("category", '') ILIKE ${`%${tok}%`}
        OR COALESCE("categoryPath", '') ILIKE ${`%${tok}%`}
        OR COALESCE("productModel", '') ILIKE ${`%${tok}%`}
        OR COALESCE("modelNumber", '') ILIKE ${`%${tok}%`}
        OR lower(COALESCE("searchText", '')) % ${tok}
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
          + (word_similarity(${tok}, lower("title")) * 6)
          + (word_similarity(${tok}, lower(COALESCE("productModel", ''))) * 3)
          + (word_similarity(${tok}, lower(COALESCE("brand", ''))) * 2)
          + (word_similarity(${tok}, lower(COALESCE("searchText", ''))) * 2)
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
          "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl", "imageUrl2",
          "merchantDeepLink", "awDeepLink", "language", "categoryId", "dataFeedId", "displayPriceRaw",
          "storePrice", "savingsPercent", "savingAmount", "promotionalText", "feedProductUpdatedAt",
          "category", "categoryPath", "description",
          "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost",
          "reviewsText", "averageRating", "stockStatus", "stockQuantity", "searchText",
          ${scoreExpr} AS "__score"
        FROM "AwinCatalogProduct"
        WHERE ${mustMatchWhere}
        ${techSql}
        ${advSql}
        ORDER BY "__score" DESC, "price" DESC, "title" ASC
        LIMIT ${candidateLimit}
      )
      SELECT
        "feedKey", "title", "price", "currency", "advertiserName", "brand", "imageUrl", "imageUrl2",
        "merchantDeepLink", "awDeepLink", "language", "categoryId", "dataFeedId", "displayPriceRaw",
        "storePrice", "savingsPercent", "savingAmount", "promotionalText", "feedProductUpdatedAt",
        "category", "categoryPath", "description",
        "productModel", "modelNumber", "rrpPrice", "basePrice", "deliveryCost",
        "reviewsText", "averageRating", "stockStatus", "stockQuantity"
      FROM candidate
      ORDER BY "__score" DESC, "price" DESC, "title" ASC
      LIMIT ${take} OFFSET ${skip}
    `);
      return rows;
    } catch (e) {
      this.log.warn(
        `Ranked catalog search failed (${e instanceof Error ? e.message : String(e)}); falling back to substring search.`,
      );
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
          awDeepLink: r.awDeepLink,
          language: r.language,
          categoryId: r.categoryId,
          dataFeedId: r.dataFeedId,
          displayPriceRaw: r.displayPriceRaw,
          storePrice: r.storePrice != null ? new Prisma.Decimal(r.storePrice) : null,
          savingsPercent:
            r.savingsPercent != null ? new Prisma.Decimal(r.savingsPercent) : null,
          savingAmount:
            r.savingAmount != null ? new Prisma.Decimal(r.savingAmount) : null,
          promotionalText: r.promotionalText,
          feedProductUpdatedAt: r.feedProductUpdatedAt,
          imageUrl: r.imageUrl,
          imageUrl2: r.imageUrl2,
          category: r.category,
          categoryPath: r.categoryPath,
          brand: r.brand,
          productModel: r.productModel,
          modelNumber: r.modelNumber,
          rrpPrice: r.rrpPrice != null ? new Prisma.Decimal(r.rrpPrice) : null,
          basePrice: r.basePrice != null ? new Prisma.Decimal(r.basePrice) : null,
          deliveryCost: r.deliveryCost != null ? new Prisma.Decimal(r.deliveryCost) : null,
          reviewsText: r.reviewsText,
          averageRating:
            r.averageRating != null ? new Prisma.Decimal(r.averageRating) : null,
          stockStatus: r.stockStatus,
          stockQuantity: r.stockQuantity,
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
          awDeepLink: r.awDeepLink,
          language: r.language,
          categoryId: r.categoryId,
          dataFeedId: r.dataFeedId,
          displayPriceRaw: r.displayPriceRaw,
          storePrice: r.storePrice != null ? new Prisma.Decimal(r.storePrice) : null,
          savingsPercent:
            r.savingsPercent != null ? new Prisma.Decimal(r.savingsPercent) : null,
          savingAmount:
            r.savingAmount != null ? new Prisma.Decimal(r.savingAmount) : null,
          promotionalText: r.promotionalText,
          feedProductUpdatedAt: r.feedProductUpdatedAt,
          imageUrl: r.imageUrl,
          imageUrl2: r.imageUrl2,
          category: r.category,
          categoryPath: r.categoryPath,
          brand: r.brand,
          productModel: r.productModel,
          modelNumber: r.modelNumber,
          rrpPrice: r.rrpPrice != null ? new Prisma.Decimal(r.rrpPrice) : null,
          basePrice: r.basePrice != null ? new Prisma.Decimal(r.basePrice) : null,
          deliveryCost: r.deliveryCost != null ? new Prisma.Decimal(r.deliveryCost) : null,
          reviewsText: r.reviewsText,
          averageRating:
            r.averageRating != null ? new Prisma.Decimal(r.averageRating) : null,
          stockStatus: r.stockStatus,
          stockQuantity: r.stockQuantity,
          searchText: r.searchText,
        },
      });
      upserted++;
    }
    return { upserted };
  }
}

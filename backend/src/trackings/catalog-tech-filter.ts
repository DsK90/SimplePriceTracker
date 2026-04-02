import { Prisma } from '@prisma/client';

/**
 * Strict catalog scope requested by product requirements:
 * Computer/Laptop/Monitor/GPU/Grafikkarte/Kamera/Objektiv/Speicherkarten/SSD/Festplatte/Smartphones
 * plus accessories (bags/cases) for these device families.
 */
export const CATALOG_TECH_CORE_KEYWORDS: readonly string[] = [
  'computer',
  'pc',
  'desktop',
  'laptop',
  'notebook',
  'monitor',
  'bildschirm',
  'display',
  'gpu',
  'grafikkarte',
  'videokarte',
  'kamera',
  'camera',
  'objektiv',
  'lens',
  'speicherkarte',
  'memory card',
  'sd-karte',
  'micro sd',
  'ssd',
  'festplatte',
  'hard drive',
  'hdd',
  'smartphone',
  'handy',
  'tablet',
  'tablet pc',
  'keyboard',
  'tastatur',
  'computer mouse',
  'pc mouse',
  'smartwatch',
  'charger',
  'powerbank',
  'power bank',
  'headphones',
  'headset',
  'earphones',
  'earphone',
  'earbud',
  'software'
] as const;

export const CATALOG_TECH_ACCESSORY_KEYWORDS: readonly string[] = [
  'tasche',
  'bag',
  'huelle',
  'hülle',
  'case',
  'cover',
  'sleeve',
  'earbud case',
] as const;

export const CATALOG_TECH_ACCESSORY_CONTEXT_KEYWORDS: readonly string[] = [
  'laptop',
  'notebook',
  'smartphone',
  'handy',
  'kamera',
  'camera',
  'objektiv',
  'lens',
] as const;

/**
 * Tech scope on a single column so Postgres can use the `searchText` GIN (trigram) index.
 * `searchText` is built from title, description, brand, category, categoryPath, productModel, etc.
 * (slightly broader than the old title/category/path/model-only check, but far cheaper at scale).
 */
export function techOnlyPrismaWhere(): Prisma.AwinCatalogProductWhereInput {
  const coreMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_CORE_KEYWORDS.map((kw) => ({
      searchText: { contains: kw, mode: 'insensitive' as const },
    })),
  };
  const accessoryMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_ACCESSORY_KEYWORDS.map((kw) => ({
      searchText: { contains: kw, mode: 'insensitive' as const },
    })),
  };
  const contextMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_ACCESSORY_CONTEXT_KEYWORDS.map((kw) => ({
      searchText: { contains: kw, mode: 'insensitive' as const },
    })),
  };

  return {
    OR: [coreMatch, { AND: [accessoryMatch, contextMatch] }],
  };
}

/** Raw SQL AND-fragment for use in $queryRaw (same semantics as techOnlyPrismaWhere). */
export function techOnlySqlAndFragment(): Prisma.Sql {
  const st = Prisma.sql`lower(COALESCE("searchText", ''))`;

  const coreParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_CORE_KEYWORDS) {
    const like = `%${kw.toLowerCase()}%`;
    coreParts.push(Prisma.sql`(${st} LIKE ${like})`);
  }

  const accessoryParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_ACCESSORY_KEYWORDS) {
    const like = `%${kw.toLowerCase()}%`;
    accessoryParts.push(Prisma.sql`(${st} LIKE ${like})`);
  }

  const contextParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_ACCESSORY_CONTEXT_KEYWORDS) {
    const like = `%${kw.toLowerCase()}%`;
    contextParts.push(Prisma.sql`(${st} LIKE ${like})`);
  }

  const coreBundle = Prisma.join(coreParts, ' OR ');
  const accessoryBundle = Prisma.join(accessoryParts, ' OR ');
  const contextBundle = Prisma.join(contextParts, ' OR ');

  return Prisma.sql`AND ( (${coreBundle}) OR ((${accessoryBundle}) AND (${contextBundle})) )`;
}

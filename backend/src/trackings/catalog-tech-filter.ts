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
  'earbud'
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

function fieldContains(kw: string): Prisma.AwinCatalogProductWhereInput {
  return {
    OR: [
      { title: { contains: kw, mode: 'insensitive' } },
      { category: { contains: kw, mode: 'insensitive' } },
      { categoryPath: { contains: kw, mode: 'insensitive' } },
      { productModel: { contains: kw, mode: 'insensitive' } },
    ],
  };
}

export function techOnlyPrismaWhere(): Prisma.AwinCatalogProductWhereInput {
  const coreMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_CORE_KEYWORDS.map((kw) => fieldContains(kw)),
  };
  const accessoryMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_ACCESSORY_KEYWORDS.map((kw) => fieldContains(kw)),
  };
  const contextMatch: Prisma.AwinCatalogProductWhereInput = {
    OR: CATALOG_TECH_ACCESSORY_CONTEXT_KEYWORDS.map((kw) => fieldContains(kw)),
  };

  return {
    OR: [coreMatch, { AND: [accessoryMatch, contextMatch] }],
  };
}

/** Raw SQL AND-fragment for use in $queryRaw (same semantics as techOnlyPrismaWhere). */
export function techOnlySqlAndFragment(): Prisma.Sql {
  const coreParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_CORE_KEYWORDS) {
    const like = `%${kw}%`;
    coreParts.push(
      Prisma.sql`(
        "title" ILIKE ${like}
        OR COALESCE("category", '') ILIKE ${like}
        OR COALESCE("categoryPath", '') ILIKE ${like}
        OR COALESCE("productModel", '') ILIKE ${like}
      )`,
    );
  }

  const accessoryParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_ACCESSORY_KEYWORDS) {
    const like = `%${kw}%`;
    accessoryParts.push(
      Prisma.sql`(
        "title" ILIKE ${like}
        OR COALESCE("category", '') ILIKE ${like}
        OR COALESCE("categoryPath", '') ILIKE ${like}
        OR COALESCE("productModel", '') ILIKE ${like}
      )`,
    );
  }

  const contextParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_ACCESSORY_CONTEXT_KEYWORDS) {
    const like = `%${kw}%`;
    contextParts.push(
      Prisma.sql`(
        "title" ILIKE ${like}
        OR COALESCE("category", '') ILIKE ${like}
        OR COALESCE("categoryPath", '') ILIKE ${like}
        OR COALESCE("productModel", '') ILIKE ${like}
      )`,
    );
  }

  const coreBundle = Prisma.join(coreParts, ' OR ');
  const accessoryBundle = Prisma.join(accessoryParts, ' OR ');
  const contextBundle = Prisma.join(contextParts, ' OR ');

  return Prisma.sql`AND ( (${coreBundle}) OR ((${accessoryBundle}) AND (${contextBundle})) )`;
}

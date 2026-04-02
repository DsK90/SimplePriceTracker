import { Prisma } from '@prisma/client';

/**
 * German/English fragments that strongly suggest non-tech retail (deny-list).
 * Feeds are mostly tech; excluding obvious household/fashion/etc. reduces noise.
 */
export const CATALOG_TECH_DENY_KEYWORDS: readonly string[] = [
  'haushalt',
  'küche',
  'kueche',
  'garten',
  'mode',
  'bekleidung',
  'lebensmittel',
  'drogerie',
  'möbel',
  'moebel',
  'spielzeug',
  'sport',
  'baumarkt',
  'tierbedarf',
  'baby',
  'schmuck',
  'wohnen',
  'dekoration',
  'körper',
  'koerper',
  'parfüm',
  'parfum',
  'reinigung',
  'kosmetik',
  'schuhe',
  'damen',
  'herren',
  'bücher',
  'buecher',
  'spielwaren',
  'textilien',
  'bettwäsche',
  'bettwaesche',
  'handtuch',
  'vorhang',
] as const;

/**
 * Strong tech signals (incl. software). If any match, row passes techOnly even when
 * a deny keyword might appear elsewhere (e.g. bundle names).
 */
export const CATALOG_TECH_ALLOW_KEYWORDS: readonly string[] = [
  'software',
  'spielesoftware',
  'anwendungssoftware',
  'betriebssystem',
  'lizenz',
  'lizenzschlüssel',
  'lizenzschluessel',
  'antivirus',
  'microsoft 365',
  'office 365',
  'microsoft office',
  'creative cloud',
  'adobe creative',
  'programmpaket',
  'saas',
  'download-version',
  'vollversion',
  'upgrade-version',
  'e-download',
  'key card',
  'steam key',
  'epic games',
] as const;

function denyFreePrismaWhere(): Prisma.AwinCatalogProductWhereInput {
  return {
    AND: CATALOG_TECH_DENY_KEYWORDS.map((kw) => ({
      NOT: {
        OR: [
          { title: { contains: kw, mode: 'insensitive' } },
          { category: { contains: kw, mode: 'insensitive' } },
          { categoryPath: { contains: kw, mode: 'insensitive' } },
        ],
      },
    })),
  };
}

function allowMatchPrismaWhere(): Prisma.AwinCatalogProductWhereInput {
  const orFields = CATALOG_TECH_ALLOW_KEYWORDS.flatMap((kw) => [
    { title: { contains: kw, mode: 'insensitive' as const } },
    { category: { contains: kw, mode: 'insensitive' as const } },
    { categoryPath: { contains: kw, mode: 'insensitive' as const } },
  ]);
  return { OR: orFields };
}

/**
 * Pass tech filter if: allow-list match OR no deny keyword in title/category/path.
 */
export function techOnlyPrismaWhere(): Prisma.AwinCatalogProductWhereInput {
  return {
    OR: [allowMatchPrismaWhere(), denyFreePrismaWhere()],
  };
}

/** Raw SQL AND-fragment for use in $queryRaw (same semantics as techOnlyPrismaWhere). */
export function techOnlySqlAndFragment(): Prisma.Sql {
  const denyParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_DENY_KEYWORDS) {
    const like = `%${kw}%`;
    denyParts.push(
      Prisma.sql`(
        "title" NOT ILIKE ${like}
        AND COALESCE("category", '') NOT ILIKE ${like}
        AND COALESCE("categoryPath", '') NOT ILIKE ${like}
      )`,
    );
  }
  const denyBundle = Prisma.join(denyParts, ' AND ');

  const allowParts: Prisma.Sql[] = [];
  for (const kw of CATALOG_TECH_ALLOW_KEYWORDS) {
    const like = `%${kw}%`;
    allowParts.push(
      Prisma.sql`(
        "title" ILIKE ${like}
        OR COALESCE("category", '') ILIKE ${like}
        OR COALESCE("categoryPath", '') ILIKE ${like}
      )`,
    );
  }
  const allowBundle = Prisma.join(allowParts, ' OR ');

  return Prisma.sql`AND ( (${allowBundle}) OR (${denyBundle}) )`;
}

-- AlterTable
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "awProductId" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "merchantProductId" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "ean" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

-- Backfill searchText from existing columns (re-import feed to enrich with ids/keywords)
UPDATE "AwinCatalogProduct" SET "searchText" = TRIM(
  BOTH ' ' FROM CONCAT_WS(
    ' ',
    NULLIF(TRIM("title"), ''),
    NULLIF(TRIM(COALESCE("description", '')), ''),
    NULLIF(TRIM(COALESCE("brand", '')), ''),
    NULLIF(TRIM(COALESCE("category", '')), ''),
    NULLIF(TRIM(COALESCE("advertiserName", '')), ''),
    NULLIF(TRIM(COALESCE("feedKey", '')), ''),
    NULLIF(TRIM(COALESCE("advertiserId", '')), ''),
    NULLIF(TRIM(COALESCE("merchantDeepLink", '')), '')
  )
);

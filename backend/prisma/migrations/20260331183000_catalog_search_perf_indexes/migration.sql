-- Speed up catalog search + URL match on larger datasets (100k+ rows)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_title_trgm_idx"
  ON "AwinCatalogProduct"
  USING gin (lower("title") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_brand_trgm_idx"
  ON "AwinCatalogProduct"
  USING gin (lower(COALESCE("brand", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_advertiserName_trgm_idx"
  ON "AwinCatalogProduct"
  USING gin (lower(COALESCE("advertiserName", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_merchantDeepLink_trgm_idx"
  ON "AwinCatalogProduct"
  USING gin (lower("merchantDeepLink") gin_trgm_ops);

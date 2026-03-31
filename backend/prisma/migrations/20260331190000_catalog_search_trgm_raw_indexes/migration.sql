-- Improve ILIKE token contains queries used by catalog search fast-path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_title_trgm_raw_idx"
  ON "AwinCatalogProduct"
  USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_brand_trgm_raw_idx"
  ON "AwinCatalogProduct"
  USING gin ("brand" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_advertiserName_trgm_raw_idx"
  ON "AwinCatalogProduct"
  USING gin ("advertiserName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_category_trgm_raw_idx"
  ON "AwinCatalogProduct"
  USING gin ("category" gin_trgm_ops);

-- Fuzzy product search (typos) via trigram word similarity on searchText
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AwinCatalogProduct_searchText_trgm_idx"
  ON "AwinCatalogProduct"
  USING gin (lower("searchText") gin_trgm_ops);

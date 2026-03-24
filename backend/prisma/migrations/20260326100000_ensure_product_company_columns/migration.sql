-- Idempotent: fixes DBs where productName/companyName were never applied (drift, wrong DB, failed deploy).
-- Safe to run on already-migrated databases (no-ops when columns already exist).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'productName'
  ) THEN
    ALTER TABLE "PriceTracking" ADD COLUMN "productName" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'companyName'
  ) THEN
    ALTER TABLE "PriceTracking" ADD COLUMN "companyName" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'title'
  ) THEN
    UPDATE "PriceTracking" SET "productName" = "title" WHERE "productName" IS NULL;
  END IF;

  UPDATE "PriceTracking" SET "productName" = 'Product' WHERE "productName" IS NULL OR TRIM("productName") = '';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'productName'
  ) THEN
    ALTER TABLE "PriceTracking" ALTER COLUMN "productName" SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'title'
  ) THEN
    ALTER TABLE "PriceTracking" DROP COLUMN "title";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PriceTracking' AND column_name = 'priceSelector'
  ) THEN
    ALTER TABLE "PriceTracking" DROP COLUMN "priceSelector";
  END IF;
END $$;

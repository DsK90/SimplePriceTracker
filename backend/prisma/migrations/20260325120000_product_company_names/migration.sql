-- AlterTable: replace title/priceSelector with productName/companyName
ALTER TABLE "PriceTracking" ADD COLUMN "productName" TEXT;
ALTER TABLE "PriceTracking" ADD COLUMN "companyName" TEXT;

UPDATE "PriceTracking" SET "productName" = "title" WHERE "productName" IS NULL;

UPDATE "PriceTracking" SET "productName" = 'Product' WHERE "productName" IS NULL OR TRIM("productName") = '';

ALTER TABLE "PriceTracking" DROP COLUMN "title";
ALTER TABLE "PriceTracking" DROP COLUMN "priceSelector";

ALTER TABLE "PriceTracking" ALTER COLUMN "productName" SET NOT NULL;

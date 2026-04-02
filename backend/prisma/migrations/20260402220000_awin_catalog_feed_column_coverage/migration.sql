-- AlterTable: remaining Awin CSV columns from publisher feed URL
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "awDeepLink" TEXT,
ADD COLUMN "language" VARCHAR(16),
ADD COLUMN "categoryId" VARCHAR(64),
ADD COLUMN "dataFeedId" VARCHAR(32),
ADD COLUMN "displayPriceRaw" VARCHAR(512),
ADD COLUMN "storePrice" DECIMAL(12,4),
ADD COLUMN "savingsPercent" DECIMAL(8,4),
ADD COLUMN "savingAmount" DECIMAL(12,4),
ADD COLUMN "promotionalText" TEXT,
ADD COLUMN "feedProductUpdatedAt" TIMESTAMP(3);

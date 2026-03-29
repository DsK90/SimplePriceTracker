-- CreateTable
CREATE TABLE "AwinCatalogProduct" (
    "id" TEXT NOT NULL,
    "feedKey" TEXT NOT NULL,
    "advertiserId" TEXT,
    "advertiserName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "merchantDeepLink" TEXT NOT NULL,
    "imageUrl" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "updatedFromFeedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwinCatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AwinCatalogProduct_feedKey_key" ON "AwinCatalogProduct"("feedKey");

CREATE INDEX "AwinCatalogProduct_title_idx" ON "AwinCatalogProduct"("title");

-- AlterTable
ALTER TABLE "PriceTracking" ADD COLUMN "awinFeedKey" TEXT;

CREATE INDEX "PriceTracking_awinFeedKey_idx" ON "PriceTracking"("awinFeedKey");

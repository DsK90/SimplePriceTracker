-- AlterTable
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "imageUrl2" TEXT,
ADD COLUMN "reviewsText" TEXT,
ADD COLUMN "averageRating" DECIMAL(3,2),
ADD COLUMN "stockStatus" VARCHAR(128),
ADD COLUMN "stockQuantity" INTEGER;

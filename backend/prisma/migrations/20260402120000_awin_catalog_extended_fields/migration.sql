-- AlterTable
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "categoryPath" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "productModel" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "modelNumber" TEXT;
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "rrpPrice" DECIMAL(12,4);
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "basePrice" DECIMAL(12,4);
ALTER TABLE "AwinCatalogProduct" ADD COLUMN "deliveryCost" DECIMAL(12,4);

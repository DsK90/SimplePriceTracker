-- AlterTable
ALTER TABLE "PriceTracking" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: preserve previous API order (newest first → sortOrder 0, 1, …)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) - 1 AS rn
  FROM "PriceTracking"
)
UPDATE "PriceTracking" p
SET "sortOrder" = r.rn
FROM ranked r
WHERE p.id = r.id;

-- CreateIndex
CREATE INDEX "PriceTracking_userId_sortOrder_idx" ON "PriceTracking"("userId", "sortOrder");

-- AlterTable
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "recheckIntervalMinutes" INTEGER NOT NULL DEFAULT 360;
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "productNameOverride" TEXT;
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "companyNameOverride" TEXT;
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "alertBelowPrice" DECIMAL(12,4);
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "alertAbovePrice" DECIMAL(12,4);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PRICE_ALERT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey'
  ) THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_trackingId_fkey'
  ) THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trackingId_fkey"
      FOREIGN KEY ("trackingId") REFERENCES "PriceTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

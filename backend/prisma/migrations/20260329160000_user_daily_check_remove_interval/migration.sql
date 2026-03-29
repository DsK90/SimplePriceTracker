-- Per-account daily price check (one run per day for all catalog products)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyCheckTimeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyCheckLocalTime" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyCheckLastRunDate" TEXT;

-- No per-product recheck interval: fixed daily schedule only
ALTER TABLE "PriceTracking" DROP COLUMN IF EXISTS "recheckIntervalMinutes";

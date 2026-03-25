-- AlterTable
ALTER TABLE "PriceTracking" ADD COLUMN IF NOT EXISTS "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "payload" JSONB;

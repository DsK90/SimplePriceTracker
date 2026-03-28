-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerificationLastSentAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationEmailsSent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetLastSentAt" TIMESTAMP(3);

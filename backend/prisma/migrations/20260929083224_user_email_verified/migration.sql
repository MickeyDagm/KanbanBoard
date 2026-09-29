-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Backfill: accounts created before email verification existed stay active.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";

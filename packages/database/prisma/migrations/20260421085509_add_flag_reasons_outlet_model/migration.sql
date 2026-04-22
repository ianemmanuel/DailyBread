-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "adminReviewedBy" TEXT,
ADD COLUMN     "flagReasons" TEXT[],
ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

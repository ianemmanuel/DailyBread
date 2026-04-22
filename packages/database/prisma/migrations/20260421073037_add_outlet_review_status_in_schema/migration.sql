-- CreateEnum
CREATE TYPE "OutletReviewStatus" AS ENUM ('AUTO_APPROVED', 'FLAGGED', 'MANUALLY_APPROVED', 'MANUALLY_REJECTED');

-- AlterTable
ALTER TABLE "Outlet" ADD COLUMN     "reviewStatus" "OutletReviewStatus" NOT NULL DEFAULT 'AUTO_APPROVED';

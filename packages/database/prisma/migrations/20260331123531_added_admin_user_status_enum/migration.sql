-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('pending', 'invited', 'active', 'suspended', 'deactivated');

-- DropIndex
DROP INDEX "AdminUser_isActive_idx";

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "status" "AdminUserStatus" NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "AdminUser_status_idx" ON "AdminUser"("status");

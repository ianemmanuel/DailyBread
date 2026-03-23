-- DropForeignKey
ALTER TABLE "AdminUser" DROP CONSTRAINT "AdminUser_roleId_fkey";

-- AlterTable
ALTER TABLE "AdminPermission" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "invitationSentAt" TIMESTAMP(3),
ADD COLUMN     "invitationSentCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "clerkUserId" DROP NOT NULL,
ALTER COLUMN "isActive" SET DEFAULT false,
ALTER COLUMN "roleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AdminUserPermission" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminUserPermission_adminUserId_idx" ON "AdminUserPermission"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminUserPermission_permissionId_idx" ON "AdminUserPermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUserPermission_adminUserId_permissionId_key" ON "AdminUserPermission"("adminUserId", "permissionId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserPermission" ADD CONSTRAINT "AdminUserPermission_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserPermission" ADD CONSTRAINT "AdminUserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AdminPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserPermission" ADD CONSTRAINT "AdminUserPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

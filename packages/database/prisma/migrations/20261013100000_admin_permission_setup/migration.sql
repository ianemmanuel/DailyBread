-- CreateEnum
CREATE TYPE "AdminPermissionSetupStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AdminPermissionSetup" (
    "adminUserId" TEXT NOT NULL,
    "status" "AdminPermissionSetupStatus" NOT NULL DEFAULT 'PENDING',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPermissionSetup_pkey" PRIMARY KEY ("adminUserId")
);

-- CreateIndex
CREATE INDEX "AdminPermissionSetup_status_openedAt_idx" ON "AdminPermissionSetup"("status", "openedAt");

-- AddForeignKey
ALTER TABLE "AdminPermissionSetup" ADD CONSTRAINT "AdminPermissionSetup_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPermissionSetup" ADD CONSTRAINT "AdminPermissionSetup_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: accounts already invited (or since activated) that still hold no
-- grants are awaiting their initial setup. Opened at their latest invitation.
INSERT INTO "AdminPermissionSetup" ("adminUserId", "status", "openedAt", "updatedAt")
SELECT u."id", 'PENDING', u."invitationSentAt", CURRENT_TIMESTAMP
FROM "AdminUser" u
LEFT JOIN "AdminRole" r ON r."id" = u."roleId"
WHERE u."status" IN ('invited', 'active', 'suspended')
  AND u."invitationSentAt" IS NOT NULL
  AND (r."name" IS NULL OR r."name" NOT IN ('super_admin', 'system'))
  AND NOT EXISTS (SELECT 1 FROM "AdminUserPermission" g WHERE g."adminUserId" = u."id");

-- DropEnum
DROP TYPE "AdminStatus";

-- CreateTable
CREATE TABLE "AuditLogArchive" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLogArchive_adminUserId_createdAt_idx" ON "AuditLogArchive"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogArchive_action_createdAt_idx" ON "AuditLogArchive"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogArchive_entityType_entityId_idx" ON "AuditLogArchive"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogArchive_createdAt_idx" ON "AuditLogArchive"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLogArchive_archivedAt_idx" ON "AuditLogArchive"("archivedAt");

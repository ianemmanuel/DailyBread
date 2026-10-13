-- "invitedById" was written with the CREATING admin's id at creation time, before
-- any invitation existed. It is renamed (not dropped and re-added, which is what
-- `migrate diff` generates) so every creator link survives.
ALTER TABLE "AdminUser" RENAME COLUMN "invitedById" TO "createdById";
ALTER TABLE "AdminUser" RENAME CONSTRAINT "AdminUser_invitedById_fkey" TO "AdminUser_createdById_fkey";

-- Who sent the latest invitation, paired with "invitationSentAt".
ALTER TABLE "AdminUser" ADD COLUMN "invitationSentById" TEXT;
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_invitationSentById_fkey"
  FOREIGN KEY ("invitationSentById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only from the record: the actor of the latest `admin_user.invited`
-- audit row for an account whose invitation is still current. No audit row → NULL
-- ("not recorded"); the creator is never assumed to be the sender.
UPDATE "AdminUser" u
SET "invitationSentById" = latest."adminUserId"
FROM (
  SELECT DISTINCT ON (a."entityId") a."entityId", a."adminUserId"
  FROM "AuditLog" a
  WHERE a."action" = 'admin_user.invited'
    AND a."entityType" = 'AdminUser'
    AND a."adminUserId" IS NOT NULL
  ORDER BY a."entityId", a."createdAt" DESC
) latest
WHERE latest."entityId" = u."id"
  AND u."invitationSentAt" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "AdminUser" s WHERE s."id" = latest."adminUserId");

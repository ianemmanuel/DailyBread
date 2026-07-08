/**
 * Fixed, well-known identifiers referencing "the system" as an actor,
 * for cases where a required foreign key (AuditLog.adminUserId,
 * AdminUserPermission.grantedById, etc.) needs an AdminUser to attribute
 * an action to, but no human admin performed it — cron jobs, background
 * automation, fraud-detection flags, and similar.
 *
 * This is NOT a secret — it's safe to import anywhere in the monorepo that
 * depends on @repo/db (backend, admin app, etc.). It must be identical in
 * every environment, which is why it lives here as a code constant rather
 * than in any .env file.
 *
 * The AdminUser row this id points to is created by seedSystemUser() in
 * src/seed/admin/system-user.seed.ts. Nothing should reference this id
 * before that seed has run.
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
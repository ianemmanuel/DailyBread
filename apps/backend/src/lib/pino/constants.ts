/**
 * Application-level constants.
 *
 * SYSTEM_USER_ID is the UUID of the sentinel AdminUser row created by the seed.
 * It is the actor for all system-triggered audit events (webhooks, cron jobs).
 * This value must match the id in the seed file — never change it after deployment.
 *
 * Using a hardcoded UUID (not a DB lookup) means:
 *   - No async call needed when writing audit logs
 *   - No risk of the sentinel row being deleted (FK still enforced)
 *   - Instant filtering in audit queries: WHERE adminUserId != SYSTEM_USER_ID
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001" as const

/**
 * Audit log retention thresholds.
 * Used by the archive cron job to decide which records to move/delete.
 */
export const AUDIT_HOT_DAYS     = 90   // days before moving to archive table
export const AUDIT_DELETE_DAYS  = 730  // days before deleting from archive (2 years)
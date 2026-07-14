
/**
 * Audit log retention thresholds.
 * Used by the archive cron job to decide which records to move/delete.
 */
export const AUDIT_HOT_DAYS     = 90   // days before moving to archive table
export const AUDIT_DELETE_DAYS  = 730  // days before deleting from archive (2 years)
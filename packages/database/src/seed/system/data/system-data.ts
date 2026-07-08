


// Not a real person, never logs in, has no clerkUserId and never will.
// Exists only so automated writes (cron jobs, background flags) have a
// valid AdminUser row to satisfy required foreign keys like
// AuditLog.adminUserId and AdminUserPermission.grantedById.
export const SYSTEM_USER_EMAIL = "system@internal.dailybread.co.ke"
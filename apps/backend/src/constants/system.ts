//* System constants
// These are application-wide constants that apply across all modules.
// SYSTEM_USER_ID is a fixed UUID seeded in the database. It identifies automated
// system actions in AuditLog (flag checks, cron jobs, background tasks).


export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
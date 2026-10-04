/*
 * The desktop sidebar's collapsed preference. A plain module (no "use client")
 * so the SERVER layout can import the name as a real string — importing a
 * constant from a client module hands a server component a client reference,
 * not the value.
 */
export const SIDEBAR_COOKIE = "db-vendor-sidebar-collapsed"
/** A year. The preference is a convenience, not a session. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

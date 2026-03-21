// ─── Admin enums & permission constants ──────────────────────────────────────

export enum AdminScopeType {
  GLOBAL  = "GLOBAL",
  COUNTRY = "COUNTRY",
  CITY    = "CITY",
}

export enum AdminStatus {
  ACTIVE      = "ACTIVE",
  SUSPENDED   = "SUSPENDED",
  DEACTIVATED = "DEACTIVATED",
}

// ─── Permission keys ──────────────────────────────────────────────────────────
// Single source of truth for every permission string in the system.
// The backend middleware checks these. The frontend hook checks these.
// A typo is a compile error, not a silent runtime failure.
//
// Naming convention: MODULE_SUBMODULE_ACTION
// String value convention: "module:submodule:action"

export const AdminPermissions = {
  // ── Vendor module ─────────────────────────────────────────────────────────
  VENDORS_READ:    "vendors:read",
  VENDORS_CREATE:  "vendors:create",
  VENDORS_APPROVE: "vendors:approve",
  VENDORS_SUSPEND: "vendors:suspend",
  VENDORS_EXPORT:  "vendors:export",

  // ── Finance module ────────────────────────────────────────────────────────
  FINANCE_TRANSACTIONS_READ:    "finance:transactions:read",
  FINANCE_PAYOUTS_READ:         "finance:payouts:read",
  FINANCE_PAYOUTS_APPROVE:      "finance:payouts:approve",
  FINANCE_PAYOUTS_REVERSE:      "finance:payouts:reverse",
  FINANCE_DISCOUNTS_READ:       "finance:discounts:read",
  FINANCE_DISCOUNTS_CREATE:     "finance:discounts:create",
  FINANCE_DISCOUNTS_DEACTIVATE: "finance:discounts:deactivate",
  FINANCE_REPORTS_READ:         "finance:reports:read",
  FINANCE_REPORTS_EXPORT:       "finance:reports:export",

  // ── Customer module ───────────────────────────────────────────────────────
  CUSTOMERS_READ:    "customers:read",
  CUSTOMERS_REFUND:  "customers:refund",
  CUSTOMERS_SUSPEND: "customers:suspend",

  // ── Orders (cross-cutting) ────────────────────────────────────────────────
  ORDERS_READ: "orders:read",

  // ── Courier module ────────────────────────────────────────────────────────
  COURIERS_READ:    "couriers:read",
  COURIERS_APPROVE: "couriers:approve",
  COURIERS_ASSIGN:  "couriers:assign",
  COURIERS_SUSPEND: "couriers:suspend",

  // ── Admin user management ─────────────────────────────────────────────────
  ADMIN_USERS_READ:         "admin_users:read",
  ADMIN_USERS_INVITE:       "admin_users:invite",
  ADMIN_USERS_DEACTIVATE:   "admin_users:deactivate",
  ADMIN_USERS_ROLES_ASSIGN: "admin_users:roles:assign",

  // ── Audit & settings ──────────────────────────────────────────────────────
  AUDIT_LOGS_READ: "audit_logs:read",
  SETTINGS_READ:   "settings:read",
  SETTINGS_WRITE:  "settings:write",
} as const

// The union of all valid permission key strings.
// Use this as the type for any function that accepts or checks a permission.
export type AdminPermissionKey = typeof AdminPermissions[keyof typeof AdminPermissions]

// ─── Role names ───────────────────────────────────────────────────────────────
// Seeded role slugs. Used for role-based conditional UI and backend checks.

export const AdminRoleNames = {
  SUPER_ADMIN:    "super_admin",
  FINANCE:        "finance",
  VENDOR_OPS:     "vendor_ops",
  CUSTOMER_CARE:  "customer_care",
  COURIER_OPS:    "courier_ops",
  IDENTITY_ADMIN: "identity_admin",
} as const

export type AdminRoleName = typeof AdminRoleNames[keyof typeof AdminRoleNames]
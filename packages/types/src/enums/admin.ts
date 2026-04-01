// ─── Admin enums & permission constants ──────────────────────────────────────

/**
 * AdminUserStatus — for FRONTEND use only.
 *
 * The backend imports AdminUserStatus directly from @repo/db (Prisma).
 * This const object lets frontend apps compare status strings without
 * depending on Prisma (which is a backend-only package).
 *
 * Values must stay in sync with the Prisma enum. If you add a status
 * in the schema, add it here too.
 */
export const AdminUserStatus = {
  pending     : "pending",
  invited     : "invited",
  active      : "active",
  suspended   : "suspended",
  deactivated : "deactivated",
} as const

export type AdminUserStatus = typeof AdminUserStatus[keyof typeof AdminUserStatus]

export enum AdminScopeType {
  GLOBAL  = "GLOBAL",
  COUNTRY = "COUNTRY",
  CITY    = "CITY",
}

// ─── Permission keys ──────────────────────────────────────────────────────────
// Single source of truth for every permission string in the system.
// Backend middleware checks these. Frontend hooks check these.
// A typo in a constant is a compile error. A typo in a raw string is a silent bug.
//
// Naming: MODULE_SUBMODULE_ACTION
// Values: "module:submodule:action" — must match seed file exactly.

export const AdminPermissions = {
  // ── Vendor module ─────────────────────────────────────────────────────────
  VENDORS_READ    : "vendors:read",
  VENDORS_CREATE  : "vendors:create",
  VENDORS_APPROVE : "vendors:approve",
  VENDORS_SUSPEND : "vendors:suspend",
  VENDORS_EXPORT  : "vendors:export",

  // ── Finance module ────────────────────────────────────────────────────────
  FINANCE_TRANSACTIONS_READ    : "finance:transactions:read",
  FINANCE_PAYOUTS_READ         : "finance:payouts:read",
  FINANCE_PAYOUTS_APPROVE      : "finance:payouts:approve",
  FINANCE_PAYOUTS_REVERSE      : "finance:payouts:reverse",
  FINANCE_DISCOUNTS_READ       : "finance:discounts:read",
  FINANCE_DISCOUNTS_CREATE     : "finance:discounts:create",
  FINANCE_DISCOUNTS_DEACTIVATE : "finance:discounts:deactivate",
  FINANCE_REPORTS_READ         : "finance:reports:read",
  FINANCE_REPORTS_EXPORT       : "finance:reports:export",

  // ── Customer module ───────────────────────────────────────────────────────
  CUSTOMERS_READ    : "customers:read",
  CUSTOMERS_REFUND  : "customers:refund",
  CUSTOMERS_SUSPEND : "customers:suspend",

  // ── Orders (cross-cutting) ────────────────────────────────────────────────
  ORDERS_READ : "orders:read",

  // ── Courier module ────────────────────────────────────────────────────────
  COURIERS_READ    : "couriers:read",
  COURIERS_APPROVE : "couriers:approve",
  COURIERS_ASSIGN  : "couriers:assign",
  COURIERS_SUSPEND : "couriers:suspend",

  // ── Admin user management ─────────────────────────────────────────────────
  ADMIN_USERS_READ         : "admin_users:read",
  ADMIN_USERS_CREATE       : "admin_users:create",
  ADMIN_USERS_INVITE       : "admin_users:invite",
  ADMIN_USERS_PERMISSIONS  : "admin_users:permissions",
  ADMIN_USERS_DEACTIVATE   : "admin_users:deactivate",
  ADMIN_USERS_ROLES_ASSIGN : "admin_users:roles:assign",

  // ── Audit & settings ──────────────────────────────────────────────────────
  AUDIT_LOGS_READ : "audit_logs:read",
  SETTINGS_READ   : "settings:read",
  SETTINGS_WRITE  : "settings:write",
} as const

export type AdminPermissionKey = typeof AdminPermissions[keyof typeof AdminPermissions]

// ─── Role name constants ──────────────────────────────────────────────────────

export const AdminRoleNames = {
  SUPER_ADMIN    : "super_admin",
  IDENTITY_ADMIN : "identity_admin",
  FINANCE        : "finance",
  VENDOR_OPS     : "vendor_ops",
  CUSTOMER_CARE  : "customer_care",
  COURIER_OPS    : "courier_ops",
} as const

export type AdminRoleName = typeof AdminRoleNames[keyof typeof AdminRoleNames]
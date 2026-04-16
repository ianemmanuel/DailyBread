// packages/types/src/enums/admin.ts
// REPLACE the AdminPermissions const with this.
// All permission keys now follow: module:submodule:action
// This makes every key self-describing without needing context.

export const AdminPermissions = {
  // ── Vendors — accounts ───────────────────────────────────────────────────
  VENDORS_ACCOUNTS_READ      : "vendors:accounts:read",
  VENDORS_ACCOUNTS_CREATE    : "vendors:accounts:create",
  VENDORS_ACCOUNTS_SUSPEND   : "vendors:accounts:suspend",
  VENDORS_ACCOUNTS_REINSTATE : "vendors:accounts:reinstate",
  VENDORS_ACCOUNTS_BAN       : "vendors:accounts:ban",
  VENDORS_ACCOUNTS_EXPORT    : "vendors:accounts:export",

  // ── Vendors — applications ───────────────────────────────────────────────
  VENDORS_APPLICATIONS_READ   : "vendors:applications:read",
  VENDORS_APPLICATIONS_REVIEW : "vendors:applications:review",
  VENDORS_APPLICATIONS_APPROVE: "vendors:applications:approve",
  VENDORS_APPLICATIONS_REJECT : "vendors:applications:reject",

  // ── Vendors — documents ──────────────────────────────────────────────────
  VENDORS_DOCUMENTS_VIEW      : "vendors:documents:view",

  // ── Finance ──────────────────────────────────────────────────────────────
  FINANCE_TRANSACTIONS_READ    : "finance:transactions:read",
  FINANCE_PAYOUTS_READ         : "finance:payouts:read",
  FINANCE_PAYOUTS_APPROVE      : "finance:payouts:approve",
  FINANCE_PAYOUTS_REVERSE      : "finance:payouts:reverse",
  FINANCE_DISCOUNTS_READ       : "finance:discounts:read",
  FINANCE_DISCOUNTS_CREATE     : "finance:discounts:create",
  FINANCE_DISCOUNTS_DEACTIVATE : "finance:discounts:deactivate",
  FINANCE_REPORTS_READ         : "finance:reports:read",
  FINANCE_REPORTS_EXPORT       : "finance:reports:export",

  // ── Customers ─────────────────────────────────────────────────────────────
  CUSTOMERS_PROFILES_READ     : "customers:profiles:read",
  CUSTOMERS_ORDERS_READ       : "customers:orders:read",
  CUSTOMERS_ORDERS_REFUND     : "customers:orders:refund",
  CUSTOMERS_ACCOUNTS_SUSPEND  : "customers:accounts:suspend",
  CUSTOMERS_ACCOUNTS_REINSTATE: "customers:accounts:reinstate",

  // ── Orders ────────────────────────────────────────────────────────────────
  ORDERS_ALL_READ             : "orders:all:read",

  // ── Couriers ─────────────────────────────────────────────────────────────
  COURIERS_PROFILES_READ      : "couriers:profiles:read",
  COURIERS_APPLICATIONS_APPROVE: "couriers:applications:approve",
  COURIERS_DELIVERIES_ASSIGN  : "couriers:deliveries:assign",
  COURIERS_ACCOUNTS_SUSPEND   : "couriers:accounts:suspend",
  COURIERS_ACCOUNTS_REINSTATE : "couriers:accounts:reinstate",

  // ── Admin users (identity module) ─────────────────────────────────────────
  ADMIN_USERS_PROFILES_READ      : "admin_users:profiles:read",
  ADMIN_USERS_ACCOUNTS_CREATE    : "admin_users:accounts:create",
  ADMIN_USERS_INVITATIONS_SEND   : "admin_users:invitations:send",
  ADMIN_USERS_PERMISSIONS_MANAGE : "admin_users:permissions:manage",
  ADMIN_USERS_ACCOUNTS_SUSPEND   : "admin_users:accounts:suspend",
  ADMIN_USERS_ACCOUNTS_REINSTATE : "admin_users:accounts:reinstate",
  ADMIN_USERS_ACCOUNTS_DEACTIVATE: "admin_users:accounts:deactivate",
  ADMIN_USERS_ROLES_ASSIGN       : "admin_users:roles:assign",

  // ── Audit & settings ──────────────────────────────────────────────────────
  AUDIT_LOGS_ALL_READ        : "audit_logs:all:read",
  SETTINGS_GEOGRAPHY_READ    : "settings:geography:read",
  SETTINGS_GEOGRAPHY_WRITE   : "settings:geography:write",
  SETTINGS_DOCUMENTS_READ    : "settings:documents:read",
  SETTINGS_DOCUMENTS_WRITE   : "settings:documents:write",
} as const

export type AdminPermissionKey = typeof AdminPermissions[keyof typeof AdminPermissions]

// ─── Role names (unchanged) ────────────────────────────────────────────────

export const AdminRoleNames = {
  SUPER_ADMIN    : "super_admin",
  IDENTITY_ADMIN : "identity_admin",
  FINANCE        : "finance",
  VENDOR_OPS     : "vendor_ops",
  CUSTOMER_CARE  : "customer_care",
  COURIER_OPS    : "courier_ops",
} as const

export type AdminRoleName = typeof AdminRoleNames[keyof typeof AdminRoleNames]

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
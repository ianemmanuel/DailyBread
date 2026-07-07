import { ALL_PERMISSION_KEYS, type PermissionKey } from './permissions.data'

// Keys here should match ROLES[].name in roles.data.ts — validated at seed time,
// not at the type level, since role names come from the DB-facing string union.
export const ROLE_POOLS: Record<string, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,

  identity_admin: [
    "admin_users:profiles:read",
    "admin_users:accounts:create",
    "admin_users:invitations:send",
    "admin_users:permissions:manage",
    "admin_users:accounts:suspend",
    "admin_users:accounts:reinstate",
    "admin_users:accounts:deactivate",
    "admin_users:roles:assign",
    "audit_logs:all:read",
    "settings:geography:read",
  ],

  finance: [
    "vendors:accounts:read",
    "finance:transactions:read",
    "finance:payouts:read",
    "finance:payouts:approve",
    "finance:payouts:reverse",
    "finance:discounts:read",
    "finance:discounts:create",
    "finance:discounts:deactivate",
    "finance:reports:read",
    "finance:reports:export",
    "orders:all:read",
  ],

  vendor_ops: [
    "vendors:accounts:read",
    "vendors:accounts:create",
    "vendors:accounts:suspend",
    "vendors:accounts:reinstate",
    "vendors:accounts:ban",
    "vendors:accounts:export",
    "vendors:applications:read",
    "vendors:applications:review",
    "vendors:applications:approve",
    "vendors:applications:reject",
    "vendors:documents:view",
    "finance:discounts:read",
    "orders:all:read",
    "settings:geography:read",
    "settings:documents:read",
  ],

  customer_care: [
    "customers:profiles:read",
    "customers:orders:read",
    "customers:orders:refund",
    "customers:accounts:suspend",
    "customers:accounts:reinstate",
    "orders:all:read",
    "vendors:accounts:read",
  ],

  courier_ops: [
    "couriers:profiles:read",
    "couriers:applications:approve",
    "couriers:deliveries:assign",
    "couriers:accounts:suspend",
    "couriers:accounts:reinstate",
    "orders:all:read",
  ],
}
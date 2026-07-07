/**
 * Permission naming convention:
 *   key    : "module:submodule:action"  (machine-readable, used in code)
 *   display: For the permission picker UI, the key is split on ":" and the
 *            module prefix is shown as the group header.
 *            E.g. "vendors:applications:approve" shows as "applications:approve"
 *            under the "Vendors" group header.
 *
 * description: Full sentence. Tells the identity admin exactly what granting
 *   this permission allows the user to do — no ambiguity.
 */

export const PERMISSIONS = [
  // ── Vendors ──────────────────────────────────────────────────────────────
  {
    key        : "vendors:accounts:read",
    module     : "vendors",
    description: "View vendor account profiles, status, outlets, and payout accounts",
  },
  {
    key        : "vendors:accounts:create",
    module     : "vendors",
    description: "Manually create a vendor account (admin-assisted onboarding, bypasses application flow)",
  },
  {
    key        : "vendors:accounts:suspend",
    module     : "vendors",
    description: "Suspend an active vendor account and block all vendor login sessions",
  },
  {
    key        : "vendors:accounts:reinstate",
    module     : "vendors",
    description: "Reinstate a suspended vendor account and restore access",
  },
  {
    key        : "vendors:accounts:ban",
    module     : "vendors",
    description: "Permanently ban a vendor account from the platform",
  },
  {
    key        : "vendors:accounts:export",
    module     : "vendors",
    description: "Export vendor account data as CSV for reporting or compliance",
  },
  {
    key        : "vendors:applications:read",
    module     : "vendors",
    description: "View vendor applications, submitted documents, and applicant details",
  },
  {
    key        : "vendors:applications:review",
    module     : "vendors",
    description: "Mark a submitted vendor application as under review (no decision yet)",
  },
  {
    key        : "vendors:applications:approve",
    module     : "vendors",
    description: "Approve a vendor application and create the vendor account automatically",
  },
  {
    key        : "vendors:applications:reject",
    module     : "vendors",
    description: "Reject a vendor application and notify the applicant with a reason",
  },
  {
    key        : "vendors:documents:view",
    module     : "vendors",
    description: "Generate signed preview URLs to view vendor documents in-browser",
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    key        : "finance:transactions:read",
    module     : "finance",
    description: "View the full transaction ledger across all vendors and orders",
  },
  {
    key        : "finance:payouts:read",
    module     : "finance",
    description: "View the payout queue, payout history, and individual payout details",
  },
  {
    key        : "finance:payouts:approve",
    module     : "finance",
    description: "Approve individual or batch vendor payouts for processing",
  },
  {
    key        : "finance:payouts:reverse",
    module     : "finance",
    description: "Reverse an already-approved payout (requires audit reason)",
  },
  {
    key        : "finance:discounts:read",
    module     : "finance",
    description: "View active and historical discount campaigns and redemption stats",
  },
  {
    key        : "finance:discounts:create",
    module     : "finance",
    description: "Create new discount campaigns with rules, limits, and expiry",
  },
  {
    key        : "finance:discounts:deactivate",
    module     : "finance",
    description: "Deactivate a running discount campaign before its natural expiry",
  },
  {
    key        : "finance:reports:read",
    module     : "finance",
    description: "View financial reports, revenue dashboards, and summary statistics",
  },
  {
    key        : "finance:reports:export",
    module     : "finance",
    description: "Export financial reports as CSV or PDF for accounting or compliance",
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  {
    key        : "customers:profiles:read",
    module     : "customers",
    description: "View customer profiles, delivery addresses, and account history",
  },
  {
    key        : "customers:orders:read",
    module     : "customers",
    description: "View customer order history and individual order details",
  },
  {
    key        : "customers:orders:refund",
    module     : "customers",
    description: "Issue a full or partial refund on a customer order",
  },
  {
    key        : "customers:accounts:suspend",
    module     : "customers",
    description: "Suspend a customer account for policy violations or abuse",
  },
  {
    key        : "customers:accounts:reinstate",
    module     : "customers",
    description: "Reinstate a suspended customer account",
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  {
    key        : "orders:all:read",
    module     : "orders",
    description: "View order details across all modules (vendors, customers, couriers)",
  },

  // ── Couriers ──────────────────────────────────────────────────────────────
  {
    key        : "couriers:profiles:read",
    module     : "couriers",
    description: "View courier profiles, ratings, and delivery history",
  },
  {
    key        : "couriers:applications:approve",
    module     : "couriers",
    description: "Approve or reject courier applications after document review",
  },
  {
    key        : "couriers:deliveries:assign",
    module     : "couriers",
    description: "Manually reassign an active delivery to a different courier",
  },
  {
    key        : "couriers:accounts:suspend",
    module     : "couriers",
    description: "Suspend a courier account for policy violations or safety issues",
  },
  {
    key        : "couriers:accounts:reinstate",
    module     : "couriers",
    description: "Reinstate a suspended courier account",
  },

  // ── Admin Users (Identity module) ─────────────────────────────────────────
  {
    key        : "admin_users:profiles:read",
    module     : "admin_users",
    description: "View admin user profiles, roles, permissions, and scope within assigned country",
  },
  {
    key        : "admin_users:accounts:create",
    module     : "admin_users",
    description: "Create a new admin user record (does not send invitation — separate step)",
  },
  {
    key        : "admin_users:invitations:send",
    module     : "admin_users",
    description: "Send or resend a Clerk invitation to a created admin user",
  },
  {
    key        : "admin_users:permissions:manage",
    module     : "admin_users",
    description: "Assign or revoke individual permission grants within a user's role pool",
  },
  {
    key        : "admin_users:accounts:suspend",
    module     : "admin_users",
    description: "Suspend an active admin user account and revoke dashboard access",
  },
  {
    key        : "admin_users:accounts:reinstate",
    module     : "admin_users",
    description: "Reinstate a suspended admin user account",
  },
  {
    key        : "admin_users:accounts:deactivate",
    module     : "admin_users",
    description: "Permanently deactivate an admin user account (offboarding)",
  },
  {
    key        : "admin_users:roles:assign",
    module     : "admin_users",
    description: "Change an admin user's role (resets permission pool ceiling)",
  },

  // ── Audit & Settings ──────────────────────────────────────────────────────
  {
    key        : "audit_logs:all:read",
    module     : "audit_logs",
    description: "View and search the audit log for all admin actions within assigned scope",
  },
  {
    key        : "settings:geography:read",
    module     : "settings",
    description: "View system geography settings (countries, cities, service areas)",
  },
  {
    key        : "settings:geography:write",
    module     : "settings",
    description: "Create and update geography settings (countries, cities, service areas)",
  },
  {
    key        : "settings:documents:read",
    module     : "settings",
    description: "View document type configurations per country and vendor type",
  },
  {
    key        : "settings:documents:write",
    module     : "settings",
    description: "Create and update document type requirements for onboarding",
  },
] as const

export type PermissionKey = typeof PERMISSIONS[number]["key"]
export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key)
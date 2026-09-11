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
    key        : "vendors:accounts:compliance_manage",
    module     : "vendors",
    description: "Waive or un-waive a vendor's compliance issue, and notify a vendor about one",
  },
  {
    key        : "vendors:compliance:read",
    module     : "vendors",
    description: "View the cross-vendor compliance queue (missing, expired, and expiring documents)",
  },
  {
    key        : "vendors:compliance:claim",
    module     : "vendors",
    description: "Claim an unclaimed compliance case to work on it",
  },
  {
    key        : "vendors:compliance:escalate",
    module     : "vendors",
    description: "Escalate a compliance case to the senior-review pool",
  },
  {
    key        : "vendors:compliance:receive_escalation",
    module     : "vendors",
    description: "Claim compliance cases from the escalation pool (country-scoped admins only, for their own country)",
  },
  {
    key        : "vendors:compliance:reassign",
    module     : "vendors",
    description: "Reassign a compliance case directly to another admin",
  },
  {
    key        : "vendors:compliance:receive_stale_alert",
    module     : "vendors",
    description: "Receive an in-app notification when a compliance case sits unclaimed too long (country-scoped admins only, for their own country)",
  },
  {
    key        : "vendors:payout_accounts:manage",
    module     : "vendors",
    description: "Manually verify or reject a vendor's payout (bank/mobile-money/wallet) account",
  },
  {
    key        : "vendors:payout_accounts:claim",
    module     : "vendors",
    description: "Take ownership of a payout account awaiting manual verification",
  },
  {
    key        : "vendors:payout_accounts:escalate",
    module     : "vendors",
    description: "Hand a claimed payout account back to the open escalation pool",
  },
  {
    key        : "vendors:payout_accounts:reassign",
    module     : "vendors",
    description: "Supervisory override — move a payout account review to another admin",
  },
  {
    key        : "vendors:payout_accounts:receive_escalation",
    module     : "vendors",
    description: "Claim payout accounts escalated into the open pool",
  },
  {
    key        : "vendors:accounts:commission_manage",
    module     : "vendors",
    description: "Change a vendor's commission rate (recorded in a versioned history)",
  },
  {
    key        : "vendors:appeals:read",
    module     : "vendors",
    description: "View formal appeals logged against a rejected application, suspension, or ban",
  },
  {
    key        : "vendors:appeals:manage",
    module     : "vendors",
    description: "Log a formal appeal, and resolve one you currently hold the claim on",
  },
  {
    key        : "vendors:appeals:claim",
    module     : "vendors",
    description: "Claim an unclaimed appeal to work on it",
  },
  {
    key        : "vendors:appeals:escalate",
    module     : "vendors",
    description: "Escalate an appeal to the senior-review pool",
  },
  {
    key        : "vendors:appeals:reassign",
    module     : "vendors",
    description: "Reassign an appeal directly to another admin",
  },
  {
    key        : "vendors:appeals:receive_escalation",
    module     : "vendors",
    description: "Claim appeals from the escalation pool (country-scoped admins only, for their own country)",
  },
  {
    key        : "vendors:appeals:receive_stale_alert",
    module     : "vendors",
    description: "Receive an in-app notification when an appeal sits unclaimed too long (country-scoped admins only, for their own country)",
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
    key        : "vendors:applications:claim",
    module     : "vendors",
    description: "Claim an unassigned vendor application as its current reviewer",
  },
  {
    key        : "vendors:applications:reassign",
    module     : "vendors",
    description: "Reassign a vendor application from its current reviewer to another eligible reviewer",
  },
  {
    key        : "vendors:applications:escalate",
    module     : "vendors",
    description: "Escalate a vendor application for higher-level attention",
  },
  {
    key        : "vendors:applications:receive_escalation",
    module     : "vendors",
    description: "Receive and act on vendor applications escalated by other reviewers",
  },
  {
    key        : "vendors:reviewers:manage_availability",
    module     : "vendors",
    description: "Change another admin's vendor-application review availability",
  },
  {
    key        : "vendors:documents:view",
    module     : "vendors",
    description: "Generate signed preview URLs to view vendor documents in-browser",
  },
  {
    key        : "vendors:profiles:read",
    module     : "vendors",
    description: "View vendor public profiles, including profiles flagged for review",
  },
  {
    key        : "vendors:profiles:moderate",
    module     : "vendors",
    description: "Approve or reject a flagged vendor public profile, including force-unpublishing a rejected one",
  },
  {
    key        : "vendors:meals:read",
    module     : "vendors",
    description: "View vendor meals, including ones flagged for review",
  },
  {
    key        : "vendors:meals:moderate",
    module     : "vendors",
    description: "Approve or send back a flagged meal, and suspend or ban one from the marketplace",
  },
  {
    key        : "vendors:outlets:read",
    module     : "vendors",
    description: "View vendor outlets, including ones flagged for review",
  },
  {
    key        : "vendors:outlets:moderate",
    module     : "vendors",
    description: "Approve/reject a flagged outlet, and suspend, reinstate, ban, or unban an outlet independently of its vendor account",
  },
  {
    key        : "vendors:outlets:inspect",
    module     : "vendors",
    description: "Schedule and conduct physical premises inspections of an outlet (the meal-plan-eligibility gate)",
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
    key        : "finance:payment_methods:read",
    module     : "finance",
    description: "View the global payment-method catalog and per-country payment gateway configuration",
  },
  {
    key        : "finance:payment_methods:manage",
    module     : "finance",
    description: "Create/edit the global payment-method catalog and configure/activate/deactivate per-country payment gateways (customer collection and vendor payout)",
  },
  {
    key        : "finance:configuration:read",
    module     : "finance",
    description: "View the currency reference table and the payment-provider catalog (Flutterwave, Stripe, …) with their declared capabilities and status",
  },
  {
    key        : "finance:configuration:manage",
    module     : "finance",
    description: "Create/edit currencies and the payment-provider catalog, and activate/deactivate them (global scope only)",
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
  {
    key        : "admin_users:accounts:manage_availability",
    module     : "admin_users",
    description: "Mark another admin user as unavailable (e.g. on leave) or available again, with a time frame",
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
  {
    key        : "settings:vendor_types:read",
    module     : "settings",
    description: "View vendor type definitions and their country availability",
  },
  {
    key        : "settings:vendor_types:write",
    module     : "settings",
    description: "Create vendor types and manage their availability per country",
  },
  {
    key        : "settings:food_tags:read",
    module     : "settings",
    description: "View the cuisine and dietary-tag catalogs and their country availability",
  },
  {
    key        : "settings:food_tags:write",
    module     : "settings",
    description: "Create cuisines and dietary tags (global scope) and enable them per country",
  },
  {
    key        : "settings:action_reasons:write",
    module     : "settings",
    description: "Create and update standardized reason codes used for application review and account actions",
  },
  {
    key        : "settings:zones:read",
    module     : "settings",
    description: "View operational zones within a city (boundaries, capability level, operational status)",
  },
  {
    key        : "settings:zones:write",
    module     : "settings",
    description: "Draw, adjust, retire, and pause/resume operational zones within cities in your scope",
  },
  {
    key        : "settings:zones:set_level",
    module     : "settings",
    description: "Promote or demote a zone's capability level (e.g. enable meal plans in a zone) — the strategic launch decision, separate from routine zone editing",
  },
  {
    key        : "settings:zones:receive_alert",
    module     : "settings",
    description: "Receive an in-app notification (and email, for country/city-scoped admins) when a zone in your scope is suspended, retired, reactivated, or has its capability level changed",
  },
] as const

export type PermissionKey = typeof PERMISSIONS[number]["key"]
export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key)
/**
 * ADMIN INFRASTRUCTURE SEED
 * Idempotent — safe to run multiple times.
 *
 * Permission naming convention:
 *   key    : "module:submodule:action"  (machine-readable, used in code)
 *   display: For the permission picker UI, the key is split on ":" and the
 *            module prefix is shown as the group header.
 *            E.g. "vendors:applications:approve" shows as "applications:approve"
 *            under the "Vendors" group header.
 *
 * Description: Full sentence. Tells the identity admin exactly what granting
 *   this permission allows the user to do — no ambiguity.
 */
import 'dotenv/config'
import { prisma } from '../index'

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    name        : "super_admin",
    displayName : "Super Admin",
    description : "Full access to all modules and settings. Engineering and executive leadership only.",
  },
  {
    name        : "identity_admin",
    displayName : "Identity Admin",
    description : "Admin user management within assigned country. No access to business or financial data.",
  },
  {
    name        : "finance",
    displayName : "Finance",
    description : "Transactions, payouts, discounts, and revenue reporting.",
  },
  {
    name        : "vendor_ops",
    displayName : "Vendor Operations",
    description : "Vendor onboarding, application review, and account management.",
  },
  {
    name        : "customer_care",
    displayName : "Customer Care",
    description : "Customer accounts, order support, and refunds.",
  },
  {
    name        : "courier_ops",
    displayName : "Courier Operations",
    description : "Courier onboarding, dispatch management, and live delivery monitoring.",
  },
] as const

// ─── Permissions ──────────────────────────────────────────────────────────────
// Key convention: module:submodule:action (never just module:action for ambiguity)
// Each key is unique and self-describing without requiring context.

const PERMISSIONS = [
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

type PermissionKey = typeof PERMISSIONS[number]["key"]
const ALL: PermissionKey[] = PERMISSIONS.map((p) => p.key)

// ─── Role permission pools ────────────────────────────────────────────────────

const ROLE_POOLS: Record<string, PermissionKey[]> = {
  super_admin: ALL,

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

// ─── Action reasons (unchanged) ───────────────────────────────────────────────

const ACTION_REASONS = [
  { code: "POLICY_VIOLATION",   label: "Policy violation",        description: "Violated platform terms of service or operational policies.", appliesTo: ["vendor_account.suspended", "outlet.suspended"] },
  { code: "QUALITY_ISSUES",     label: "Quality issues",          description: "Repeated complaints about food quality or hygiene.",            appliesTo: ["vendor_account.suspended", "outlet.suspended"] },
  { code: "SAFETY_CONCERN",     label: "Food safety concern",     description: "A food safety issue has been reported or identified.",          appliesTo: ["vendor_account.suspended", "meal.banned"] },
  { code: "FRAUDULENT_ACTIVITY",label: "Fraudulent activity",     description: "Suspected or confirmed fraudulent behaviour.",                  appliesTo: ["vendor_account.suspended", "vendor_account.banned", "customer.suspended"] },
  { code: "DOCUMENT_ISSUES",    label: "Document issues",         description: "Documents are expired, invalid, or have not been submitted.",   appliesTo: ["vendor_account.suspended"] },
  { code: "INCOMPLETE_DOCUMENTS",label: "Incomplete documents",   description: "Required documents are missing or have not been uploaded.",     appliesTo: ["vendor_application.rejected"] },
  { code: "DOCUMENT_EXPIRED",   label: "Expired documents",       description: "One or more submitted documents have expired.",                 appliesTo: ["vendor_application.rejected"] },
  { code: "INVALID_INFORMATION",label: "Invalid business info",   description: "Business details cannot be verified or are inconsistent.",      appliesTo: ["vendor_application.rejected"] },
  { code: "INELIGIBLE_TYPE",    label: "Vendor type not supported",description: "This vendor type is not supported in the selected country.",    appliesTo: ["vendor_application.rejected"] },
  { code: "REFUND_POLICY",      label: "Refund per policy",       description: "Refund issued per platform refund policy.",                     appliesTo: ["customer.refund"] },
  { code: "CUSTOMER_ABUSE",     label: "Abusive behaviour",       description: "Customer engaged in abuse towards vendors, couriers, or staff.",appliesTo: ["customer.suspended"] },
  { code: "EMPLOYMENT_ENDED",   label: "Employment ended",        description: "Team member has left the organisation.",                        appliesTo: ["admin_user.deactivated"] },
  { code: "TEMPORARY_REVIEW",   label: "Temporary — under review",description: "Account suspended pending investigation or review.",            appliesTo: ["admin_user.suspended", "vendor_account.suspended"] },
] as const

// ─── Seed runner ──────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding DailyBread admin infrastructure...\n")

  console.log("  [1/4] Roles...")
  for (const role of ROLES) {
    await prisma.adminRole.upsert({
      where : { name: role.name },
      update: { displayName: role.displayName, description: role.description },
      create: role,
    })
  }
  console.log(`        ✓ ${ROLES.length} roles`)

  console.log("  [2/4] Permissions...")
  for (const perm of PERMISSIONS) {
    await prisma.adminPermission.upsert({
      where : { key: perm.key },
      update: { module: perm.module, description: perm.description },
      create: { ...perm, isActive: true },
    })
  }
  console.log(`        ✓ ${PERMISSIONS.length} permissions`)

  console.log("  [3/4] Role permission pools...")
  let poolCount = 0
  for (const [roleName, keys] of Object.entries(ROLE_POOLS)) {
    const role = await prisma.adminRole.findUnique({ where: { name: roleName } })
    if (!role) { console.warn(`⚠ Role not found: ${roleName}`); continue }
    for (const key of keys) {
      const permission = await prisma.adminPermission.findUnique({ where: { key } })
      if (!permission) { console.warn(`⚠ Permission not found: ${key}`); continue }
      await prisma.adminRolePermission.upsert({
        where : { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
      poolCount++
    }
  }
  console.log(`        ✓ ${poolCount} pool entries`)

  console.log("  [4/4] Action reasons...")
  for (const reason of ACTION_REASONS) {
    await prisma.adminActionReason.upsert({
      where : { code: reason.code },
      update: { label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
      create: { code: reason.code, label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
    })
  }
  console.log(`        ✓ ${ACTION_REASONS.length} action reasons`)

  console.log("\n✅ Seed complete.")
}

seed()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
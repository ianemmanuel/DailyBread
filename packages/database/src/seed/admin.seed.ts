/**
 * ADMIN INFRASTRUCTURE SEED
 *
 * Idempotent — safe to run multiple times without duplicating data.
 * Run via: pnpm --filter @repo/db seed
 *
 * Seeds:
 *   1. AdminRole          (6 roles — departments)
 *   2. AdminPermission    (29 permission keys)
 *   3. AdminRolePermission (permission pools per role — the ceiling)
 *   4. AdminActionReason  (predefined reasons for standard actions)
 *
 * Does NOT seed AdminUserPermission — individual grants happen during
 * admin user onboarding, not at seed time.
 */
import 'dotenv/config'
import {prisma} from '../index';


// ─── 1. Roles ─────────────────────────────────────────────────────────────────
// Each role maps to a department. Hierarchy within a department is expressed
// through individual permission grants, not sub-roles.

const ROLES = [
  {
    name        : "super_admin",
    displayName : "Super Admin",
    description : "Full access to all modules and settings. Engineering and executive leadership only.",
  },
  {
    name        : "identity_admin",
    displayName : "Identity Admin",
    description : "Admin user management within assigned country. Cannot access business data.",
  },
  {
    name        : "finance",
    displayName : "Finance",
    description : "Transactions, payouts, discounts, revenue reporting.",
  },
  {
    name        : "vendor_ops",
    displayName : "Vendor Operations",
    description : "Vendor onboarding, approvals, account management.",
  },
  {
    name        : "customer_care",
    displayName : "Customer Care",
    description : "Customer accounts, orders, refunds.",
  },
  {
    name        : "courier_ops",
    displayName : "Courier Operations",
    description : "Courier onboarding, dispatch, live delivery monitoring.",
  },
] as const

// ─── 2. Permissions ───────────────────────────────────────────────────────────
// Every discrete action in the system. Never created at runtime — only seeded.
// To deprecate: set isActive=false. Never delete (preserves grant history).

const PERMISSIONS = [
  // Vendors
  { key: "vendors:read",    module: "vendors",  description: "View vendor applications, accounts, documents, outlets" },
  { key: "vendors:create",  module: "vendors",  description: "Create vendor accounts manually (admin-assisted onboarding)" },
  { key: "vendors:approve", module: "vendors",  description: "Approve or reject vendor applications" },
  { key: "vendors:suspend", module: "vendors",  description: "Suspend or reinstate vendor accounts and outlets" },
  { key: "vendors:export",  module: "vendors",  description: "Export vendor data as CSV" },

  // Finance
  { key: "finance:transactions:read",    module: "finance", description: "View transaction ledger" },
  { key: "finance:payouts:read",         module: "finance", description: "View payout queue and history" },
  { key: "finance:payouts:approve",      module: "finance", description: "Approve individual or batch payouts" },
  { key: "finance:payouts:reverse",      module: "finance", description: "Reverse an approved payout" },
  { key: "finance:discounts:read",       module: "finance", description: "View discount campaigns" },
  { key: "finance:discounts:create",     module: "finance", description: "Create new discount campaigns" },
  { key: "finance:discounts:deactivate", module: "finance", description: "Deactivate a discount campaign" },
  { key: "finance:reports:read",         module: "finance", description: "View financial reports and dashboards" },
  { key: "finance:reports:export",       module: "finance", description: "Export reports as CSV or PDF" },

  // Customers
  { key: "customers:read",    module: "customers", description: "View customer profiles, addresses, order history" },
  { key: "customers:refund",  module: "customers", description: "Issue refunds on customer orders" },
  { key: "customers:suspend", module: "customers", description: "Suspend or reinstate customer accounts" },

  // Orders (cross-cutting — used by multiple departments)
  { key: "orders:read", module: "orders", description: "View order details across any module" },

  // Couriers
  { key: "couriers:read",    module: "couriers", description: "View courier profiles, applications, delivery history" },
  { key: "couriers:approve", module: "couriers", description: "Approve or reject courier applications" },
  { key: "couriers:assign",  module: "couriers", description: "Manually reassign deliveries to a courier" },
  { key: "couriers:suspend", module: "couriers", description: "Suspend or reinstate courier accounts" },

  // Admin user management
  { key: "admin_users:read",         module: "admin", description: "View admin user list, profiles, permission grants" },
  { key: "admin_users:create",       module: "admin", description: "Create admin user records before sending invitation" },
  { key: "admin_users:invite",       module: "admin", description: "Send Clerk invitation to a created admin user" },
  { key: "admin_users:permissions",  module: "admin", description: "Assign or revoke permission grants within a user's role pool" },
  { key: "admin_users:deactivate",   module: "admin", description: "Suspend or offboard admin users" },
  { key: "admin_users:roles:assign", module: "admin", description: "Change an admin user's role" },

  // Audit & settings
  { key: "audit_logs:read", module: "admin", description: "View and export the audit log" },
  { key: "settings:read",   module: "admin", description: "View system settings (geography, document types, payout types)" },
  { key: "settings:write",  module: "admin", description: "Modify system settings" },
] as const

type PermissionKey = typeof PERMISSIONS[number]["key"]
const ALL: PermissionKey[] = PERMISSIONS.map((p) => p.key)

// ─── 3. Permission pools per role ─────────────────────────────────────────────
// This defines the CEILING — what CAN be granted to a user with this role.
// Individual grants (what IS granted) happen during onboarding via AdminUserPermission.

const ROLE_POOLS: Record<string, PermissionKey[]> = {
  // super_admin can do everything — full pool
  super_admin: ALL,

  // identity_admin manages admin users only — no business data access
  identity_admin: [
    "admin_users:read",
    "admin_users:create",
    "admin_users:invite",
    "admin_users:permissions",
    "admin_users:deactivate",
    "admin_users:roles:assign",
    "audit_logs:read",
    "settings:read",
  ],

  // finance sees vendors and orders in read-only context, manages financial ops
  finance: [
    "vendors:read",
    "finance:transactions:read",
    "finance:payouts:read",
    "finance:payouts:approve",
    "finance:payouts:reverse",
    "finance:discounts:read",
    "finance:discounts:create",
    "finance:discounts:deactivate",
    "finance:reports:read",
    "finance:reports:export",
    "orders:read",
  ],

  // vendor_ops handles onboarding and account management
  vendor_ops: [
    "vendors:read",
    "vendors:create",
    "vendors:approve",
    "vendors:suspend",
    "vendors:export",
    "finance:discounts:read",
    "orders:read",
    "settings:read",
  ],

  // customer_care handles customer accounts and order support
  customer_care: [
    "customers:read",
    "customers:refund",
    "customers:suspend",
    "orders:read",
    "vendors:read",
  ],

  // courier_ops handles courier onboarding and live dispatch
  courier_ops: [
    "couriers:read",
    "couriers:approve",
    "couriers:assign",
    "couriers:suspend",
    "orders:read",
  ],
}

// ─── 4. Action reasons ────────────────────────────────────────────────────────

const ACTION_REASONS = [
  // Suspension reasons — vendors and outlets
  {
    code       : "POLICY_VIOLATION",
    label      : "Policy violation",
    description: "The vendor has violated platform terms of service or operational policies.",
    appliesTo  : ["vendor_account.suspended", "outlet.suspended", "meal.suspended"],
  },
  {
    code       : "QUALITY_ISSUES",
    label      : "Quality issues",
    description: "Repeated complaints about food quality or hygiene standards.",
    appliesTo  : ["vendor_account.suspended", "outlet.suspended", "meal.suspended"],
  },
  {
    code       : "SAFETY_CONCERN",
    label      : "Food safety concern",
    description: "A food safety issue has been reported or identified.",
    appliesTo  : ["vendor_account.suspended", "outlet.suspended", "meal.banned"],
  },
  {
    code       : "FRAUDULENT_ACTIVITY",
    label      : "Fraudulent activity",
    description: "Suspected or confirmed fraudulent behaviour.",
    appliesTo  : [
      "vendor_account.suspended", "vendor_account.banned",
      "outlet.suspended", "outlet.banned",
      "customer.suspended",
    ],
  },
  {
    code       : "DOCUMENT_ISSUES",
    label      : "Document issues",
    description: "Documents are expired, invalid, or have not been submitted.",
    appliesTo  : ["vendor_account.suspended", "outlet.suspended"],
  },

  // Application rejection reasons
  {
    code       : "INCOMPLETE_DOCUMENTS",
    label      : "Incomplete or missing documents",
    description: "Required documents are missing or have not been uploaded.",
    appliesTo  : ["vendor_application.rejected"],
  },
  {
    code       : "DOCUMENT_EXPIRED",
    label      : "Expired documents",
    description: "One or more submitted documents have expired.",
    appliesTo  : ["vendor_application.rejected"],
  },
  {
    code       : "INVALID_INFORMATION",
    label      : "Invalid business information",
    description: "Business details cannot be verified or are inconsistent.",
    appliesTo  : ["vendor_application.rejected"],
  },
  {
    code       : "INELIGIBLE_VENDOR_TYPE",
    label      : "Vendor type not supported",
    description: "This vendor type is not currently supported in the selected country.",
    appliesTo  : ["vendor_application.rejected"],
  },

  // Customer reasons
  {
    code       : "REFUND_POLICY",
    label      : "Refund per policy",
    description: "Refund issued in accordance with platform refund policy.",
    appliesTo  : ["customer.refund"],
  },
  {
    code       : "CUSTOMER_ABUSE",
    label      : "Abusive behaviour",
    description: "Customer has engaged in abusive behaviour towards vendors, couriers, or staff.",
    appliesTo  : ["customer.suspended"],
  },

  // Admin user reasons
  {
    code       : "EMPLOYMENT_ENDED",
    label      : "Employment ended",
    description: "Team member has left the organisation.",
    appliesTo  : ["admin_user.deactivated"],
  },
  {
    code       : "TEMPORARY_SUSPENSION",
    label      : "Temporary suspension",
    description: "Account suspended pending investigation or review.",
    appliesTo  : ["admin_user.deactivated", "vendor_account.suspended"],
  },
] as const

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding DailyBread admin infrastructure...\n")

  // 1. Roles
  console.log("  [1/4] Roles...")
  for (const role of ROLES) {
    await prisma.adminRole.upsert({
      where  : { name: role.name },
      update : { displayName: role.displayName, description: role.description },
      create : role,
    })
  }
  console.log(`        ✓ ${ROLES.length} roles`)

  // 2. Permissions
  console.log("  [2/4] Permissions...")
  for (const perm of PERMISSIONS) {
    await prisma.adminPermission.upsert({
      where  : { key: perm.key },
      update : { module: perm.module, description: perm.description },
      create : { ...perm, isActive: true },
    })
  }
  console.log(`        ✓ ${PERMISSIONS.length} permissions`)

  // 3. Role permission pools
  console.log("  [3/4] Role permission pools...")
  let poolCount = 0

  for (const [roleName, keys] of Object.entries(ROLE_POOLS)) {
    const role = await prisma.adminRole.findUnique({ where: { name: roleName } })
    if (!role) { console.warn(`        ⚠ Role not found: ${roleName}`); continue }

    for (const key of keys) {
      const permission = await prisma.adminPermission.findUnique({ where: { key } })
      if (!permission) { console.warn(`        ⚠ Permission not found: ${key}`); continue }

      await prisma.adminRolePermission.upsert({
        where  : { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update : {},
        create : { roleId: role.id, permissionId: permission.id },
      })
      poolCount++
    }
  }
  console.log(`        ✓ ${poolCount} pool entries across ${Object.keys(ROLE_POOLS).length} roles`)

  // 4. Action reasons
  console.log("  [4/4] Action reasons...")
  for (const reason of ACTION_REASONS) {
    await prisma.adminActionReason.upsert({
      where  : { code: reason.code },
      update : { label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
      create : { code: reason.code, label: reason.label, description: reason.description, appliesTo: [...reason.appliesTo] },
    })
  }
  console.log(`        ✓ ${ACTION_REASONS.length} action reasons`)

  console.log("\n✅ Seed complete.\n")
  console.log("Next step: run the create-super-admin script to create your first admin user.")
  console.log("  pnpm --filter @repo/db create-super-admin -- --email <email> --name \"<name>\"\n")
}

seed()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
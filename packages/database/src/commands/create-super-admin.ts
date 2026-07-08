/**
 * CREATE SUPER ADMIN
 *
 * Creates the first super admin account. Run once during initial deployment.
 * Never expose this as an API endpoint.
 *
 * Flow:
 *   1. Creates AdminUser row (status: pending, firstName/lastName)
 *   2. Grants all super_admin permissions
 *   3. Assigns GLOBAL scope
 *   4. Writes a bootstrap AuditLog entry
 *   5. Sends Clerk invitation
 *   6. Updates status → invited
 *   7. User accepts → webhook fires → status: active, clerkUserId populated
 *
 * Usage:
 *   pnpm --filter @repo/db create-super-admin \
 *     -- --email admin@dailybread.co.ke \
 *        --first "Your First Name" \
 *        --last  "Your Last Name"
 *
 * Optional:
 *        --middle "Middle Name"
 */

import { input, confirm }          from "@inquirer/prompts"
import { createClerkClient }       from "@clerk/backend"
import { prisma, AdminUserStatus } from "../index"

// ─── Validate env vars ────────────────────────────────────────────────────────

const missing: string[] = []
if (!process.env.DATABASE_URL)           missing.push("DATABASE_URL")
if (!process.env.CLERK_ADMIN_SECRET_KEY) missing.push("CLERK_ADMIN_SECRET_KEY")

if (missing.length > 0) {
  console.error("\n❌ Missing required environment variables:")
  missing.forEach((v) => console.error(`   - ${v}`))
  process.exit(1)
}

console.log("✓ DATABASE_URL:", process.env.DATABASE_URL!.replace(/:([^:@]+)@/, ":****@"))
console.log("✓ CLERK_ADMIN_SECRET_KEY: loaded\n")

// ─── CLI arg parser ───────────────────────────────────────────────────────────
//
// Arguments override prompts; anything missing from argv is asked for
// interactively. Both `--first/--middle/--last` and a single `--name`
// are supported — `--name` wins if both happen to be passed.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || !process.argv[idx + 1]) return null
  return process.argv[idx + 1]!
}

async function resolveEmail(): Promise<string> {
  const flagValue = getArg("--email")

  if (flagValue !== null) {
    if (!EMAIL_RE.test(flagValue)) {
      console.error(`\n❌ Invalid email: ${flagValue}\n`)
      process.exit(1)
    }
    return flagValue
  }

  return input({
    message : "Email",
    validate: (v) => EMAIL_RE.test(v.trim()) || "Enter a valid email address",
  })
}

type NameParts = { firstName: string; middleName: string | null; lastName: string }

async function resolveName(): Promise<NameParts> {
  const nameFlag = getArg("--name")

  // Style 2: a single --name flag is split into first / middle / last
  if (nameFlag !== null) {
    const parts = nameFlag.trim().split(/\s+/).filter(Boolean)

    if (parts.length < 2) {
      console.error(`\n❌ --name must include at least a first and last name: "${nameFlag}"\n`)
      process.exit(1)
    }

    return {
      firstName : parts[0]!,
      middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
      lastName  : parts[parts.length - 1]!,
    }
  }

  // Style 1: --first / --middle / --last, each falling back to a prompt
  const firstFlag  = getArg("--first")
  const middleFlag = getArg("--middle")
  const lastFlag   = getArg("--last")

  const firstName = firstFlag ?? await input({
    message : "First name",
    validate: (v) => v.trim().length > 0 || "First name is required",
  })

  const middleInput = middleFlag ?? await input({ message: "Middle name (optional)" })
  const middleName  = middleInput.trim().length > 0 ? middleInput.trim() : null

  const lastName = lastFlag ?? await input({
    message : "Last name",
    validate: (v) => v.trim().length > 0 || "Last name is required",
  })

  return { firstName, middleName, lastName }
}

function printSummary(email: string, name: NameParts) {
  console.log("─".repeat(58))
  console.log("  Super Admin")
  console.log()
  console.log(`  Email        : ${email}`)
  console.log(`  First Name   : ${name.firstName}`)
  console.log(`  Middle Name  : ${name.middleName ?? "—"}`)
  console.log(`  Last Name    : ${name.lastName}`)
  console.log(`  Role         : Super Admin`)
  console.log(`  Scope        : GLOBAL`)
  console.log("─".repeat(58))
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const email = await resolveEmail()
  const name  = await resolveName()
  const { firstName, middleName, lastName } = name
  const displayName = [firstName, middleName, lastName].filter(Boolean).join(" ")

  // 1. Verify seed has been run
  const superAdminRole = await prisma.adminRole.findUnique({
    where  : { name: "super_admin" },
    include: { permissions: { include: { permission: true } } },
  })

  if (!superAdminRole) {
    console.error("❌ super_admin role not found. Run the seed first:\n")
    console.error("   pnpm --filter @repo/db seed\n")
    process.exit(1)
  }

  // 1b. Guard against a partially-run seed — a super admin with zero
  // permissions would succeed silently otherwise.
  if (superAdminRole.permissions.length === 0) {
    console.error("❌ super_admin role exists but has no permissions attached.")
    console.error("   The role-permissions seed step appears not to have run:\n")
    console.error("   pnpm --filter @repo/db db:seed:admin\n")
    process.exit(1)
  }

  // 2. Check for duplicate
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ An admin user already exists for ${email}`)
    console.error(`   id: ${existing.id}, status: ${existing.status}\n`)
    process.exit(1)
  }

  // 3. Confirm before writing anything
  printSummary(email, name)
  const proceed = await confirm({ message: "Continue?", default: true })
  if (!proceed) {
    console.log("\nAborted — nothing was created.\n")
    process.exit(0)
  }

  console.log(`\n🔐 Creating super admin: ${displayName} <${email}>\n`)

  // 4. Create user row + all permissions + GLOBAL scope + bootstrap audit entry
  console.log("  [1/3] Creating admin user record...")

  const adminUser = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email,
        firstName,
        middleName: middleName || null,
        lastName,
        roleId  : superAdminRole.id,
        status  : AdminUserStatus.pending,
        isActive: false,
        // Self-bootstrapped — no inviter exists yet
        invitedById: null,
        scopes: {
          create: { scopeType: "GLOBAL", countryId: null, cityId: null },
        },
      },
    })

    // Grant all permissions in the super_admin pool
    await tx.adminUserPermission.createMany({
      data: superAdminRole.permissions.map((rp) => ({
        adminUserId : user.id,
        permissionId: rp.permissionId,
        grantedById : user.id,  // self-granted for bootstrap — this account
                                  // genuinely is its own first grantor.
      })),
    })

    // Bootstrap audit entry — distinguishes this account from ones created
    // through the normal invite-by-an-existing-admin flow.
    //
    // adminUserId is left null on purpose: this action wasn't performed by
    // an existing admin (none exist yet) and it isn't a system/cron job
    // either — it's a developer running a local/deploy-time script. The
    // "via" field in metadata plus entityId (pointing at the new user)
    // is enough to reconstruct what happened.
    await tx.auditLog.create({
      data: {
        adminUserId: null,
        action: "admin_user.bootstrap_created",
        entityType: "AdminUser",
        entityId: user.id,
        metadata: {
          role: "super_admin",
          scope: "GLOBAL",
          via: "create-super-admin script",
          createdEmail: email,
        },
      },
    })

    return user
  })

  console.log(`         ✓ AdminUser row created  (id: ${adminUser.id})`)
  console.log(`         ✓ ${superAdminRole.permissions.length} permissions granted`)
  console.log(`         ✓ GLOBAL scope assigned`)
  console.log(`         ✓ bootstrap audit entry written`)

  // 5. Send Clerk invitation
  console.log("  [2/3] Sending Clerk invitation...")

  const clerk = createClerkClient({ secretKey: process.env.CLERK_ADMIN_SECRET_KEY! })

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl : process.env.ADMIN_APP_URL
        ? `${process.env.ADMIN_APP_URL}/sign-up`
        : "http://localhost:3002/sign-up",
      publicMetadata: {
        adminUserId     : adminUser.id,
        role            : "super_admin",
        roleDisplayName : "Super Admin",
        displayName,
        // Used by the Clerk invitation email template
        inviteMessage: "You've been invited to join DailyBread Admin as Super Admin.",
      },
      notify: true,
    })

    // Mark as invited — the Clerk webhook checks for this status before activating
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data : {
        status              : AdminUserStatus.invited,
        invitationSentCount : 1,
        invitationSentAt    : new Date(),
      },
    })

    console.log(`         ✓ Invitation sent  (Clerk id: ${invitation.id})`)
    console.log(`         ✓ Status updated: pending → invited`)
  } catch (err: any) {
    // Roll back the DB row if Clerk fails.
    // Cascades: AdminUserScope + AdminUserPermission both delete via
    // onDelete: Cascade on adminUserId. AuditLog does NOT cascade off
    // AdminUser (and the bootstrap entry has adminUserId: null anyway),
    // so it's matched by entityId/entityType and deleted explicitly first.
    await prisma.auditLog.deleteMany({
      where: { entityType: "AdminUser", entityId: adminUser.id },
    })
    await prisma.adminUser.delete({ where: { id: adminUser.id } })

    const msg = err?.errors?.[0]?.longMessage
      ?? err?.errors?.[0]?.message
      ?? String(err)

    console.error(`\n❌ Clerk invitation failed: ${msg}`)
    console.error("   The admin user record has been rolled back.\n")
    process.exit(1)
  }

  // 6. Summary
  console.log("  [3/3] Done.\n")
  console.log("─".repeat(58))
  console.log(`  Name         : ${displayName}`)
  console.log(`  Email        : ${email}`)
  console.log(`  Role         : Super Admin`)
  console.log(`  Scope        : GLOBAL`)
  console.log(`  Permissions  : ${superAdminRole.permissions.length}`)
  console.log(`  DB row id    : ${adminUser.id}`)
  console.log(`  Status       : invited  ← webhook activates on acceptance`)
  console.log("─".repeat(58))
  console.log()
  console.log("  ✅ Invitation email sent to:", email)
  console.log()
  console.log("  Next steps:")
  console.log("  1. Accept the invitation from your email")
  console.log("  2. Sign up at:", process.env.ADMIN_APP_URL ?? "http://localhost:3002")
  console.log("  3. The webhook will activate your account automatically")
  console.log()
}

main()
  .catch((err) => { console.error("❌ Script failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
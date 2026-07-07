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
 *   4. Sends Clerk invitation
 *   5. Updates status → invited
 *   6. User accepts → webhook fires → status: active, clerkUserId populated
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

function getArg(flag: string, required = true): string {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || !process.argv[idx + 1]) {
    if (required) {
      console.error(`\nMissing required argument: ${flag}`)
      console.error(
        'Usage: pnpm --filter @repo/db create-super-admin -- \\\n' +
        '         --email admin@example.com \\\n' +
        '         --first "First" \\\n' +
        '         --last  "Last"\n',
      )
      process.exit(1)
    }
    return ""
  }
  return process.argv[idx + 1]!
}

const email      = getArg("--email")
const firstName  = getArg("--first")
const lastName   = getArg("--last")
const middleName = getArg("--middle", false) // optional

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`\nInvalid email: ${email}\n`)
  process.exit(1)
}

const displayName = [firstName, middleName || null, lastName].filter(Boolean).join(" ")

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔐 Creating super admin: ${displayName} <${email}>\n`)

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

  // 2. Check for duplicate
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ An admin user already exists for ${email}`)
    console.error(`   id: ${existing.id}, status: ${existing.status}\n`)
    process.exit(1)
  }

  // 3. Create user row + all permissions + GLOBAL scope
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
    if (superAdminRole.permissions.length > 0) {
      await tx.adminUserPermission.createMany({
        data: superAdminRole.permissions.map((rp) => ({
          adminUserId : user.id,
          permissionId: rp.permissionId,
          grantedById : user.id,  // self-granted for bootstrap
        })),
      })
    }

    return user
  })

  console.log(`         ✓ AdminUser row created  (id: ${adminUser.id})`)
  console.log(`         ✓ ${superAdminRole.permissions.length} permissions granted`)
  console.log(`         ✓ GLOBAL scope assigned`)

  // 4. Send Clerk invitation
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
    // Roll back the DB row if Clerk fails
    await prisma.adminUser.delete({ where: { id: adminUser.id } })

    const msg = err?.errors?.[0]?.longMessage
      ?? err?.errors?.[0]?.message
      ?? String(err)

    console.error(`\n❌ Clerk invitation failed: ${msg}`)
    console.error("   The admin user record has been rolled back.\n")
    process.exit(1)
  }

  // 5. Summary
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
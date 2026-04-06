/**
 * CREATE SUPER ADMIN
 *
 * Creates the first super admin account. Run once during initial deployment.
 * Never expose as an API endpoint.
 *
 * Flow:
 *   1. Creates AdminUser row (status: pending)
 *   2. Sends Clerk invitation
 *   3. Updates status → invited  ← webhook checks for this before activating
 *   4. User accepts invite → webhook fires → status: active, clerkUserId populated
 *
 * Usage:
 *   pnpm --filter @repo/db create-super-admin -- --email admin@dailybread.co.ke --name "Your Name"
 */

import { createClerkClient }         from "@clerk/backend"
import { prisma, AdminUserStatus }   from "../index"

// ─── Validate env vars ────────────────────────────────────────────────────────

const missing: string[] = []
if (!process.env.DATABASE_URL)           missing.push("DATABASE_URL")
if (!process.env.CLERK_ADMIN_SECRET_KEY) missing.push("CLERK_ADMIN_SECRET_KEY")

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:`)
  missing.forEach((v) => console.error(`   - ${v}`))
  process.exit(1)
}

console.log("✓ DATABASE_URL:", process.env.DATABASE_URL!.replace(/:([^:@]+)@/, ":****@"))
console.log("✓ CLERK_ADMIN_SECRET_KEY: loaded\n")

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`\nMissing required argument: ${flag}`)
    console.error('Usage: pnpm --filter @repo/db create-super-admin -- --email <email> --name "<name>"\n')
    process.exit(1)
  }
  return process.argv[idx + 1]!
}

const email    = getArg("--email")
const fullName = getArg("--name")

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`\nInvalid email: ${email}\n`)
  process.exit(1)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔐 Creating super admin: ${fullName} <${email}>\n`)

  const superAdminRole = await prisma.adminRole.findUnique({
    where  : { name: "super_admin" },
    include: {
      permissions: { include: { permission: true } },
    },
  })

  if (!superAdminRole) {
    console.error("❌ super_admin role not found. Run the seed first.\n")
    process.exit(1)
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ An admin user already exists for ${email}`)
    console.error(`   id: ${existing.id}, status: ${existing.status}\n`)
    process.exit(1)
  }

  // 1. Create user row + permissions + GLOBAL scope
  console.log("  [1/3] Creating admin user record...")

  const adminUser = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email,
        fullName,
        roleId  : superAdminRole.id,
        status  : AdminUserStatus.pending,
        isActive: false,
        scopes  : {
          create: { scopeType: "GLOBAL", countryId: null, cityId: null },
        },
      },
    })

    const grants = superAdminRole.permissions.map((rp) => ({
      adminUserId : user.id,       // ← correct Prisma field name
      permissionId: rp.permissionId,
      grantedById : user.id,
    }))

    if (grants.length > 0) {
      await tx.adminUserPermission.createMany({ data: grants })
    }

    return user
  })

  console.log(`         ✓ AdminUser row created (id: ${adminUser.id})`)
  console.log(`         ✓ ${superAdminRole.permissions.length} permissions granted`)
  console.log(`         ✓ GLOBAL scope assigned`)

  // 2. Send Clerk invitation
  console.log("  [2/3] Sending Clerk invitation...")

  const clerk = createClerkClient({ secretKey: process.env.CLERK_ADMIN_SECRET_KEY! })

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress  : email,
      redirectUrl   : process.env.ADMIN_APP_URL
        ? `${process.env.ADMIN_APP_URL}/sign-up`
        : "http://localhost:3002/sign-up",
      publicMetadata: { role: "Super Admin", organisation: "DailyBread" },
      notify        : true,
    })

    // Move status to invited — the webhook checks for this before activating.
    // Without this update the webhook sees "pending" and rejects the signup.
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data : {
        status              : AdminUserStatus.invited,
        invitationSentCount : 1,
        invitationSentAt    : new Date(),
      },
    })

    console.log(`         ✓ Invitation sent (Clerk id: ${invitation.id})`)
    console.log(`         ✓ Status updated: pending → invited`)
  } catch (err: any) {
    await prisma.adminUser.delete({ where: { id: adminUser.id } })

    const msg = err?.errors?.[0]?.longMessage
      ?? err?.errors?.[0]?.message
      ?? String(err)

    console.error(`\n❌ Clerk invitation failed: ${msg}`)
    console.error("   The admin user record has been rolled back.\n")
    process.exit(1)
  }

  // 3. Summary
  console.log("  [3/3] Done.\n")
  console.log("─".repeat(55))
  console.log(`  Name         : ${fullName}`)
  console.log(`  Email        : ${email}`)
  console.log(`  Role         : Super Admin`)
  console.log(`  Scope        : GLOBAL`)
  console.log(`  Permissions  : ${superAdminRole.permissions.length}`)
  console.log(`  DB row id    : ${adminUser.id}`)
  console.log(`  Status       : invited  ← webhook activates on acceptance`)
  console.log("─".repeat(55))
  console.log()
  console.log("  ✅ Invitation email sent to:", email)
  console.log()
}

main()
  .catch((err) => { console.error("❌ Script failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
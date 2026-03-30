/**
 * CREATE SUPER ADMIN
 *
 * Creates the first super admin account. Run once during initial deployment.
 * Never expose as an API endpoint.
 *
 * Flow:
 *   1. Creates AdminUser row (email, fullName, role, permissions, GLOBAL scope)
 *   2. Sends Clerk invitation → webhook fires on acceptance → isActive=true
 *
 * Usage (from repo root):
 *   pnpm --filter @repo/db create-super-admin -- --email admin@dailybread.co.ke --name "Your Name"
 *
 * Prerequisites:
 *   - Migration has been run (tables exist)
 *   - Seed has been run (super_admin role and permissions exist)
 *   - DATABASE_URL and CLERK_ADMIN_SECRET_KEY are in your ROOT .env
 *
 * Env is loaded by tsx via --env-file=../../.env in package.json — this means
 * DATABASE_URL is available before any module (including client.ts) is evaluated.
 * Do NOT add dotenv imports here; they fight ESM import hoisting and cause
 * the Prisma adapter to initialise with undefined as the connection string.
 */

import { createClerkClient } from "@clerk/backend"
import { prisma } from "../index"

// ─── Validate env vars ────────────────────────────────────────────────────────

const missing: string[] = []
if (!process.env.DATABASE_URL)           missing.push("DATABASE_URL")
if (!process.env.CLERK_ADMIN_SECRET_KEY) missing.push("CLERK_ADMIN_SECRET_KEY")

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:`)
  missing.forEach((v) => console.error(`   - ${v}`))
  console.error(`\n   Ensure these are set in your root .env file.\n`)
  process.exit(1)
}

console.log("✓ DATABASE_URL:", process.env.DATABASE_URL!.replace(/:([^:@]+)@/, ":****@"))
console.log("✓ CLERK_ADMIN_SECRET_KEY: loaded\n")

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`\nMissing required argument: ${flag}`)
    console.error('Usage: pnpm --filter @repo/db create-super-admin -- --email <email> --name "<n>"\n')
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

  // 1. Verify super_admin role exists (seed must have run first)
  const superAdminRole = await prisma.adminRole.findUnique({
    where  : { name: "super_admin" },
    include: {
      permissions: { include: { permission: true } },
    },
  })

  if (!superAdminRole) {
    console.error("❌ super_admin role not found.")
    console.error("   Run the seed first: pnpm --filter @repo/db seed:admin\n")
    process.exit(1)
  }

  // 2. Guard against duplicate
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ An admin user already exists for ${email}`)
    console.error(`   Row id: ${existing.id}, isActive: ${existing.isActive}\n`)
    process.exit(1)
  }

  // 3. Create AdminUser + permissions + GLOBAL scope in one transaction
  console.log("  [1/3] Creating admin user record...")

  const adminUser = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email,
        fullName,
        roleId  : superAdminRole.id,
        isActive: false, // webhook sets this to true when invitation is accepted
        scopes  : {
          create: {
            scopeType : "GLOBAL",
            countryId : null,
            cityId    : null,
          },
        },
      },
    })

    const grants = superAdminRole.permissions.map((rp) => ({
      adminUserId : user.id,
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

  // 4. Send Clerk invitation
  console.log("  [2/3] Sending Clerk invitation...")

  const clerk = createClerkClient({
    secretKey: process.env.CLERK_ADMIN_SECRET_KEY!,
  })

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress  : email,
      redirectUrl   : process.env.ADMIN_APP_URL
        ? `${process.env.ADMIN_APP_URL}/sign-up`
        : "http://localhost:3002/sign-up",
      publicMetadata: {
        role        : "Super Admin",
        organisation: "DailyBread",
      },
      notify: true,
    })

    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data : {
        invitationSentCount: 1,
        invitationSentAt   : new Date(),
      },
    })

    console.log(`         ✓ Invitation sent (Clerk id: ${invitation.id})`)
  } catch (err: any) {
    // Clerk failed — roll back so the script can be re-run cleanly
    await prisma.adminUser.delete({ where: { id: adminUser.id } })

    const msg = err?.errors?.[0]?.longMessage
      ?? err?.errors?.[0]?.message
      ?? String(err)

    console.error(`\n❌ Clerk invitation failed: ${msg}`)
    console.error("   The admin user record has been rolled back.")
    console.error("   Fix the error above and re-run this script.\n")
    process.exit(1)
  }

  // 5. Summary
  console.log("  [3/3] Done.\n")
  console.log("─".repeat(55))
  console.log(`  Name         : ${fullName}`)
  console.log(`  Email        : ${email}`)
  console.log(`  Role         : Super Admin`)
  console.log(`  Scope        : GLOBAL`)
  console.log(`  Permissions  : ${superAdminRole.permissions.length} (full super_admin pool)`)
  console.log(`  DB row id    : ${adminUser.id}`)
  console.log(`  isActive     : false  ← webhook activates on invitation acceptance`)
  console.log("─".repeat(55))
  console.log()
  console.log("  ✅ Invitation email sent to:", email)
  console.log("  Once they accept, the Clerk webhook fires and activates the account.")
  console.log()
}

main()
  .catch((err) => {
    console.error("❌ Script failed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
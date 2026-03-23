/**
 * CREATE SUPER ADMIN
 *
 * Creates the first super admin account. Run once during initial deployment.
 * Never expose as an API endpoint.
 *
 * Flow (matches the standard admin onboarding flow):
 *   1. Creates AdminUser row (email, fullName, role, permissions, scope)
 *   2. Sends Clerk invitation — webhook will populate clerkUserId + set isActive=true
 *
 * Usage:
 *   pnpm --filter @repo/db create-super-admin -- --email admin@dailybread.co.ke --name "Your Name"
 *
 * Prerequisites:
 *   - prisma db seed has been run (roles and permissions must exist)
 *   - CLERK_ADMIN_SECRET_KEY is set in .env
 *   - DATABASE_URL is set in .env
 */

import { createClerkClient } from "@clerk/backend"
import {prisma} from '../index';


// Load env — adjust path if your db package has its own .env loading
const envPath = require("path").resolve(__dirname, "../../apps/backend/.env")
require("dotenv").config({ path: envPath })



// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag: string): string {
  const idx = process.argv.indexOf(flag)
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`\nMissing required argument: ${flag}`)
    console.error("Usage: pnpm --filter @repo/db create-super-admin -- --email <email> --name \"<name>\"\n")
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
  console.log(`\n🔐 Creating super admin: ${fullName} <${email}>\n`)

  // 1. Verify super_admin role and all its permissions exist (seed must have run)
  const superAdminRole = await prisma.adminRole.findUnique({
    where   : { name: "super_admin" },
    include : {
      permissions: { include: { permission: true } },
    },
  })

  if (!superAdminRole) {
    console.error("❌ super_admin role not found. Run the seed first:\n   pnpm --filter @repo/db seed\n")
    process.exit(1)
  }

  // 2. Check this email isn't already registered as an admin
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ An admin user already exists for ${email}\n`)
    process.exit(1)
  }

  // 3. Create the AdminUser row with role, permissions, and global scope
  //    clerkUserId is null — populated when they accept the invitation
  //    isActive is false — flipped to true by the webhook
  console.log("  [1/3] Creating admin user record...")

  const adminUser = await prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email,
        fullName,
        roleId  : superAdminRole.id,
        isActive: false,  // webhook sets this to true
        scopes  : {
          create: {
            scopeType : "GLOBAL",
            countryId : null,
            cityId    : null,
          },
        },
      },
    })

    // Grant all permissions in the super_admin pool
    const permissionGrants = superAdminRole.permissions.map((rp) => ({
      adminUserId  : user.id,
      permissionId : rp.permissionId,
      grantedById  : user.id,  // self-granted for the founding super admin
    }))

    await tx.adminUserPermission.createMany({ data: permissionGrants })

    return user
  })

  console.log(`         ✓ Admin user record created (id: ${adminUser.id})`)
  console.log(`         ✓ ${superAdminRole.permissions.length} permissions granted`)
  console.log(`         ✓ GLOBAL scope assigned`)

  // 4. Send Clerk invitation
  console.log("  [2/3] Sending Clerk invitation...")

  if (!process.env.CLERK_ADMIN_SECRET_KEY) {
    console.error("❌ CLERK_ADMIN_SECRET_KEY is not set in your environment\n")
    await prisma.adminUser.delete({ where: { id: adminUser.id } })
    process.exit(1)
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_ADMIN_SECRET_KEY })

  try {
    await clerk.invitations.createInvitation({
      emailAddress : email,
      redirectUrl  : process.env.ADMIN_APP_URL
        ? `${process.env.ADMIN_APP_URL}/sign-up`
        : "http://localhost:3002/sign-up",
      publicMetadata: {
        role        : "Super Admin",
        organisation: "DailyBread",
      },
      notify: true,
    })

    // Update invitation tracking fields
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data : {
        invitationSentCount : 1,
        invitationSentAt    : new Date(),
      },
    })

    console.log("         ✓ Invitation sent")
  } catch (err: any) {
    const msg = err?.errors?.[0]?.message ?? String(err)
    console.error(`❌ Clerk invitation failed: ${msg}`)
    console.error("   The admin user record has been created but no invitation was sent.")
    console.error("   Re-run this script or use the resend-invitation endpoint once your backend is running.\n")
    process.exit(1)
  }

  // 5. Summary
  console.log("  [3/3] Done.\n")
  console.log("─".repeat(50))
  console.log(`  Name         : ${fullName}`)
  console.log(`  Email        : ${email}`)
  console.log(`  Role         : Super Admin`)
  console.log(`  Scope        : GLOBAL`)
  console.log(`  Permissions  : ${superAdminRole.permissions.length} (full pool)`)
  console.log(`  Active       : false (pending invitation acceptance)`)
  console.log("─".repeat(50))
  console.log("\n  ✅ An invitation email has been sent.")
  console.log("  Once accepted, the Clerk webhook will activate this account.\n")
}

main()
  .catch((err) => { console.error("❌ Script failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
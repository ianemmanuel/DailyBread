/**
 * ADMIN INFRASTRUCTURE SEED
 * Idempotent — safe to run multiple times.
 *
 * Ordering matters:
 *   1. Roles + Permissions have no dependency on each other — run in parallel.
 *   2. Role-Permission pools depend on both of the above existing first.
 *   3. Action reasons are independent of everything else.
 *
 * The system actor (SYSTEM_USER_ID) is seeded separately by
 * src/seed/system/index.ts — see the root orchestrator for ordering.
 * Nothing in this module depends on it.
 *
 * This file is dual-purpose:
 *   - Run directly:      `tsx src/seed/admin/index.ts` (targeted re-seed of admin only)
 *   - Imported by root:  `import { seedAdmin } from './admin'` in src/seed/index.ts
 * It only connects/disconnects Prisma and calls process.exit when run directly —
 * when imported, the caller owns the Prisma lifecycle.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { prisma } from '../../index'
import { seedRoles } from './roles.seed'
import { seedPermissions } from './permissions.seed'
import { seedRolePermissions } from './role-permissions.seed'
import { seedActionReasons } from './action-reasons.seed'
// TODO: wire these in once their data files exist
// import { seedFeatureFlags } from './feature-flags.seed'
// import { seedSystemSettings } from './system-settings.seed'

export async function seedAdmin() {
  console.log("🌱 Seeding DailyBread admin infrastructure...\n")

  console.log("  [1/4] Roles + Permissions...")
  const [roleCount, permCount] = await Promise.all([
    seedRoles(),
    seedPermissions(),
  ])
  console.log(`        ✓ ${roleCount} roles`)
  console.log(`        ✓ ${permCount} permissions`)

  console.log("  [2/4] Role permission pools...")
  const poolCount = await seedRolePermissions()
  console.log(`        ✓ ${poolCount} pool entries`)

  console.log("  [3/4] Action reasons...")
  const reasonCount = await seedActionReasons()
  console.log(`        ✓ ${reasonCount} action reasons`)

  // console.log("  [4/4] Feature flags + system settings...")
  // await seedFeatureFlags()
  // await seedSystemSettings()

  console.log("\n✅ Admin seed complete.")
}

// Only run + disconnect when this file is the process entrypoint
// (i.e. `tsx src/seed/admin/index.ts`), never when imported.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  seedAdmin()
    .catch((err) => { console.error("❌ Admin seed failed:", err); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
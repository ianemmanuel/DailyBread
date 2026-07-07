/**
 * ADMIN INFRASTRUCTURE SEED
 * Idempotent — safe to run multiple times.
 *
 * Ordering matters:
 *   1. Roles + Permissions have no dependency on each other — run in parallel.
 *   2. Role-Permission pools depend on both of the above existing first.
 *   3. Action reasons are independent of everything else.
 */
import 'dotenv/config'
import { prisma } from '../../index'
import { seedRoles } from './roles.seed'
import { seedPermissions } from './permissions.seed'
import { seedRolePermissions } from './role-permissions.seed'
import { seedActionReasons } from './action-reasons.seed'
// TODO: wire these in once their data files exist
// import { seedFeatureFlags } from './feature-flags.seed'
// import { seedSystemSettings } from './system-settings.seed'

async function seed() {
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

  console.log("\n✅ Seed complete.")
}

seed()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())
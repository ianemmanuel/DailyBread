/**
 * ROOT SEED ORCHESTRATOR
 * Idempotent — safe to run multiple times.
 *
 * Calls each module's exported seed function directly (in-process), not as a
 * subprocess — this keeps a single Prisma connection alive across all of them
 * instead of opening/closing one per module.
 *
 * Each module's own `index.ts` still works standalone via
 * `tsx src/seed/<module>/index.ts` for a targeted re-seed — see the isMain
 * guard in each module's index.ts. When imported here, that guard is false,
 * so the module doesn't disconnect Prisma out from under the other modules.
 *
 * Cross-module order — this is the ONLY thing this file is responsible for.
 * Internal ordering within a module (e.g. roles before role-permissions)
 * is owned by that module's own index.ts:
 *
 *   1. System    — the reserved system actor (SYSTEM_USER_ID). Foundational:
 *      nothing else has a hard FK dependency on it yet, but future automated
 *      writes (audit entries from cron jobs, etc.) will, so it goes first.
 *   2. Geography — countries/cities/regions. Nothing else should seed
 *      against a country/city that doesn't exist yet.
 *   3. Admin     — roles/permissions/action reasons. Independent of
 *      geography for the data itself, but AdminUserScope rows reference
 *      Country/City, so keep it after geography once that module exists.
 *   4. Vendor    — vendor types + country/vendor-type joins. Depends on
 *      geography (VendorTypeCountry) and optionally on admin document
 *      type configs.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { prisma } from '../index'
import { seedSystem } from './system'
import { seedAdmin } from './admin'
// TODO: uncomment as these modules are built
// import { seedGeography } from './geography'
// import { seedVendor } from './vendor'

async function seed() {
  console.log("🌱 Seeding DailyBread database...\n")

  console.log("── System ─────────────────────────────────")
  await seedSystem()
  console.log()

  // console.log("── Geography ─────────────────────────────")
  // await seedGeography()
  // console.log()

  console.log("── Admin ──────────────────────────────────")
  await seedAdmin()
  console.log()

  // console.log("── Vendor ─────────────────────────────────")
  // await seedVendor()
  // console.log()

  console.log("✅ All seeds complete.")
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  seed()
    .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
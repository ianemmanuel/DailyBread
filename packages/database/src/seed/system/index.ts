/**
 * SYSTEM ACTOR SEED
 * Idempotent — safe to run multiple times.
 *
 * Seeds the reserved system AdminUser row (see src/constants.ts for
 * SYSTEM_USER_ID) used to attribute automated, non-human writes — cron
 * jobs, background flags — where a required foreign key needs a valid
 * AdminUser to point at.
 *
 * This file is dual-purpose:
 *   - Run directly:      `tsx src/seed/system/index.ts` (targeted re-seed)
 *   - Imported by root:  `import { seedSystem } from './system'` in src/seed/index.ts
 * It only connects/disconnects Prisma and calls process.exit when run directly —
 * when imported, the caller owns the Prisma lifecycle.
 */
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { prisma } from '../../index'
import { seedSystemUser } from './system-user.seed'

export async function seedSystem() {
  console.log("🌱 Seeding system actor...\n")
  await seedSystemUser()
  console.log("✅ System actor ready.")
}

// Only run + disconnect when this file is the process entrypoint, never when imported.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  seedSystem()
    .catch((err) => { console.error("❌ System seed failed:", err); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
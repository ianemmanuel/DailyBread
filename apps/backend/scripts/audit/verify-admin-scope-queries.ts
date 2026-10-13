/*
 * READ-ONLY verification (writes nothing) — the SQL transcriptions of the
 * admin authorization rules agree with the pure rules, on the REAL rows of
 * this database:
 *
 *   1. effectivelyHoldsWhere(key)  ≡  effectivePermissionKeys(admin).includes(key)
 *      for every permission key — including the inactive-city clause
 *   2. adminsInScopeWhere(scope)   ≡  targetInScope(scope, admin's scope)
 *      for GLOBAL, every country and every city
 *
 * Also reports what the new rules change for existing accounts: CITY admins
 * whose city is inactive (now no authority), and whether the recovery
 * permission exists in this database yet.
 *
 * Every query runs inside one READ ONLY transaction; a fingerprint of the
 * admin tables is printed before and after.
 *
 *   pnpm dlx tsx --env-file=.env scripts/audit/verify-admin-scope-queries.ts
 */
import { prisma } from "@repo/db"
import { effectivelyHoldsWhere, effectivePermissionKeys, resolveAdminScope, type PermissionSubject } from "@/lib/permissions/effective"
import { deriveScopeContext } from "@/lib/permissions/single-scope"
import { resolvedScopeFrom, targetInScope, type ResolvedScope } from "@/modules/admin/lib/delegation/delegation-policy"
import { adminsInScopeWhere } from "@/modules/admin/services/admin.user.service"
import { SYSTEM_USER_ID } from "@/constants/system"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail)}`}`)
}
const mask = (e: string) => (e.includes("@") ? `${e[0]}***@${e.split("@")[1]}` : e)

async function fingerprint() {
  const [users, grants, scopes, pools, perms, audits] = await Promise.all([
    prisma.adminUser.count(), prisma.adminUserPermission.count(), prisma.adminUserScope.count(),
    prisma.adminRolePermission.count(), prisma.adminPermission.count(), prisma.auditLog.count(),
  ])
  return { users, grants, scopes, pools, perms, audits }
}

async function main() {
  const before = await fingerprint()
  console.log("\n  fingerprint before:", before)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")

    const admins = await tx.adminUser.findMany({
      include: {
        role       : { include: { permissions: { include: { permission: true } } } },
        permissions: { include: { permission: true } },
        scopes     : { include: { city: { select: { countryId: true, status: true } } } },
      },
    })
    const effective = new Map(admins.map((a) => [a.id, new Set(effectivePermissionKeys(a as unknown as PermissionSubject))]))

    console.log("\n  ── 1. effectivelyHoldsWhere ≡ effectivePermissionKeys\n")
    const keys = (await tx.adminPermission.findMany({ select: { key: true } })).map((p) => p.key)
    let mismatched = 0
    for (const key of keys) {
      const sql  = new Set((await tx.adminUser.findMany({ where: effectivelyHoldsWhere(key), select: { id: true } })).map((u) => u.id))
      const pure = new Set(admins.filter((a) => effective.get(a.id)!.has(key)).map((a) => a.id))
      const same = sql.size === pure.size && [...sql].every((id) => pure.has(id))
      if (!same) { mismatched++; check(`agree on ${key}`, false, { sql: [...sql], pure: [...pure] }) }
    }
    check(`all ${keys.length} permission keys agree across ${admins.length} admins`, mismatched === 0)

    console.log("\n  ── 2. adminsInScopeWhere ≡ targetInScope\n")
    const scopeOf = (a: (typeof admins)[number]): ResolvedScope | null => {
      const { scope, valid } = deriveScopeContext(a.scopes.map((r) => ({
        scopeType: r.scopeType, countryId: r.countryId, cityId: r.cityId, cityCountryId: r.city?.countryId ?? null,
      })))
      return resolvedScopeFrom(scope, valid)
    }
    const countries = await tx.country.findMany({ select: { id: true } })
    const cities    = await tx.city.findMany({ select: { id: true, countryId: true } })
    const scopes: ResolvedScope[] = [
      { tier: "GLOBAL", countryId: null, cityId: null },
      ...countries.map((c) => ({ tier: "COUNTRY" as const, countryId: c.id, cityId: null })),
      ...cities.map((c) => ({ tier: "CITY" as const, countryId: c.countryId, cityId: c.id })),
    ]
    let scopeMismatch = 0
    for (const scope of scopes) {
      const sql  = new Set((await tx.adminUser.findMany({ where: adminsInScopeWhere(scope), select: { id: true } })).map((u) => u.id))
      const pure = new Set(admins.filter((a) => a.id !== SYSTEM_USER_ID && targetInScope(scope, scopeOf(a))).map((a) => a.id))
      const same = sql.size === pure.size && [...sql].every((id) => pure.has(id))
      if (!same) { scopeMismatch++; check(`agree on ${scope.tier} ${scope.countryId ?? ""} ${scope.cityId ?? ""}`, false, { sql: [...sql], pure: [...pure] }) }
    }
    check(`all ${scopes.length} scopes (GLOBAL, ${countries.length} countries, ${cities.length} cities) agree`, scopeMismatch === 0)

    console.log("\n  ── 3. what the new rules change for existing accounts (report only)\n")
    const inactiveCity = admins.filter((a) => resolveAdminScope(a as unknown as PermissionSubject).invalidReason === "SCOPE_CITY_INACTIVE")
    console.log(`  CITY admins whose city is INACTIVE (now no authority): ${inactiveCity.length}`)
    for (const a of inactiveCity) console.log(`    - ${mask(a.email)} (${a.role?.name ?? "no role"}, ${a.status}, ${a.permissions.length} grant rows kept)`)
    const recover = await tx.adminPermission.findUnique({ where: { key: "admin_users:permissions:recover" }, select: { id: true, isActive: true } })
    console.log(`  admin_users:permissions:recover in this database: ${recover ? `yes (active: ${recover.isActive})` : "NO — the recovery routes are unreachable until it is seeded"}`)
    if (recover) {
      const inIdentityPool = await tx.adminRolePermission.count({ where: { permissionId: recover.id, role: { name: "identity_admin" } } })
      const holders        = await tx.adminUser.count({ where: effectivelyHoldsWhere("admin_users:permissions:recover") })
      console.log(`  …in the identity_admin pool: ${inIdentityPool ? "yes" : "no"}; effective holders: ${holders}`)
    }
  }, { timeout: 120_000 })

  const after = await fingerprint()
  console.log("\n  fingerprint after: ", after)
  check("nothing was written", JSON.stringify(before) === JSON.stringify(after), { before, after })
  console.log(`\n  ${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}\n`)
}

main()
  .catch((err) => { console.error(err); failures++ })
  .finally(async () => { await prisma.$disconnect(); process.exit(failures === 0 ? 0 : 1) })

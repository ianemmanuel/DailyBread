/*
 * Smoke test — the ERP identity directory, against the DEV DATABASE.
 *
 *   1. listAdminUsers: rows AND statusCounts are the actor's scope only
 *      (COUNTRY, CITY, invalid); filters narrow inside it and leave the counts
 *   2. lifecycle: self-suspension / self-deactivation refused and nothing
 *      written; a colleague can still be suspended
 *   3. attribution: createdBy is the creator, invitationSentBy is null until
 *      an invitation is recorded, and the detail read returns both relations
 *
 * Builds its own throwaway countries, cities and admins; sweeps strays first
 * and cleans up after itself. Sends no Clerk calls (no account has an
 * identity link, and no invitation is sent).
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/admin.identity.smoke.ts
 */
import { prisma, Prisma } from "@repo/db"
import {
  createAdminUser, deactivateAdminUser, getAdminUser, listAdminUsers, suspendAdminUser,
} from "@/modules/admin/services/admin.user.service"

const MARKER = "zz-smoke-identity"
const TZ     = "Pacific/Kiritimati"

let passed = 0
let failed = 0
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}
async function refusal(p: Promise<unknown>): Promise<string> {
  try { await p; return "NO_ERROR" } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

async function sweep() {
  const admins = await prisma.adminUser.findMany({ where: { email: { startsWith: MARKER } }, select: { id: true } })
  const ids = admins.map((a) => a.id)
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { adminUserId: { in: ids } }] } })
  await prisma.adminUserPermission.deleteMany({ where: { adminUserId: { in: ids } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: ids } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

const IDENTITY_KEYS = [
  "admin_users:profiles:read", "admin_users:accounts:create", "admin_users:accounts:suspend",
  "admin_users:accounts:deactivate",
]

async function main() {
  console.log("\n── identity directory smoke ────────────────────────────────\n")
  await sweep()

  const [identityRole, vendorOps, superAdmin] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { name: "identity_admin" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { name: "vendor_ops" } }),
    prisma.adminUser.findFirst({ where: { role: { name: "super_admin" }, status: "active" }, select: { id: true } }),
  ])
  if (!superAdmin) { console.error("  SKIPPED — needs an active super admin"); return }

  const mkCountry = (tag: string, code: string, phone: string) => prisma.country.create({
    data: {
      name: `ZZ Identity ${tag}`, code, slug: `${MARKER}-${tag}`, currency: "KES", currencyCode: "KES",
      phoneCode: phone, timezones: [TZ], status: "ACTIVE",
    },
  })
  const countryA = await mkCountry("a", "ZZIA", "+99961")
  const countryB = await mkCountry("b", "ZZIB", "+99962")
  const mkCity = (countryId: string, slug: string) => prisma.city.create({
    data: { countryId, name: `ZZ Identity ${slug}`, slug: `${MARKER}-${slug}`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const cityA1 = await mkCity(countryA.id, "a1")
  const cityA2 = await mkCity(countryA.id, "a2")

  type ScopeIn = Prisma.AdminUserScopeCreateWithoutAdminUserInput
  const inCountry = (id: string): ScopeIn => ({ scopeType: "COUNTRY", country: { connect: { id } } })
  const inCity = (cityId: string, countryId: string): ScopeIn => ({ scopeType: "CITY", city: { connect: { id: cityId } }, country: { connect: { id: countryId } } })
  const mkAdmin = (tag: string, scope: ScopeIn, status: "active" | "pending" | "suspended" = "active", roleId = vendorOps.id, keys: string[] = []) =>
    prisma.adminUser.create({
      data: {
        email: `${MARKER}-${tag}@example.test`, firstName: "Smoke", lastName: tag, roleId, status, isActive: status === "active",
        scopes: { create: scope },
        permissions: { create: keys.map((key) => ({ permission: { connect: { key } }, grantedBy: { connect: { id: superAdmin.id } } })) },
      },
    })

  const idA   = await mkAdmin("id-a", inCountry(countryA.id), "active", identityRole.id, IDENTITY_KEYS)
  const idA2  = await mkAdmin("id-a2", inCountry(countryA.id), "active", identityRole.id, IDENTITY_KEYS)
  await mkAdmin("vo-a", inCountry(countryA.id), "suspended")
  await mkAdmin("vo-a1", inCity(cityA1.id, countryA.id), "pending")
  await mkAdmin("vo-a2", inCity(cityA2.id, countryA.id))
  await mkAdmin("vo-b", inCountry(countryB.id), "suspended")

  const A  = { tier: "COUNTRY" as const, countryId: countryA.id, cityId: null }
  const A1 = { tier: "CITY" as const, countryId: countryA.id, cityId: cityA1.id }
  const ours = (r: { users: Array<{ email: string }> }) => r.users.map((u) => u.email.replace(`${MARKER}-`, "").replace("@example.test", "")).sort()

  try {
    console.log("  ── 1. list and counts are scoped\n")
    const a = await listAdminUsers({ pageSize: 100 }, A)
    check("COUNTRY A lists exactly its own admins", JSON.stringify(ours(a)) === JSON.stringify(["id-a", "id-a2", "vo-a", "vo-a1", "vo-a2"]), ours(a))
    check("…and counts exactly them, per status (groupBy on the real table)",
      JSON.stringify(a.statusCounts) === JSON.stringify({ total: 5, pending: 1, invited: 0, active: 3, suspended: 1, deactivated: 0 }), a.statusCounts)
    const a1 = await listAdminUsers({ pageSize: 100 }, A1)
    check("CITY A1 lists and counts only its city", JSON.stringify(ours(a1)) === JSON.stringify(["vo-a1"]) && a1.statusCounts.total === 1, a1.statusCounts)
    const narrowed = await listAdminUsers({ status: "suspended", countryId: countryB.id, pageSize: 100 }, A)
    check("a filter naming another country returns nothing and leaves the counts", narrowed.total === 0 && narrowed.statusCounts.total === 5, narrowed)
    const none = await listAdminUsers({ pageSize: 100 }, null)
    check("an invalid scope lists nothing and counts zero", none.total === 0 && none.statusCounts.total === 0, none.statusCounts)
    check("an unknown status filter is refused", await refusal(listAdminUsers({ status: "everyone" }, A)) === "INVALID_STATUS_FILTER")

    console.log("\n  ── 2. no self-suspension or self-deactivation\n")
    check("self-suspension is refused", await refusal(suspendAdminUser(idA.id, "smoke", idA.id)) === "SELF_ACTION_FORBIDDEN")
    check("self-deactivation is refused", await refusal(deactivateAdminUser(idA.id, "smoke", idA.id)) === "SELF_ACTION_FORBIDDEN")
    const self = await prisma.adminUser.findUniqueOrThrow({ where: { id: idA.id }, select: { status: true } })
    check("…and the account is untouched", self.status === "active", self)
    await suspendAdminUser(idA2.id, "smoke: on leave", idA.id)
    const colleague = await prisma.adminUser.findUniqueOrThrow({ where: { id: idA2.id }, select: { status: true } })
    check("a same-country colleague can still be suspended", colleague.status === "suspended", colleague)

    console.log("\n  ── 3. created by vs invitation sent by\n")
    const created = await createAdminUser({
      firstName: "Smoke", lastName: "hire", email: `${MARKER}-hire@example.test`, roleId: vendorOps.id,
      scopes: [{ scopeType: "COUNTRY", countryId: countryA.id }],
    }, idA.id)
    const fresh = await getAdminUser(created.id, idA.id)
    check("createdBy is the creating admin", fresh.createdBy?.id === idA.id, fresh.createdBy)
    check("invitationSentBy is null before any invitation", fresh.invitationSentBy === null, fresh.invitationSentBy)
    check("isSelf is false for someone else", fresh.isSelf === false)
    await prisma.adminUser.update({ where: { id: created.id }, data: { invitationSentAt: new Date(), invitationSentById: idA2.id } })
    const invited = await getAdminUser(created.id, idA.id)
    check("invitationSentBy resolves the recorded sender, independent of the creator",
      invited.invitationSentBy?.id === idA2.id && invited.createdBy?.id === idA.id, invited)
    check("isSelf is true on your own record", (await getAdminUser(idA.id, idA.id)).isSelf === true)
  } finally {
    await sweep()
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

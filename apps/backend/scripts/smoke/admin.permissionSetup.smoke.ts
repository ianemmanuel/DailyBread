/*
 * Smoke test — pending permission setup, against the DEV DATABASE.
 *
 *   1. opening is idempotent (createMany skipDuplicates + conditional reopen)
 *   2. the queue's SQL: pending rows inside the actor's scope, plus the
 *      effectivelyHoldsWhere delegate lookup that decides attention
 *   3. completion inside the grant transaction; a stale second save is refused
 *   4. a role change reopens; deactivation cancels; reactivation resets
 *   5. detail, permission-options and list reads carry the state
 *
 * Builds its own throwaway countries, city and admins; sweeps strays first and
 * cleans up after itself. Sends no Clerk calls: the invitation step is the
 * same openPermissionSetup the invitation transaction runs.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/admin.permissionSetup.smoke.ts
 */
import { prisma, Prisma } from "@repo/db"
import {
  deactivateAdminUser, getAdminUser, getPermissionOptions, listAdminUsers, reactivateAdminUser,
  updateAdminUserPermissions, updateAdminUserRole,
} from "@/modules/admin/services/admin.user.service"
import { getPermissionSetupSummary, listPermissionSetups } from "@/modules/admin/services/admin.permissionSetup.service"
import { openPermissionSetup } from "@/modules/admin/services/admin.permissionSetup.lifecycle"

const MARKER = "zz-smoke-setup"
const TZ     = "Pacific/Kiritimati"
const MANAGE  = "admin_users:permissions:manage"
const RECOVER = "admin_users:permissions:recover"

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
  await prisma.adminPermissionSetup.deleteMany({ where: { adminUserId: { in: ids } } })
  await prisma.adminUserPermission.deleteMany({ where: { adminUserId: { in: ids } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: ids } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

const setupOf = (adminUserId: string) => prisma.adminPermissionSetup.findUnique({ where: { adminUserId } })
const ids = (r: { setups: Array<{ target: { id: string } }> }) => r.setups.map((s) => s.target.id).sort()

async function main() {
  console.log("\n── permission setup smoke ──────────────────────────────────\n")
  await sweep()

  const [identity, vendorOps, finance, superAdmin] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { name: "identity_admin" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { name: "vendor_ops" } }),
    prisma.adminRole.findUniqueOrThrow({ where: { name: "finance" } }),
    prisma.adminUser.findFirst({ where: { role: { name: "super_admin" }, status: "active" }, select: { id: true } }),
  ])
  if (!superAdmin) { console.error("  SKIPPED — needs an active super admin"); return }
  const voKey = (await prisma.adminRolePermission.findFirstOrThrow({
    where: { roleId: vendorOps.id, permission: { isActive: true, key: { not: MANAGE } } }, include: { permission: true },
  })).permission.key

  const mkCountry = (tag: string, code: string, phone: string) => prisma.country.create({
    data: { name: `ZZ Setup ${tag}`, code, slug: `${MARKER}-${tag}`, currency: "KES", currencyCode: "KES", phoneCode: phone, timezones: [TZ], status: "ACTIVE" },
  })
  const countryA = await mkCountry("a", "ZZSA", "+99971")
  const countryB = await mkCountry("b", "ZZSB", "+99972")
  const cityA1 = await prisma.city.create({
    data: { countryId: countryA.id, name: "ZZ Setup a1", slug: `${MARKER}-a1`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })

  type ScopeIn = Prisma.AdminUserScopeCreateWithoutAdminUserInput
  const inCountry = (id: string): ScopeIn => ({ scopeType: "COUNTRY", country: { connect: { id } } })
  const inCity = (cityId: string, countryId: string): ScopeIn => ({ scopeType: "CITY", city: { connect: { id: cityId } }, country: { connect: { id: countryId } } })
  const mkAdmin = (tag: string, roleId: string, scope: ScopeIn, status: "active" | "invited" = "active", keys: string[] = []) =>
    prisma.adminUser.create({
      data: {
        email: `${MARKER}-${tag}@example.test`, firstName: "Smoke", lastName: tag, roleId, status, isActive: status === "active",
        invitationSentAt: status === "invited" ? new Date() : null,
        scopes: { create: scope },
        permissions: { create: keys.map((key) => ({ permission: { connect: { key } }, grantedBy: { connect: { id: superAdmin.id } } })) },
      },
    })

  const idA     = await mkAdmin("id-a", identity.id, inCountry(countryA.id), "active",
    [MANAGE, RECOVER, "admin_users:profiles:read", "admin_users:roles:assign", "admin_users:accounts:deactivate", "admin_users:accounts:reinstate"])
  const voLeadA = await mkAdmin("vo-lead-a", vendorOps.id, inCountry(countryA.id), "active", [MANAGE, voKey])
  const voLeadB = await mkAdmin("vo-lead-b", vendorOps.id, inCountry(countryB.id), "active", [MANAGE, voKey])
  const hire    = await mkAdmin("hire-a1", vendorOps.id, inCity(cityA1.id, countryA.id), "invited")
  const finA    = await mkAdmin("fin-a", finance.id, inCountry(countryA.id), "invited")

  try {
    console.log("  ── 1. opening is idempotent\n")
    for (const id of [hire.id, hire.id, finA.id]) await prisma.$transaction((tx) => openPermissionSetup(tx, id))
    const rows = await prisma.adminPermissionSetup.findMany({ where: { adminUserId: { in: [hire.id, finA.id] } } })
    check("one PENDING row per invited account, however often it is opened",
      rows.length === 2 && rows.every((r) => r.status === "PENDING"), rows)

    console.log("\n  ── 2. who sees what (real SQL)\n")
    const lead = await listPermissionSetups({ pageSize: 100 }, voLeadA.id)
    check("the country lead sees its city hire in its department lane, nothing else",
      JSON.stringify(ids(lead)) === JSON.stringify([hire.id]) && lead.setups[0]?.lane === "department" && lead.setups[0]?.attention === true, lead.setups)
    check("…and its summary counts it", JSON.stringify(await getPermissionSetupSummary(voLeadA.id)) === JSON.stringify({ total: 1, attention: 1 }))
    const other = await getPermissionSetupSummary(voLeadB.id)
    check("another country's lead sees and counts nothing of it", !ids(await listPermissionSetups({ pageSize: 100 }, voLeadB.id)).includes(hire.id) && other.total === 0, other)
    const rec = await listPermissionSetups({ pageSize: 100 }, idA.id)
    const byId = Object.fromEntries(rec.setups.map((s) => [s.target.id, s]))
    check("the country identity admin recovers both", byId[hire.id]?.lane === "recovery" && byId[finA.id]?.lane === "recovery", rec.setups)
    check("…nudged only for finance, which has no lead (the delegate lookup ran)", byId[finA.id]?.attention === true && byId[hire.id]?.attention === false)

    console.log("\n  ── 3. completion and the stale second save\n")
    await updateAdminUserPermissions({ adminUserId: hire.id, permissionKeys: [voKey], expectedGrants: [] }, voLeadA.id)
    const done = await setupOf(hire.id)
    check("the grant completes it inside its transaction, recording who", done?.status === "COMPLETED" && done.resolvedById === voLeadA.id, done)
    check("a second save from a stale editor is refused with the reason",
      await refusal(updateAdminUserPermissions({ adminUserId: hire.id, permissionKeys: [], expectedGrants: [] }, idA.id, "recovery")) === "PERMISSION_SETUP_COMPLETED")
    const grants = await prisma.adminUserPermission.count({ where: { adminUserId: hire.id } })
    check("…and overwrote nothing", grants === 1)
    check("the lead's queue is empty again", (await getPermissionSetupSummary(voLeadA.id)).total === 0)

    console.log("\n  ── 4. role change, deactivation, reactivation\n")
    await updateAdminUserPermissions({ adminUserId: finA.id, permissionKeys: [], expectedGrants: [] }, idA.id, "recovery")
    check("an empty save leaves it pending", (await setupOf(finA.id))?.status === "PENDING")
    const finKey = (await prisma.adminRolePermission.findFirstOrThrow({ where: { roleId: finance.id, permission: { isActive: true, key: { not: MANAGE } } }, include: { permission: true } })).permission.key
    await updateAdminUserPermissions({ adminUserId: finA.id, permissionKeys: [finKey] }, idA.id, "recovery")
    check("recovery completes it", (await setupOf(finA.id))?.status === "COMPLETED")
    await updateAdminUserRole({ adminUserId: finA.id, roleId: vendorOps.id }, idA.id)
    const reopened = await setupOf(finA.id)
    check("a role change clears grants and reopens it", reopened?.status === "PENDING" && reopened.resolvedById === null, reopened)
    check("…now in the vendor_ops lead's department lane", ids(await listPermissionSetups({ lane: "department", pageSize: 100 }, voLeadA.id)).includes(finA.id))
    await deactivateAdminUser(finA.id, "smoke", idA.id)
    check("deactivation cancels it", (await setupOf(finA.id))?.status === "CANCELLED")
    await reactivateAdminUser(finA.id, idA.id)
    check("reactivation starts a new cycle", (await setupOf(finA.id)) === null)

    console.log("\n  ── 5. reads carry the state\n")
    const detail = await getAdminUser(hire.id, idA.id)
    check("detail: permissionSetup with who resolved it", detail.permissionSetup?.status === "COMPLETED" && detail.permissionSetup.resolvedBy?.id === voLeadA.id, detail.permissionSetup)
    const options = await getPermissionOptions(hire.id, voLeadA.id)
    check("permission-options: setup", options.setup?.status === "COMPLETED", options.setup)
    const list = await listAdminUsers({ pageSize: 100 }, { tier: "COUNTRY", countryId: countryA.id, cityId: null })
    const row = list.users.find((u) => u.id === hire.id)
    check("list rows: permissionSetup.status", row?.permissionSetup?.status === "COMPLETED", row?.permissionSetup)
  } finally {
    await sweep()
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

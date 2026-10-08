/*
 * Smoke test — ONE ADMIN → ONE SCOPE, against the DEV DATABASE.
 *
 *   1. the database refuses a second scope row and a malformed row
 *   2. assignment (create / update) takes exactly one scope, derives a CITY
 *      scope's country from the city, and checks the actor on UPDATE too
 *   3. the scope the real middleware derives from real rows, applied to the
 *      Meals listing and dish services: CITY in its city only, never
 *      dish-wide; COUNTRY across its country only
 *
 * Builds its own throwaway countries, cities and admin users; cleans up after
 * itself and sweeps strays from an aborted run first. Sends no Clerk calls.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/admin.scope.smoke.ts
 */
import type { Request, Response } from "express"
import { prisma, Prisma } from "@repo/db"
import { MEAL_REASON_ACTIONS } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import { buildScopeContext } from "@/modules/admin/middleware/buildScopeContext"
import { createAdminUser, updateAdminUserScopes } from "@/modules/admin/services/admin.user.service"
import { listListingsForAdmin, applyListingControl } from "@/modules/meals/services/listings.service"
import { setMenuItemStatus } from "@/modules/meals/services/moderation.service"
import { listMenusForAdmin, getMenuForAdmin } from "@/modules/meals/services/menus.service"

const MARKER = "zz-smoke-adminscope"
const SMOKE_REASON = `${MARKER}-reason`
/** A predefined reason valid for every meal action (Phase 2.1). */
const R = { code: SMOKE_REASON, vendorMessage: undefined, internalNote: undefined }
const TZ     = "Pacific/Kiritimati"

/* Moderation actions purge the storefront's cache over HTTP
 * (revalidateStorefront, never throws). Answered here so the smoke needs no
 * storefront running — same interception as meals.listings. */
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.endsWith("/api/revalidate")) return new Response("{}", { status: 200 })
  return realFetch(input, init)
}) as typeof fetch

let passed = 0
let failed = 0
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}
async function refusal(p: Promise<unknown>): Promise<string> {
  try { await p; return "NO_ERROR" } catch (e) {
    const err = e as { code?: string; meta?: unknown }
    return err.code ?? String(e)
  }
}

async function sweep() {
  await prisma.adminActionReason.deleteMany({ where: { code: { startsWith: MARKER } } })
  const admins = await prisma.adminUser.findMany({ where: { email: { startsWith: MARKER } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: admins.map((a) => a.id) } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: admins.map((a) => a.id) } } })
  const vendors = await prisma.vendorAccount.findMany({ where: { businessEmail: { startsWith: MARKER } }, select: { id: true } })
  const meals = await prisma.meal.findMany({ where: { outlet: { vendorId: { in: vendors.map((v) => v.id) } } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: meals.map((m) => m.id) } } })
  await prisma.vendorAccount.deleteMany({ where: { id: { in: vendors.map((v) => v.id) } } })
  await prisma.vendorApplication.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorUser.deleteMany({ where: { email: { startsWith: MARKER } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

/** Exactly what the real chain does: loadAdminUser's include, then
 *  buildScopeContext. */
async function scopeOf(adminUserId: string): Promise<AdminScopeContext> {
  const adminUser = await prisma.adminUser.findUniqueOrThrow({
    where  : { id: adminUserId },
    include: { role: true, scopes: { include: { city: { select: { countryId: true } } } } },
  })
  const req = { adminUser } as unknown as Request
  buildScopeContext(req, {} as Response, () => undefined)
  return (req as unknown as { adminScope: AdminScopeContext }).adminScope
}

async function main() {
  console.log("\n── admin single-scope smoke ────────────────────────────────\n")
  await sweep()
  await prisma.adminActionReason.create({ data: {
    code: SMOKE_REASON, label: "Smoke reason",
    description: "Smoke-test reason explaining this action to the vendor.",
    appliesTo: [...MEAL_REASON_ACTIONS],
  } })

  const [vendorOps, vendorType, superAdmin] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { name: "vendor_ops" } }),
    prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }),
    prisma.adminUser.findFirst({ where: { role: { name: "super_admin" } }, select: { id: true } }),
  ])
  if (!vendorType || !superAdmin) { console.error("  SKIPPED — needs an active vendor type and a super admin"); return }

  const mkCountry = (tag: string, code: string, cur: string) => prisma.country.create({
    data: {
      name: `ZZ Scope ${tag}`, code, slug: `${MARKER}-${tag}`, currency: cur, currencyCode: cur,
      phoneCode: `+9995${tag === "a" ? 1 : 2}`, timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const countryA = await mkCountry("a", "ZZSA", "KES")
  const countryB = await mkCountry("b", "ZZSB", "UGX")
  const mkCity = (countryId: string, slug: string) => prisma.city.create({
    data: { countryId, name: `ZZ Scope ${slug}`, slug: `${MARKER}-${slug}`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const cityA1 = await mkCity(countryA.id, "a1")
  const cityA2 = await mkCity(countryA.id, "a2")
  const cityB1 = await mkCity(countryB.id, "b1")

  const mkAdmin = (tag: string, scope: Prisma.AdminUserScopeCreateWithoutAdminUserInput) => prisma.adminUser.create({
    data: {
      email: `${MARKER}-${tag}@example.test`, firstName: "Smoke", lastName: tag, roleId: vendorOps.id,
      status: "active", isActive: true, scopes: { create: scope },
    },
  })
  const cityAdmin    = await mkAdmin("city", { scopeType: "CITY", city: { connect: { id: cityA1.id } }, country: { connect: { id: countryA.id } } })
  const countryAdmin = await mkAdmin("country", { scopeType: "COUNTRY", country: { connect: { id: countryA.id } } })
  const target       = await mkAdmin("target", { scopeType: "COUNTRY", country: { connect: { id: countryA.id } } })

  try {
    // ════════════════════════════════════════════════════════════════════
    console.log("  ── 1. the database holds one well-formed scope per admin\n")

    const second = await refusal(prisma.adminUserScope.create({
      data: { adminUserId: target.id, scopeType: "CITY", cityId: cityB1.id, countryId: countryB.id },
    }))
    check("a second scope row is refused by the unique index", second === "P2002", second)
    const malformed = await refusal(prisma.$executeRaw`
      UPDATE "AdminUserScope" SET "cityId" = ${cityA1.id} WHERE "adminUserId" = ${target.id}`)
    check("a COUNTRY row with a city is refused by the shape check", malformed !== "NO_ERROR", malformed)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. assignment takes exactly one scope\n")

    // A COUNTRY-A identity admin, as buildScopeContext would build them.
    const ACTOR_A: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" }
    const upd = (scopes: unknown) => refusal(updateAdminUserScopes(
      { adminUserId: target.id, scopes: scopes as never }, superAdmin.id, ACTOR_A, "identity_admin"))

    check("two scopes are refused", await upd([
      { scopeType: "COUNTRY", countryId: countryA.id }, { scopeType: "CITY", cityId: cityA1.id },
    ]) === "SINGLE_SCOPE_REQUIRED")
    check("a COUNTRY scope naming a city is refused",
      await upd([{ scopeType: "COUNTRY", countryId: countryA.id, cityId: cityA1.id }]) === "INVALID_SCOPE_SHAPE")
    check("a CITY scope with a country it is not in is refused (no forged country)",
      await upd([{ scopeType: "CITY", cityId: cityB1.id, countryId: countryA.id }]) === "COUNTRY_MISMATCH")
    check("a country admin cannot re-scope into another country's CITY (country derived from the city)",
      await upd([{ scopeType: "CITY", cityId: cityB1.id }]) === "SCOPE_FORBIDDEN")
    check("a country admin cannot re-scope into another COUNTRY (update now checks the actor)",
      await upd([{ scopeType: "COUNTRY", countryId: countryB.id }]) === "SCOPE_FORBIDDEN")

    check("one CITY scope in the actor's country is accepted", await upd([{ scopeType: "CITY", cityId: cityA2.id }]) === "NO_ERROR")
    const stored = await prisma.adminUserScope.findMany({ where: { adminUserId: target.id } })
    check("…stored as exactly one row, its country taken from the city",
      stored.length === 1 && stored[0]!.cityId === cityA2.id && stored[0]!.countryId === countryA.id, stored)

    const created = await refusal(createAdminUser(
      {
        firstName: "Smoke", lastName: "Create", email: `${MARKER}-create@example.test`, roleId: vendorOps.id,
        scopes: [{ scopeType: "COUNTRY", countryId: countryA.id }, { scopeType: "CITY", cityId: cityA1.id }],
      } as never,
      superAdmin.id, ACTOR_A, "identity_admin",
    ))
    check("creating an admin with two scopes is refused, and writes nothing",
      created === "SINGLE_SCOPE_REQUIRED"
      && (await prisma.adminUser.count({ where: { email: `${MARKER}-create@example.test` } })) === 0, created)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. the derived scope, applied to Meals\n")

    const CITY    = await scopeOf(cityAdmin.id)
    const COUNTRY = await scopeOf(countryAdmin.id)
    check("CITY derives tier CITY, its city, and ONLY its city's country",
      CITY.tier === "CITY" && CITY.cityIds.join() === cityA1.id && CITY.countryIds.join() === countryA.id, CITY)
    check("COUNTRY derives tier COUNTRY and exactly one country",
      COUNTRY.tier === "COUNTRY" && COUNTRY.countryIds.join() === countryA.id && COUNTRY.cityIds.length === 0, COUNTRY)

    // A tampered row: stored country B on a city-A1 row. The derived country
    // must still be A — the city's.
    await prisma.$executeRaw`UPDATE "AdminUserScope" SET "countryId" = ${countryB.id} WHERE "adminUserId" = ${cityAdmin.id}`
    check("a CITY scope's country comes from the city even when the row is tampered",
      (await scopeOf(cityAdmin.id)).countryIds.join() === countryA.id)
    await prisma.$executeRaw`UPDATE "AdminUserScope" SET "countryId" = ${countryA.id} WHERE "adminUserId" = ${cityAdmin.id}`

    // Meals fixtures: a vendor in A with one dish at an A1 outlet and an A2
    // outlet, and a vendor in B.
    const mkVendor = async (tag: string, countryId: string) => {
      const email = `${MARKER}-${tag}@example.test`
      const user = await prisma.vendorUser.create({ data: { externalAuthId: `${MARKER}-${tag}`, email } })
      const app = await prisma.vendorApplication.create({ data: { userId: user.id, countryId, vendorTypeId: vendorType.id, businessEmail: email } })
      return prisma.vendorAccount.create({
        data: {
          userId: user.id, vendorTypeId: vendorType.id, countryId, applicationId: app.id,
          legalBusinessName: `${MARKER} ${tag}`, businessEmail: email, businessPhone: `+9994${tag === "va" ? 1 : 2}000000`,
          ownerFirstName: "S", ownerLastName: tag, businessAddress: "1 Road", status: "ACTIVE",
        },
      })
    }
    const vA = await mkVendor("va", countryA.id)
    const vB = await mkVendor("vb", countryB.id)
    const mkOutlet = (vendorId: string, cityId: string, name: string) => prisma.outlet.create({
      data: { vendorId, cityId, name: `${MARKER} ${name}`, addressLine1: "1 Road", latitude: 0, longitude: 0, deliveryRadius: 5 },
    })
    const oA1 = await mkOutlet(vA.id, cityA1.id, "A1")
    const oA2 = await mkOutlet(vA.id, cityA2.id, "A2")
    const oB1 = await mkOutlet(vB.id, cityB1.id, "B1")
    const dishA = await prisma.menuItem.create({ data: { vendorId: vA.id, name: `${MARKER} Dish A`, basePriceMinor: 1000 } })
    const dishB = await prisma.menuItem.create({ data: { vendorId: vB.id, name: `${MARKER} Dish B`, basePriceMinor: 1000 } })
    const mA1 = await prisma.meal.create({ data: { outletId: oA1.id, menuItemId: dishA.id } })
    const mA2 = await prisma.meal.create({ data: { outletId: oA2.id, menuItemId: dishA.id } })
    const mB1 = await prisma.meal.create({ data: { outletId: oB1.id, menuItemId: dishB.id } })

    const listed = async (scope: AdminScopeContext) =>
      (await listListingsForAdmin(scope, { search: MARKER, pageSize: 100 })).items.map((i) => i.id)
    const cityIds = await listed(CITY)
    check("CITY lists its city's listing only", cityIds.length === 1 && cityIds[0] === mA1.id, cityIds)
    const countryIds = await listed(COUNTRY)
    check("COUNTRY lists its country's listings only",
      countryIds.includes(mA1.id) && countryIds.includes(mA2.id) && !countryIds.includes(mB1.id), countryIds)

    // Manipulated filters cannot widen the scope.
    const viaVendor = await listListingsForAdmin(CITY, { search: MARKER, vendorId: vA.id, outletId: oA2.id })
    check("CITY + an outlet filter naming another city returns nothing", viaVendor.items.length === 0)
    check("CITY + a country filter naming another country is a 404",
      await refusal(listListingsForAdmin(CITY, { countrySlug: countryB.slug })) === "COUNTRY_NOT_FOUND")

    // Acting.
    check("CITY can hide a listing in its own city",
      await refusal(applyListingControl(mA1.id, "hide", R, superAdmin.id, CITY)) === "NO_ERROR")
    check("CITY cannot act on a listing in another city of its country (404)",
      await refusal(applyListingControl(mA2.id, "hide", R, superAdmin.id, CITY)) === "NOT_FOUND")
    check("CITY cannot act in another country (404)",
      await refusal(applyListingControl(mB1.id, "hide", R, superAdmin.id, CITY)) === "NOT_FOUND")
    check("CITY cannot suspend the DISH (dish-wide, 403)",
      await refusal(setMenuItemStatus(dishA.id, "SUSPENDED", R, superAdmin.id, CITY, "ACTIVE")) === "DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE")

    check("COUNTRY can act on a single listing anywhere in its country",
      await refusal(applyListingControl(mA2.id, "suspend", R, superAdmin.id, COUNTRY)) === "NO_ERROR")
    check("…and only that listing changed", (await prisma.meal.findUniqueOrThrow({ where: { id: mA1.id } })).adminStatus === "ACTIVE")
    check("COUNTRY can act dish-wide in its country",
      await refusal(setMenuItemStatus(dishA.id, "SUSPENDED", R, superAdmin.id, COUNTRY, "ACTIVE")) === "NO_ERROR")
    check("COUNTRY cannot act on a listing outside its country (404)",
      await refusal(applyListingControl(mB1.id, "hide", R, superAdmin.id, COUNTRY)) === "NOT_FOUND")
    check("COUNTRY cannot act dish-wide outside its country (404)",
      await refusal(setMenuItemStatus(dishB.id, "SUSPENDED", R, superAdmin.id, COUNTRY, "ACTIVE")) === "NOT_FOUND")

    // Menus belong to one outlet: scoped like a listing, not by the vendor's
    // country (a CITY admin used to read every menu in their country).
    const mkMenu = (outletId: string, tag: string) => prisma.menu.create({
      data: {
        outletId, name: `${MARKER} Menu ${tag}`,
        imageOriginalKey: `${MARKER}/orig-${tag}`, imageKey: `${MARKER}/img-${tag}`,
        imageWidth: 1, imageHeight: 1, imageBlurDataUrl: "data:,",
      },
    })
    const menuA1 = await mkMenu(oA1.id, "a1")
    const menuA2 = await mkMenu(oA2.id, "a2")
    const cityMenus = (await listMenusForAdmin(CITY, { vendorId: vA.id })).map((m) => m.id)
    check("CITY reads its city's menus only (vendor drill-down kept inside the scope)",
      cityMenus.includes(menuA1.id) && !cityMenus.includes(menuA2.id), cityMenus)
    check("CITY opening another city's menu is a 404",
      await refusal(getMenuForAdmin(menuA2.id, CITY)) === "NOT_FOUND")
    const countryMenus = (await listMenusForAdmin(COUNTRY, { vendorId: vA.id })).map((m) => m.id)
    check("COUNTRY reads every menu in its country", countryMenus.includes(menuA1.id) && countryMenus.includes(menuA2.id))

    const GLOBAL = await scopeOf(superAdmin.id)
    check("the real super admin derives GLOBAL", GLOBAL.isGlobal && GLOBAL.tier === "GLOBAL")
    check("GLOBAL can act anywhere",
      await refusal(applyListingControl(mB1.id, "hide", R, superAdmin.id, GLOBAL)) === "NO_ERROR")
  } finally {
    await sweep()
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

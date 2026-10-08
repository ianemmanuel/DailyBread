/*
 * Smoke test — ERP meal LISTINGS (one dish at one outlet), against the DEV
 * DATABASE.
 *
 *   1. read: list + detail, permission gate, GLOBAL / COUNTRY / CITY scope
 *      through the OUTLET (a city admin sees their city, not their country),
 *      out-of-scope ids 404, filters routed through the real controller,
 *      price source, vendor state, and the blockers ⇔ predicate agreement
 *   2. marketplace controls — see the second half
 *
 * Driven over real HTTP through the REAL application routers, with only the
 * identity middleware replaced — the same harness as meals.adminModeration.
 * Builds its own throwaway countries, cities, zone, vendors and outlets, cleans
 * up after itself and sweeps strays from an aborted earlier run first.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/meals.listings.smoke.ts
 */
import express from "express"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import { AdminPermissions, MEAL_REASON_ACTIONS } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import vendorRoutes from "@/modules/vendor/routes"
import adminV1Router from "@/modules/admin/routes/v1"
import { errorHandler } from "@/middleware/error"
import { getStorefront, getMealDetail } from "@/modules/customer/services/customer.storefront.service"
import { priceCustomerCart } from "@/modules/customer/services/customer.cart.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"
import { clearCurrencyCache } from "@/modules/finance"
import { SELLABLE_MEAL_WHERE } from "@/modules/meals"
import { listingFiltersFrom } from "@/modules/meals/controllers/meals.admin.controller"

const MARKER = "zz-smoke-listings"
const SMOKE_REASON = `${MARKER}-reason`
const TZ     = "Pacific/Kiritimati"
const POINT  = { latitude: -19.5, longitude: -149.75 }
const square = (w: number, e: number) => ({
  type       : "Polygon",
  coordinates: [[[w, -20], [e, -20], [e, -19], [w, -19], [w, -20]]],
})

let passed = 0
let failed = 0
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let vendorCtx: { userId: string } | null = null
let adminCtx : { adminUser: { id: string }; adminPermissions: string[]; adminScope: AdminScopeContext } | null = null

const app = express()
app.use(express.json())
app.use("/api/vendor", (req, _res, next) => {
  if (vendorCtx) {
    (req as unknown as Json).vendor = {
      user: { id: vendorCtx.userId, email: "", isActive: true, isBanned: false, banReason: null, bannedAt: null },
      application: null, account: null, state: "ACTIVE",
    }
  }
  next()
}, vendorRoutes)
app.use("/api/admin/v1", (req, _res, next) => {
  if (adminCtx) Object.assign(req, adminCtx)
  next()
}, adminV1Router)
app.use(errorHandler)

let baseUrl = ""

const purges: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.endsWith("/api/revalidate")) {
    purges.push(String(JSON.parse(String(init?.body ?? "{}")).tag))
    return new Response("{}", { status: 200 })
  }
  return realFetch(input, init)
}) as typeof fetch
async function purgesDuring(act: () => Promise<unknown>): Promise<string[]> {
  const from = purges.length
  await act()
  await new Promise((r) => setTimeout(r, 50))
  return purges.slice(from)
}
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body   : body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: Json = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* not JSON */ }
  return { status: res.status, json }
}

const asVendor = (userId: string) => { vendorCtx = { userId } }
const asAdmin  = (id: string, permissions: string[], scope: AdminScopeContext) => {
  adminCtx = { adminUser: { id }, adminPermissions: permissions, adminScope: scope }
}

async function sweep() {
  await prisma.adminActionReason.deleteMany({ where: { code: { startsWith: MARKER } } })
  const vendors = await prisma.vendorAccount.findMany({ where: { businessEmail: { startsWith: MARKER } }, select: { id: true } })
  const vendorIds = vendors.map((v) => v.id)
  const meals = await prisma.meal.findMany({ where: { outlet: { vendorId: { in: vendorIds } } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { entityType: "Meal", entityId: { in: meals.map((m) => m.id) } } })
  await prisma.vendorAccount.deleteMany({ where: { id: { in: vendorIds } } })
  await prisma.vendorApplication.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorUser.deleteMany({ where: { email: { startsWith: MARKER } } })
  await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

async function makeVendor(tag: string, countryId: string, vendorTypeId: string) {
  const email = `${MARKER}-${tag}@example.test`
  const user = await prisma.vendorUser.create({ data: { externalAuthId: `${MARKER}-${tag}`, email } })
  const application = await prisma.vendorApplication.create({
    data: { userId: user.id, countryId, vendorTypeId, businessEmail: email },
  })
  const account = await prisma.vendorAccount.create({
    data: {
      userId: user.id, vendorTypeId, countryId, applicationId: application.id,
      legalBusinessName: `${MARKER} ${tag} Ltd`, businessEmail: email,
      businessPhone: `+997${tag === "a" ? "1" : "2"}000000`,
      ownerFirstName: "Smoke", ownerLastName: tag.toUpperCase(), businessAddress: "1 Test Road",
      status: "ACTIVE",
      vendorProfile: { create: { displayName: `${MARKER} ${tag} Foods`, isPublished: true, reviewStatus: "AUTO_APPROVED" } },
    },
  })
  return { userId: user.id, id: account.id }
}

async function makeOutlet(vendorId: string, cityId: string, zoneId: string | null, name: string) {
  return prisma.outlet.create({
    data: {
      vendorId, cityId, zoneId, name: `${MARKER} ${name}`, addressLine1: "1 Test Road",
      latitude: POINT.latitude, longitude: POINT.longitude, deliveryRadius: 5,
      adminStatus: "ACTIVE", clearanceStatus: "CLEARED", reviewStatus: "AUTO_APPROVED",
    },
  })
}

async function auditRows(entityId: string, atLeast: number) {
  const read = () => prisma.auditLog.findMany({
    where: { entityType: "Meal", entityId }, orderBy: { createdAt: "asc" },
    select: { action: true, adminUserId: true, changes: true, metadata: true },
  })
  let rows = await read()
  for (let i = 0; i < 30 && rows.length < atLeast; i++) {
    await new Promise((r) => setTimeout(r, 100))
    rows = await read()
  }
  return rows
}

async function main() {
  console.log("\n── meal listings smoke ─────────────────────────────────────\n")
  await sweep()
  // A throwaway global reason valid for every meal action (Phase 2.1:
  // consequential actions need one). Swept with the rest.
  await prisma.adminActionReason.create({ data: {
    code: SMOKE_REASON, label: "Smoke reason",
    description: "Smoke-test reason explaining this action to the vendor.",
    appliesTo: [...MEAL_REASON_ACTIONS],
  } })

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  const admin      = await prisma.adminUser.findFirst({ select: { id: true } })
  if (!vendorType || !admin) {
    console.error("  SKIPPED — needs an active vendor type and an admin user")
    return
  }

  const countryA = await prisma.country.create({
    data: {
      name: "ZZ Listings A", code: "ZZLA", slug: `${MARKER}-a`, currency: "KES", currencyCode: "KES",
      phoneCode: "+99961", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const countryB = await prisma.country.create({
    data: {
      name: "ZZ Listings B", code: "ZZLB", slug: `${MARKER}-b`, currency: "UGX", currencyCode: "UGX",
      phoneCode: "+99962", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const cityA1 = await prisma.city.create({
    data: {
      countryId: countryA.id, name: "ZZ Listings City One", slug: `${MARKER}-a1`, timezone: TZ, status: "ACTIVE",
      boundary: square(-150, -149), boundingBox: { north: -19, south: -20, east: -149, west: -150 },
      latitude: POINT.latitude, longitude: POINT.longitude,
    },
  })
  const cityA2 = await prisma.city.create({
    data: { countryId: countryA.id, name: "ZZ Listings City Two", slug: `${MARKER}-a2`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const cityB = await prisma.city.create({
    data: { countryId: countryB.id, name: "ZZ Listings City B", slug: `${MARKER}-b1`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const zone = await prisma.zone.create({
    data: { cityId: cityA1.id, name: "ZZ-LISTINGS", publicName: "ZZ Listings Area", boundaries: square(-150, -149), level: "MARKETPLACE", status: "ACTIVE" },
  })

  const vendorA = await makeVendor("a", countryA.id, vendorType.id)
  const vendorB = await makeVendor("b", countryB.id, vendorType.id)
  const o1 = await makeOutlet(vendorA.id, cityA1.id, zone.id, "Langata")
  const o2 = await makeOutlet(vendorA.id, cityA2.id, null, "Westlands")
  const oB = await makeOutlet(vendorB.id, cityB.id, null, "Kampala Road")

  clearOperatingCityCache()
  clearCurrencyCache()

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const READ = AdminPermissions.VENDORS_MEALS_READ
  const MOD  = AdminPermissions.VENDORS_MEALS_MODERATE
  const GLOBAL : AdminScopeContext = { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }
  const SCOPE_A: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" }
  const SCOPE_B: AdminScopeContext = { isGlobal: false, countryIds: [countryB.id], cityIds: [], tier: "COUNTRY" }
  // As buildScopeContext builds it: the city's country folded into countryIds.
  const CITY_A1: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [cityA1.id], tier: "CITY" }
  const L = "/api/admin/v1/vendors/meals/listings"
  const q = `search=${encodeURIComponent(MARKER)}&pageSize=100`

  try {
    // ════════════════════════════════════════════════════════════════════
    console.log("  ── 1. read-only listings\n")

    asVendor(vendorA.userId)
    const wingsRes = await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
      modifierGroups: [{
        name: `${MARKER} Dip`, description: null, minSelect: 0, maxSelect: 1,
        options: [{ name: "Ranch", priceDeltaMinor: 0 }, { name: "Blue cheese", priceDeltaMinor: 5000 }],
      }],
    })
    check("vendor created the dish", wingsRes.status === 201 || wingsRes.status === 200, wingsRes.json)
    // A control dish at o1, always sellable, so hiding the wings never hides
    // the OUTLET (an outlet with nothing to sell disappears on its own).
    await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Plain Chips`, basePriceMinor: 20000, outletIds: [o1.id],
    })
    asVendor(vendorB.userId)
    await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Rolex`, basePriceMinor: 300000, outletIds: [oB.id],
    })

    const wingsId = wingsRes.json.data.id as string
    const mealAt  = async (outletId: string) =>
      (await prisma.meal.findFirstOrThrow({ where: { menuItemId: wingsId, outletId }, select: { id: true } })).id
    const w1 = await mealAt(o1.id)
    const w2 = await mealAt(o2.id)
    const rolex = (await prisma.meal.findFirstOrThrow({ where: { outletId: oB.id }, select: { id: true } })).id

    // Permission gate
    asAdmin(admin.id, [], GLOBAL)
    check("no meals:read → list refused 403", (await call("GET", `${L}?${q}`)).status === 403)
    check("no meals:read → detail refused 403", (await call("GET", `${L}/${w1}`)).status === 403)

    // Scope through the outlet
    const ids = async (scope: AdminScopeContext, extra = "", base = q) => {
      asAdmin(admin.id, [READ], scope)
      const r = await call("GET", `${L}?${base}${extra}`)
      return { status: r.status, ids: ((r.json.data?.items ?? []) as Json[]).map((i) => i.id as string), data: r.json.data }
    }
    const g = await ids(GLOBAL)
    check("GLOBAL sees all four listings", [w1, w2, rolex].every((id) => g.ids.includes(id)) && g.ids.length === 4, g.ids)
    const a = await ids(SCOPE_A)
    check("COUNTRY A sees its country's listings, not B's", a.ids.includes(w1) && a.ids.includes(w2) && !a.ids.includes(rolex), a.ids)
    const c = await ids(CITY_A1)
    check("CITY A1 sees its city only — not the other city in its country",
      c.ids.includes(w1) && !c.ids.includes(w2) && !c.ids.includes(rolex), c.ids)
    check("counts follow the same scope (CITY A1: 2 current)", c.data?.counts?.current === 2, c.data?.counts)

    asAdmin(admin.id, [READ], CITY_A1)
    check("CITY A1 opening a listing in its own country's other city → 404",
      (await call("GET", `${L}/${w2}`)).status === 404)
    asAdmin(admin.id, [READ], SCOPE_B)
    check("COUNTRY B opening A's listing → 404, identical to missing",
      (await call("GET", `${L}/${w1}`)).json.code === (await call("GET", `${L}/00000000-0000-0000-0000-000000000000`)).json.code)
    check("a country filter outside scope → 404, never widens", (await call("GET", `${L}?country=${countryA.slug}`)).status === 404)

    // Detail shape
    asAdmin(admin.id, [READ], SCOPE_A)
    const d1 = (await call("GET", `${L}/${w1}`)).json.data as Json
    check("detail names outlet, vendor byline, city and country",
      d1.outlet.name === `${MARKER} Langata` && d1.vendor.displayName === `${MARKER} a Foods`
      && d1.outlet.cityName === cityA1.name && d1.country.name === countryA.name, d1)
    check("detail carries content: description, options, area name",
      d1.dish.description === "Twelve wings, glazed." && d1.dish.modifierGroups[0]?.options.length === 2
      && d1.outlet.areaName === "ZZ Listings Area")
    check("o1 uses the dish price", d1.listPriceMinor === 70000 && d1.priceSource === "dish")
    const d2 = (await call("GET", `${L}/${w2}`)).json.data as Json
    check("o2 uses its own price", d2.listPriceMinor === 75000 && d2.priceSource === "outlet")
    check("currency comes from the country (KES, 2 digits)", d1.currency.code === "KES" && d1.currency.minorUnitDigits === 2)
    check("clean listing: dish side sellable, no blockers", d1.dishSellable === true && d1.blockers.length === 0)
    check("dish outletCount is 2", d1.dish.outletCount === 2)

    // Filters, through the real controller mapper
    const mapped = listingFiltersFrom({ search: " x ", country: "ke", vendor: "v", outlet: "o", vendorState: "removed", junk: "1", adminStatus: "x" })
    check("controller mapper keeps every listing filter, trims, drops unknown keys",
      JSON.stringify(mapped) === JSON.stringify({ search: "x", countrySlug: "ke", vendorId: "v", outletId: "o", vendorState: "removed" }), mapped)
    check("controller mapper drops an unknown vendorState", listingFiltersFrom({ vendorState: "nope" }).vendorState === undefined)
    const byOutlet = await ids(SCOPE_A, `&outlet=${o2.id}`)
    check("outlet drill-down", byOutlet.ids.length === 1 && byOutlet.ids[0] === w2, byOutlet.ids)
    const byVendor = await ids(GLOBAL, `&vendor=${vendorB.id}`)
    check("vendor drill-down", byVendor.ids.length === 1 && byVendor.ids[0] === rolex, byVendor.ids)
    const byOutletName = await ids(GLOBAL, "", `pageSize=100&search=${encodeURIComponent("Kampala Road")}`)
    check("search matches the outlet name", byOutletName.ids.includes(rolex) && !byOutletName.ids.includes(w1))
    const byDisplay = await ids(GLOBAL, "", `pageSize=100&search=${encodeURIComponent(`${MARKER} b Foods`)}`)
    check("search matches the vendor's display name", byDisplay.ids.length === 1 && byDisplay.ids[0] === rolex, byDisplay.ids)
    const vendorScopedOutside = await ids(SCOPE_A, `&vendor=${vendorB.id}`)
    check("a vendor drill-down outside scope returns nothing", vendorScopedOutside.ids.length === 0)

    // Vendor state
    asVendor(vendorA.userId)
    await call("PATCH", `/api/vendor/v1/menu/meals/${w2}/availability`, { isAvailable: false })
    const off = await ids(SCOPE_A, "&vendorState=unavailable")
    check("vendorState=unavailable lists the 86'd listing only", off.ids.length === 1 && off.ids[0] === w2, off.ids)
    asAdmin(admin.id, [READ], SCOPE_A)
    const d2off = (await call("GET", `${L}/${w2}`)).json.data as Json
    check("an 86'd listing is still sellable on the dish side (shown greyed out)",
      d2off.isAvailable === false && d2off.dishSellable === true && d2off.blockers.length === 0)

    // Vendor removes o2 from the dish → listing removed, hidden from default
    asVendor(vendorA.userId)
    const putBack = await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id],
    })
    check("vendor removed o2 from the dish", putBack.status === 200, putBack.json)
    const current = await ids(SCOPE_A)
    check("default view hides a removed listing", !current.ids.includes(w2) && current.ids.includes(w1), current.ids)
    const removed = await ids(SCOPE_A, "&vendorState=removed")
    check("vendorState=removed shows it", removed.ids.length === 1 && removed.ids[0] === w2, removed.ids)
    const every = await ids(SCOPE_A, "&vendorState=all")
    check("vendorState=all shows both", every.ids.includes(w1) && every.ids.includes(w2))
    asAdmin(admin.id, [READ], SCOPE_A)
    const d2gone = (await call("GET", `${L}/${w2}`)).json.data as Json
    check("a removed listing still opens, with its blocker named",
      !!d2gone.removedAt && d2gone.blockers.includes("LISTING_REMOVED") && d2gone.dishSellable === false, d2gone.blockers)

    // Agreement: blockers empty ⇔ SELLABLE_MEAL_WHERE admits it, over every
    // state this smoke reaches (more are added in section 2).
    const agree = async (label: string) => {
      asAdmin(admin.id, [READ], GLOBAL)
      for (const id of [w1, w2, rolex]) {
        const d = (await call("GET", `${L}/${id}`)).json.data as Json
        const sellable = (await prisma.meal.count({ where: { id, ...SELLABLE_MEAL_WHERE } })) === 1
        check(`agreement (${label}) ${id.slice(0, 8)}: blockers empty ⇔ predicate`,
          (d.blockers.length === 0) === sellable && d.dishSellable === sellable, { blockers: d.blockers, sellable })
      }
    }
    await agree("read")

    // Reading never wrote anything.
    const dishRow = await prisma.menuItem.findUniqueOrThrow({ where: { id: wingsId }, select: { updatedAt: true } })
    asAdmin(admin.id, [READ], GLOBAL)
    await call("GET", `${L}/${w1}`)
    check("reads modify nothing",
      (await prisma.menuItem.findUniqueOrThrow({ where: { id: wingsId }, select: { updatedAt: true } })).updatedAt.getTime()
        === dishRow.updatedAt.getTime())

    // Put o2 back for section 2.
    asVendor(vendorA.userId)
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
    })
    check("re-adding o2 revives the SAME listing row",
      (await prisma.meal.findUniqueOrThrow({ where: { id: w2 }, select: { deletedAt: true } })).deletedAt === null)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. marketplace controls\n")

    const A = (mealId: string, action: string) => `${L}/${mealId}/${action}`
    const state = (id: string) => prisma.meal.findUniqueOrThrow({
      where : { id },
      select: { adminStatus: true, adminHiddenAt: true, isAvailable: true, priceMinorOverride: true, deletedAt: true },
    })
    const dishSnapshot = () => prisma.menuItem.findUniqueOrThrow({
      where : { id: wingsId },
      select: { name: true, description: true, basePriceMinor: true, adminStatus: true, reviewStatus: true, isArchived: true },
    })
    const notes = (type: string) => prisma.vendorNotification.count({ where: { vendorId: vendorA.id, type: type as never } })
    const wingsOnStorefront = async () => {
      const s = await getStorefront(o1.id, null, null).catch(() => null)
      return (s?.sections ?? []).flatMap((x) => x.items).find((i) => i.id === wingsId) ?? null
    }
    /** Every customer read path: storefront menu, meal page, cart — with the
     *  REASON the cart gives, so a pass can't come from an unrelated refusal. */
    const customerView = async () => {
      const item = await wingsOnStorefront()
      const detail = await getMealDetail(w1).then(() => "shown", (e) => (e as { code?: string }).code ?? "error")
      const cart = await priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: wingsId, quantity: 1, selectedOptionIds: [] }] })
      const problem = cart.problems.find((p) => p.menuItemId === wingsId)
      return { onMenu: !!item, item, detail, cartProblem: problem?.message ?? null }
    }
    const NOT_ON_MENU = "One of your items is no longer on the menu."

    const before = await customerView()
    check("baseline: wings visible on storefront, meal page and cart",
      before.onMenu && before.detail === "shown" && before.cartProblem === null, before)
    const dishBefore = await dishSnapshot()
    const w1Before   = await state(w1)

    // ── permission and scope
    asAdmin(admin.id, [READ], CITY_A1)
    const readOnly = await call("POST", A(w1, "hide"), { reasonCode: SMOKE_REASON })
    check("meals:read alone cannot hide (403)", readOnly.status === 403 && readOnly.json.code === "FORBIDDEN", readOnly.json)
    check("meals:read alone cannot suspend (403)",
      (await call("POST", A(w1, "suspend"), { reasonCode: SMOKE_REASON, internalNote: "x" })).status === 403)
    check("…and nothing changed", (await state(w1)).adminHiddenAt === null && (await state(w1)).adminStatus === "ACTIVE")
    asAdmin(admin.id, [READ, MOD], SCOPE_B)
    check("moderate but out of country scope → 404", (await call("POST", A(w1, "hide"), { reasonCode: SMOKE_REASON })).status === 404)
    asAdmin(admin.id, [READ, MOD], CITY_A1)
    check("city moderator, other city in the same country → 404", (await call("POST", A(w2, "hide"), { reasonCode: SMOKE_REASON })).status === 404)
    check("unknown action → 404", (await call("POST", A(w1, "ban"), { reasonCode: SMOKE_REASON, internalNote: "x" })).status === 404)

    // ── hide (city moderator, own city)
    asAdmin(admin.id, [READ, MOD], CITY_A1)
    let res: Awaited<ReturnType<typeof call>> | null = null
    const hidePurges = await purgesDuring(async () => {
      res = await call("POST", A(w1, "hide"), { reasonCode: SMOKE_REASON, internalNote: "Duplicate of another listing", expectedStatus: "ACTIVE", expectedHidden: false })
    })
    check("CITY moderator hides a listing in their city", res!.status === 200 && !!res!.json.data.adminHiddenAt, res!.json)
    check("hide purges the cached city feeds", hidePurges.includes("city-inventory"), hidePurges)
    const afterHide = await state(w1)
    check("hide leaves vendor availability, price and removal untouched",
      afterHide.isAvailable === w1Before.isAvailable && afterHide.priceMinorOverride === w1Before.priceMinorOverride
      && afterHide.deletedAt === null && afterHide.adminStatus === "ACTIVE")
    check("hide modifies no vendor-owned dish content", JSON.stringify(await dishSnapshot()) === JSON.stringify(dishBefore))
    const hiddenView = await customerView()
    check("hidden: off the storefront menu", !hiddenView.onMenu)
    check("hidden: meal page 404s as MEAL_NOT_FOUND", hiddenView.detail === "MEAL_NOT_FOUND", hiddenView.detail)
    check("hidden: the cart refuses it as no longer on the menu", hiddenView.cartProblem === NOT_ON_MENU, hiddenView.cartProblem)
    check("hiding notifies nobody", (await notes("MEAL_SUSPENDED")) === 0 && (await notes("MEAL_REINSTATED")) === 0)
    const hideAudit = await auditRows(w1, 1)
    check("hide audited as meal.hidden, by the admin, with reason and before/after",
      hideAudit[0]?.action === "meal.hidden" && hideAudit[0]?.adminUserId === admin.id
      && (hideAudit[0]?.metadata as Json)?.reason?.code === SMOKE_REASON
      && (hideAudit[0]?.metadata as Json)?.internalNote === "Duplicate of another listing"
      && (hideAudit[0]?.changes as Json)?.before?.hidden === false && (hideAudit[0]?.changes as Json)?.after?.hidden === true,
      hideAudit)
    await agree("hidden")

    asAdmin(admin.id, [READ, MOD], CITY_A1)
    const again = await purgesDuring(async () => { res = await call("POST", A(w1, "hide"), { reasonCode: SMOKE_REASON }) })
    check("hiding again is refused by name", res!.status === 400 && res!.json.code === "ALREADY_IN_STATE", res!.json)
    check("a refused action purges nothing", again.length === 0, again)
    const stale = await call("POST", A(w1, "unhide"), { expectedStatus: "ACTIVE", expectedHidden: false })
    check("an action on a stale view is refused (STATUS_CHANGED)", stale.status === 409 && stale.json.code === "STATUS_CHANGED", stale.json)

    // ── the vendor cannot lift it
    asVendor(vendorA.userId)
    await call("PATCH", `/api/vendor/v1/menu/meals/${w1}/availability`, { isAvailable: false })
    await call("PATCH", `/api/vendor/v1/menu/meals/${w1}/availability`, { isAvailable: true })
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
    })
    check("toggling availability and re-saving the dish does not lift a hide", (await state(w1)).adminHiddenAt !== null)

    // ── suspend (country moderator)
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    const noReason = await call("POST", A(w1, "suspend"), {})
    check("suspend without a reason is refused", noReason.status === 400 && noReason.json.code === "REASON_REQUIRED", noReason.json)
    const legacy = await call("POST", A(w1, "suspend"), { reason: "free text" })
    check("the pre-2.1 free-text reason field is refused, not ignored",
      legacy.status === 400 && legacy.json.code === "UNSUPPORTED_FIELD", legacy.json)
    res = await call("POST", A(w1, "suspend"), { reasonCode: SMOKE_REASON, internalNote: "Customer reports of raw chicken", expectedStatus: "ACTIVE", expectedHidden: true })
    check("suspend a hidden listing (independent controls)", res.status === 200 && res.json.data.adminStatus === "SUSPENDED", res.json)
    check("suspension notifies the vendor once", (await notes("MEAL_SUSPENDED")) === 1)
    const note = await prisma.vendorNotification.findFirst({ where: { vendorId: vendorA.id, type: "MEAL_SUSPENDED" } })
    check("the notice names the outlet and does NOT carry the admin's reason",
      !!note && note.title.includes("Langata") && !note.message.includes("raw chicken") && !note.title.includes("raw chicken"), note)

    res = await call("POST", A(w1, "unhide"), { expectedStatus: "SUSPENDED", expectedHidden: true })
    check("restoring visibility leaves the suspension in place",
      res.status === 200 && res.json.data.adminHiddenAt === null && res.json.data.adminStatus === "SUSPENDED", res.json)
    const susView = await customerView()
    check("suspended (not hidden): still off every customer path",
      !susView.onMenu && susView.detail === "MEAL_NOT_FOUND" && susView.cartProblem === NOT_ON_MENU, susView)
    const dSus = (await call("GET", `${L}/${w1}`)).json.data as Json
    check("detail names exactly the suspension", JSON.stringify(dSus.blockers) === JSON.stringify(["LISTING_SUSPENDED"]), dSus.blockers)
    await agree("suspended")

    asVendor(vendorA.userId)
    await call("PATCH", `/api/vendor/v1/menu/meals/${w1}/availability`, { isAvailable: true })
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
    })
    check("the vendor cannot lift a suspension by editing", (await state(w1)).adminStatus === "SUSPENDED")
    check("a listing suspension never touches the DISH's own status", (await dishSnapshot()).adminStatus === "ACTIVE")

    // ── filters and counts
    const susList = await ids(SCOPE_A, "&control=suspended")
    check("control=suspended lists it", susList.ids.length === 1 && susList.ids[0] === w1, susList.ids)
    check("counts.suspended follows scope", susList.data.counts.suspended === 1 && susList.data.counts.hidden === 0, susList.data.counts)
    const noneList = await ids(SCOPE_A, "&control=none")
    check("control=none excludes it", !noneList.ids.includes(w1) && noneList.ids.includes(w2), noneList.ids)

    // ── reinstate
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    const reinstatePurges = await purgesDuring(async () => {
      res = await call("POST", A(w1, "reinstate"), { expectedStatus: "SUSPENDED", expectedHidden: false })
    })
    check("reinstate lifts the suspension", res!.status === 200 && res!.json.data.adminStatus === "ACTIVE", res!.json)
    check("reinstate purges the city feeds", reinstatePurges.includes("city-inventory"))
    check("reinstatement notifies the vendor", (await notes("MEAL_REINSTATED")) === 1)
    const back = await customerView()
    check("reinstated: back on storefront, meal page and cart",
      back.onMenu && back.detail === "shown" && back.cartProblem === null, back)
    check("reinstate again is refused", (await call("POST", A(w1, "reinstate"), {})).json.code === "INVALID_STATUS_TRANSITION")

    // ── vendor availability stays the vendor's
    asVendor(vendorA.userId)
    await call("PATCH", `/api/vendor/v1/menu/meals/${w1}/availability`, { isAvailable: false })
    const offView = await customerView()
    check("vendor Off + platform visible: shown greyed out, cart says sold out",
      offView.onMenu && offView.item?.isAvailable === false && offView.cartProblem?.includes("sold out") === true, offView)
    await call("PATCH", `/api/vendor/v1/menu/meals/${w1}/availability`, { isAvailable: true })

    // ── removed listings
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id],
    })
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    check("a removed listing cannot be hidden", (await call("POST", A(w2, "hide"), { reasonCode: SMOKE_REASON })).json.code === "LISTING_REMOVED")
    // Suspend while live, remove, re-add: the control survives the round trip.
    asVendor(vendorA.userId)
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
    })
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    await call("POST", A(w2, "suspend"), { reasonCode: SMOKE_REASON, internalNote: "Investigating" })
    asVendor(vendorA.userId)
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id],
    })
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    res = await call("POST", A(w2, "reinstate"), {})
    check("a suspension can be lifted even while the listing is removed", res.status === 200, res.json)
    await call("POST", A(w2, "suspend"), { reasonCode: SMOKE_REASON, internalNote: "x" }).then((r) =>
      check("…but not re-imposed on a removed listing", r.json.code === "LISTING_REMOVED", r.json))
    asVendor(vendorA.userId)
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 75000 },
    })
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    await call("POST", A(w2, "hide"), { reasonCode: SMOKE_REASON })
    asVendor(vendorA.userId)
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id],
    })
    await call("PUT", `/api/vendor/v1/menu/items/${wingsId}`, {
      name: `${MARKER} Crispy Honey Garlic Wings`, description: "Twelve wings, glazed.", basePriceMinor: 70000,
      outletIds: [o1.id, o2.id],
    })
    check("removing and re-adding an outlet does not lift a hide", (await state(w2)).adminHiddenAt !== null)
    await agree("removed / re-added")

    // ── the history is the audit trail
    asAdmin(admin.id, [READ], SCOPE_A)
    await auditRows(w1, 4)
    const hist = ((await call("GET", `${L}/${w1}`)).json.data as Json).controlHistory as Json[]
    check("detail history lists every control, newest first, with reasons",
      JSON.stringify(hist.map((h) => h.action)) === JSON.stringify(["meal.reinstated", "meal.unhidden", "meal.suspended", "meal.hidden"])
      && hist.find((h) => h.action === "meal.suspended")?.reason?.internalNote === "Customer reports of raw chicken"
      && hist.find((h) => h.action === "meal.suspended")?.reason?.label === "Smoke reason", hist)

    // ── global moderator, other vendor's listing
    asAdmin(admin.id, [READ, MOD], GLOBAL)
    check("GLOBAL moderator can act anywhere", (await call("POST", A(rolex, "hide"), { reasonCode: SMOKE_REASON })).status === 200)
    check("…and it touches only that listing", (await state(w1)).adminHiddenAt === null)
    await agree("final")

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. dish-wide actions need country authority\n")

    // A dish sold ONLY in city A2 — invisible to a city-A1 admin.
    asVendor(vendorA.userId)
    const westRes = await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Westlands Special`, basePriceMinor: 50000, outletIds: [o2.id],
    })
    const westId = westRes.json.data.id as string
    const D = "/api/admin/v1/vendors/meals"

    asAdmin(admin.id, [READ, MOD], CITY_A1)
    const cityDishes = await call("GET", `${D}?search=${encodeURIComponent(MARKER)}&pageSize=100`)
    const cityDishIds = ((cityDishes.json.data?.items ?? []) as Json[]).map((i) => i.id as string)
    check("CITY admin's dish list holds dishes sold in their city", cityDishIds.includes(wingsId), cityDishIds)
    check("…and not a dish sold only in another city of their country", !cityDishIds.includes(westId), cityDishIds)
    const cityOutletDrill = await call("GET", `${D}?outlet=${o2.id}&pageSize=100`)
    // o2 sells both the shared wings (in scope through o1) and the A2-only
    // dish. Were the drill-down to overwrite the scope's own `outletMeals`
    // clause, the A2-only dish would appear here.
    const drillIds = ((cityOutletDrill.json.data?.items ?? []) as Json[]).map((i) => i.id as string)
    check("an outlet drill-down cannot widen a CITY admin's dish scope (no key overwrite)",
      drillIds.includes(wingsId) && !drillIds.includes(westId), drillIds)
    check("CITY admin opening the other city's dish → 404", (await call("GET", `${D}/${westId}`)).status === 404)

    const cityDetail = (await call("GET", `${D}/${wingsId}`)).json.data as Json
    check("CITY admin reads a shared dish, scoped to their own outlet rows",
      cityDetail.outlets.length === 1 && cityDetail.outlets[0].outletId === o1.id
      && cityDetail.outletCount === 2 && cityDetail.outsideScopeOutletCount === 1, cityDetail.outlets)
    check("…and is told they cannot act dish-wide", cityDetail.canActDishWide === false)

    const dishBeforeCity = await dishSnapshot()
    for (const [label, path, body] of [
      ["suspend", `${D}/${wingsId}/status`, { status: "SUSPENDED", reasonCode: SMOKE_REASON, internalNote: "x", expectedStatus: "ACTIVE" }],
      ["ban", `${D}/${wingsId}/status`, { status: "BANNED", reasonCode: SMOKE_REASON, internalNote: "x", expectedStatus: "ACTIVE" }],
      ["send back", `${D}/${wingsId}/send-back`, { reasonCode: SMOKE_REASON }],
      ["approve", `${D}/${wingsId}/approve`, {}],
      ["approve a group", `${D}/modifier-groups/${d1.dish.modifierGroups[0].id}/approve`, {}],
      ["send back a group", `${D}/modifier-groups/${d1.dish.modifierGroups[0].id}/send-back`, { reasonCode: SMOKE_REASON }],
    ] as const) {
      const r = await call("POST", path, body)
      check(`CITY admin cannot ${label} dish-wide (403, by name)`,
        r.status === 403 && r.json.code === "DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE", r.json)
    }
    check("…and the dish is unchanged", JSON.stringify(await dishSnapshot()) === JSON.stringify(dishBeforeCity))

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    const countryDetail = (await call("GET", `${D}/${wingsId}`)).json.data as Json
    check("COUNTRY admin sees every outlet row and may act dish-wide",
      countryDetail.outlets.length === 2 && countryDetail.outsideScopeOutletCount === 0 && countryDetail.canActDishWide === true)
    const sus = await call("POST", `${D}/${wingsId}/status`, { status: "SUSPENDED", reasonCode: SMOKE_REASON, internalNote: "Recall", expectedStatus: "ACTIVE" })
    check("COUNTRY admin suspends the dish", sus.status === 200, sus.json)
    const sellableCount = await prisma.meal.count({ where: { id: { in: [w1, w2] }, ...SELLABLE_MEAL_WHERE } })
    check("a dish-wide suspension takes down every listing of it", sellableCount === 0)
    check("…while each listing's OWN state is untouched", (await state(w1)).adminStatus === "ACTIVE")
    await call("POST", `${D}/${wingsId}/status`, { status: "ACTIVE", expectedStatus: "SUSPENDED" })
    check("lifting it restores the listing", (await prisma.meal.count({ where: { id: w1, ...SELLABLE_MEAL_WHERE } })) === 1)
  } finally {
    server.close()
    await sweep()
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

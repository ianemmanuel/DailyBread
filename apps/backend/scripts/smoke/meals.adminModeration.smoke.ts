/*
 * Smoke test — ERP meal moderation (Phase 9), against the DEV DATABASE.
 *
 * What meals.smoke.ts does not reach:
 *
 *   1. option-group moderation — a shared group flagged by real screening,
 *      approved and sent back by an admin, and every dish using it following
 *      (automatic statuses, a manual approval, a manual send-back, and a
 *      send-back about the dish's own words that a group change must NOT move)
 *   2. the operational transition matrix — suspend / reinstate / ban / unban,
 *      the refused moves, the stale-view guard, notifications and audit verbs
 *   3. the currency-aware export, the deleted-vendor lookup, the new list
 *      filters and the sidebar-dot read
 *
 * Driven over real HTTP through the REAL application routers, with only the
 * identity middleware replaced — the same harness as meals.smoke.ts. Builds its
 * own throwaway countries, city, zone, vendors and outlets, cleans up after
 * itself and sweeps strays from an aborted earlier run first. Needs no R2.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/meals.adminModeration.smoke.ts
 */
import express from "express"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import { AdminPermissions } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import vendorRoutes from "@/modules/vendor/routes"
import adminV1Router from "@/modules/admin/routes/v1"
import { errorHandler } from "@/middleware/error"
import { getStorefront, getMealDetail } from "@/modules/customer/services/customer.storefront.service"
import { priceCustomerCart } from "@/modules/customer/services/customer.cart.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"
import { clearCurrencyCache } from "@/modules/finance"
import { hasFlaggedMealsForCountries } from "@/modules/meals"

const MARKER = "zz-smoke-mealmod"
const TZ     = "Pacific/Kiritimati"
const POINT  = { latitude: -19.5, longitude: -149.75 }
const square = (w: number, e: number) => ({
  type       : "Polygon",
  coordinates: [[[w, -20], [e, -20], [e, -19], [w, -19], [w, -20]]],
})

// ─── Reporting ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}

// ─── HTTP harness ────────────────────────────────────────────────────────────

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

/* The backend tells the storefront to purge a cache tag over HTTP
 * (revalidateStorefront). Those calls are intercepted here — recorded, and
 * answered 200 — so the smoke can assert WHICH moderation actions purge the
 * cached city feeds without needing a storefront running. */
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
/** Purges recorded while `act` runs (revalidateStorefront is fire-and-forget,
 *  so give it a moment to be issued). */
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
  try { json = text ? JSON.parse(text) : {} } catch { /* CSV */ }
  return { status: res.status, json, text }
}

const asVendor = (userId: string) => { vendorCtx = { userId } }
const asAdmin  = (id: string, permissions: string[], scope: AdminScopeContext) => {
  adminCtx = { adminUser: { id }, adminPermissions: permissions, adminScope: scope }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

async function sweep() {
  const vendors = await prisma.vendorAccount.findMany({
    where : { businessEmail: { startsWith: MARKER } },
    select: { id: true },
  })
  const vendorIds = vendors.map((v) => v.id)
  const [items, groups] = await Promise.all([
    prisma.menuItem.findMany({ where: { vendorId: { in: vendorIds } }, select: { id: true } }),
    prisma.modifierGroup.findMany({ where: { vendorId: { in: vendorIds } }, select: { id: true } }),
  ])
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...items, ...groups].map((r) => r.id) }, entityType: { in: ["MenuItem", "ModifierGroup"] } },
  })
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
      legalBusinessName: `${MARKER} ${tag}`, businessEmail: email,
      businessPhone: `+998${tag === "a" ? "1" : "2"}000000`,
      ownerFirstName: "Smoke", ownerLastName: tag.toUpperCase(), businessAddress: "1 Test Road",
      status: "ACTIVE",
      vendorProfile: { create: { displayName: `${MARKER} ${tag}`, isPublished: true, reviewStatus: "AUTO_APPROVED" } },
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

/** Polls the audit log: auditService.log is fire-and-forget (see meals.smoke.ts). */
async function auditActions(entityId: string, atLeast: number) {
  const read = () => prisma.auditLog.findMany({ where: { entityId }, select: { action: true, adminUserId: true } })
  let rows = await read()
  for (let i = 0; i < 30 && rows.length < atLeast; i++) {
    await new Promise((r) => setTimeout(r, 100))
    rows = await read()
  }
  return rows
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n── meal admin moderation smoke ─────────────────────────────\n")
  await sweep()

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  const admin      = await prisma.adminUser.findFirst({ select: { id: true } })
  const hotFood    = await prisma.taxCategory.findFirst({ where: { code: "HOT_PREPARED_FOOD" }, select: { id: true } })
  if (!vendorType || !admin || !hotFood) {
    console.error("  SKIPPED — needs an active vendor type, an admin user and the HOT_PREPARED_FOOD tax category")
    return
  }

  const countryA = await prisma.country.create({
    data: {
      name: "ZZ MealMod A", code: "ZZXA", slug: `${MARKER}-a`, currency: "UGX", currencyCode: "UGX",
      phoneCode: "+99971", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
      taxConfig: { create: { pricesIncludeTax: true, taxName: "VAT" } },
      taxRates : { create: { taxCategoryId: hotFood.id, rateBps: 1600, isStandard: true } },
    },
  })
  const countryB = await prisma.country.create({
    data: {
      name: "ZZ MealMod B", code: "ZZXB", slug: `${MARKER}-b`, currency: "KES", currencyCode: "KES",
      phoneCode: "+99972", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const cityA = await prisma.city.create({
    data: {
      countryId: countryA.id, name: "ZZ MealMod City", slug: `${MARKER}-city`, timezone: TZ, status: "ACTIVE",
      boundary: square(-150, -149), boundingBox: { north: -19, south: -20, east: -149, west: -150 },
      latitude: POINT.latitude, longitude: POINT.longitude,
    },
  })
  const cityB = await prisma.city.create({
    data: {
      countryId: countryB.id, name: "ZZ MealMod City B", slug: `${MARKER}-city-b`, timezone: TZ, status: "ACTIVE",
      latitude: 0, longitude: 0,
    },
  })
  const zone = await prisma.zone.create({
    data: { cityId: cityA.id, name: "ZZ-MEALMOD", publicName: "ZZ Mod", boundaries: square(-150, -149), level: "MARKETPLACE", status: "ACTIVE" },
  })

  const vendorA = await makeVendor("a", countryA.id, vendorType.id)
  const vendorB = await makeVendor("b", countryB.id, vendorType.id)
  const o1 = await makeOutlet(vendorA.id, cityA.id, zone.id, "Outlet One")
  const oB = await makeOutlet(vendorB.id, cityB.id, null, "Outlet B")

  clearOperatingCityCache()
  clearCurrencyCache()

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const READ = AdminPermissions.VENDORS_MEALS_READ
  const MOD  = AdminPermissions.VENDORS_MEALS_MODERATE
  const SCOPE_A: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" }
  const SCOPE_B: AdminScopeContext = { isGlobal: false, countryIds: [countryB.id], cityIds: [], tier: "COUNTRY" }
  const GLOBAL : AdminScopeContext = { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }
  const M = "/api/admin/v1/vendors/meals"
  const G = "/api/vendor/v1/menu/modifier-groups"

  const review = async (id: string) =>
    (await prisma.menuItem.findUniqueOrThrow({ where: { id }, select: { reviewStatus: true, flagReasons: true } }))
  const onStorefront = async (id: string) => {
    const s = await getStorefront(o1.id, null, null).catch(() => null)
    return (s?.sections ?? []).flatMap((x) => x.items).find((i) => i.id === id) ?? null
  }
  /** Every customer read path must agree a dish is hidden: the storefront
   *  menu, the canonical meal page, and the cart. */
  const hiddenEverywhere = async (itemId: string) => {
    const meal = await prisma.meal.findFirstOrThrow({ where: { menuItemId: itemId, outletId: o1.id }, select: { id: true } })
    const detailHidden = await getMealDetail(meal.id).then(() => false, (e) => (e as { code?: string }).code === "MEAL_NOT_FOUND")
    const cart = await priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: itemId, quantity: 1, selectedOptionIds: [] }] })
    const cartRefused = cart.problems.some((p) => p.code === "ITEM_UNAVAILABLE" && p.menuItemId === itemId)
    const outletVisible = (await getStorefront(o1.id, null, null).catch(() => null)) !== null
    return { outletVisible, storefront: !(await onStorefront(itemId)), detailHidden, cartRefused }
  }
  /** The invariant every customer path relies on (the cart does NOT filter
   *  groups by status): no customer-visible dish has a blocking group. */
  const invariant = async (label: string) => {
    const bad = await prisma.menuItem.findMany({
      where: {
        vendorId: vendorA.id, deletedAt: null,
        reviewStatus: { in: ["AUTO_APPROVED", "MANUALLY_APPROVED"] },
        modifierGroups: { some: { group: { deletedAt: null, reviewStatus: { in: ["FLAGGED", "MANUALLY_REJECTED"] } } } },
      },
      select: { name: true, reviewStatus: true },
    })
    check(`invariant (${label}): no visible dish carries a blocking group`, bad.length === 0, bad)
  }
  const noteCount = (type: string) => prisma.vendorNotification.count({ where: { vendorId: vendorA.id, type: type as never } })

  try {
    // ════════════════════════════════════════════════════════════════════
    console.log("  ── 1. a shared option group\n")

    asVendor(vendorA.userId)
    const groupBody = (optionName: string) => ({
      name: `${MARKER} Sauces`, description: "Pick one", minSelect: 1, maxSelect: 1,
      options: [{ name: optionName, priceDeltaMinor: 0 }, { name: "Garlic", priceDeltaMinor: 500 }],
    })
    const group = (await call("POST", G, groupBody("Mild"))).json.data as Json
    /** Renames the first option IN PLACE (by id), as the dashboard does — the
     *  vendor's edit that re-screens the group. */
    const editGroup = async (optionName: string) => {
      const [first, second] = (await call("GET", `${G}/${group.id}`)).json.data.options as Json[]
      return call("PUT", `${G}/${group.id}`, {
        ...groupBody(optionName),
        options: [
          { id: first!.id, name: optionName, priceDeltaMinor: 0 },
          { id: second!.id, name: "Garlic", priceDeltaMinor: 500 },
        ],
      })
    }
    check("a clean group is auto-approved", group?.reviewStatus === "AUTO_APPROVED", group)

    const dish = async (name: string) => (await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} ${name}`, basePriceMinor: 10000, outletIds: [o1.id], modifierGroupIds: [group.id],
    })).json.data.id as string
    const d1 = await dish("Plate One")
    const d2 = await dish("Plate Two")
    const d3 = await dish("Plate Three")
    /* A control dish with no options, always sellable. Without it, blocking
     * every dish at the outlet hides the OUTLET (it has nothing to sell), and
     * every "dish is hidden" check below would pass for the wrong reason. */
    await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Plain Plate`, basePriceMinor: 5000, outletIds: [o1.id],
    })

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    check("a dish approved by an admin before anything is flagged",
      (await call("POST", `${M}/${d3}/approve`)).json.data?.reviewStatus === "MANUALLY_APPROVED")

    // Real screening — the group's OPTION wording is what trips the check.
    asVendor(vendorA.userId)
    const flaggedEdit = await editGroup("Shit sauce")
    check("vendor wording that fails screening flags the group", flaggedEdit.json.data?.reviewStatus === "FLAGGED", flaggedEdit.json.data)
    {
      const [r1, r2, r3] = await Promise.all([review(d1), review(d2), review(d3)])
      check("…and every dish sharing it is flagged with the modifier reason",
        [r1, r2].every((r) => r.reviewStatus === "FLAGGED" && r.flagReasons.includes("INAPPROPRIATE_MODIFIER")), { r1, r2 })
      check("…including the one an admin had approved (new content re-opens it)",
        r3.reviewStatus === "FLAGGED" && r3.flagReasons.includes("INAPPROPRIATE_MODIFIER"), r3)
      for (const [name, id] of [["auto", d1], ["previously approved", d3]] as const) {
        const h = await hiddenEverywhere(id)
        check(`…the ${name} dish is hidden on the storefront, the meal page and the cart`,
          h.outletVisible && h.storefront && h.detailHidden && h.cartRefused, h)
      }
      await invariant("group flagged")
      check("the sidebar-dot read sees flagged meals in A", await hasFlaggedMealsForCountries([countryA.id]))
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. authorization on the group actions\n")

    asAdmin(admin.id, [], SCOPE_A)
    {
      const r = await call("POST", `${M}/modifier-groups/${group.id}/approve`)
      check("no meals permission → 403 at the route", r.status === 403 && r.json.code === "FORBIDDEN", r.json)
    }
    asAdmin(admin.id, [READ], SCOPE_A)
    {
      const r = await call("POST", `${M}/modifier-groups/${group.id}/approve`)
      check("read-only cannot moderate a group → 403", r.status === 403 && r.json.code === "FORBIDDEN", r.json)
    }
    asAdmin(admin.id, [READ, MOD], SCOPE_B)
    {
      const a = await call("POST", `${M}/modifier-groups/${group.id}/approve`)
      check("out-of-scope group APPROVE is a 404, never a 403", a.status === 404 && a.json.code === "NOT_FOUND", a.json)
      const s = await call("POST", `${M}/modifier-groups/${group.id}/send-back`, { reason: "x" })
      check("out-of-scope group SEND-BACK is a 404", s.status === 404 && s.json.code === "NOT_FOUND", s.json)
      check("…and changed nothing",
        (await prisma.modifierGroup.findUniqueOrThrow({ where: { id: group.id } })).reviewStatus === "FLAGGED")
    }
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const r = await call("POST", `${M}/modifier-groups/00000000-0000-0000-0000-000000000000/approve`)
      check("an unknown group is a 404", r.status === 404 && r.json.code === "NOT_FOUND", r.json)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. dish ↔ group interaction\n")

    {
      const r = await call("POST", `${M}/${d1}/approve`)
      check("a dish cannot be approved while its group blocks it",
        r.status === 409 && r.json.code === "MODIFIER_GROUP_UNRESOLVED" && String(r.json.message).includes("Sauces"), r.json)

      const detail = (await call("GET", `${M}/${d1}`)).json.data as Json
      const g = (detail.modifierGroups as Json[])[0]!
      check("the dish detail shows the group's own verdict",
        g.reviewStatus === "FLAGGED" && g.blocksDish === true && g.usedByCount === 3, g)

      const noReason = await call("POST", `${M}/modifier-groups/${group.id}/send-back`, {})
      check("group send-back without a reason is refused", noReason.status === 400 && noReason.json.code === "REASON_REQUIRED", noReason.json)

      const before = await noteCount("MEAL_OPTIONS_REJECTED")
      const sb = await call("POST", `${M}/modifier-groups/${group.id}/send-back`, { reason: "Rename the first sauce." })
      check("group send-back → MANUALLY_REJECTED with the reason",
        sb.status === 200 && sb.json.data?.reviewStatus === "MANUALLY_REJECTED" && sb.json.data?.rejectionReason === "Rename the first sauce.", sb.json)
      const note = await prisma.vendorNotification.findFirst({
        where  : { vendorId: vendorA.id, type: "MEAL_OPTIONS_REJECTED" },
        orderBy: { createdAt: "desc" },
      })
      check("…the vendor is told, with the reason and the meals it holds back",
        (await noteCount("MEAL_OPTIONS_REJECTED")) === before + 1 &&
        !!note?.message.includes("Rename the first sauce.") && !!note?.message.includes("3 meals"), note)
      const h2 = await hiddenEverywhere(d2)
      check("…a sent-back group still blocks its dishes, on every customer path",
        (await review(d2)).reviewStatus === "FLAGGED" && h2.outletVisible && h2.storefront && h2.detailHidden && h2.cartRefused, h2)
      await invariant("group sent back")

      // The OLD way to act on a modifier flag: send the dish back.
      const dsb = await call("POST", `${M}/${d1}/send-back`, { reason: "Fix the sauce names." })
      check("a dish can still be sent back over its options", dsb.json.data?.reviewStatus === "MANUALLY_REJECTED", dsb.json)
    }

    // The vendor fixes the GROUP, never touching any dish's own text.
    asVendor(vendorA.userId)
    {
      const fixed = await editGroup("Mild")
      check("the vendor's edit re-screens the group clean (send-back cleared)",
        fixed.json.data?.reviewStatus === "AUTO_APPROVED" && fixed.json.data?.rejectionReason === null, fixed.json.data)
      const [r1, r2, r3] = await Promise.all([review(d1), review(d2), review(d3)])
      check("a dish sent back over its options returns to the QUEUE, not straight to approved",
        r1.reviewStatus === "FLAGGED" && !r1.flagReasons.includes("INAPPROPRIATE_MODIFIER"), r1)
      check("automatic dishes clear on their own", r2.reviewStatus === "AUTO_APPROVED" && r3.reviewStatus === "AUTO_APPROVED", { r2, r3 })
      check("…and are back on the storefront with the group", (await onStorefront(d2))?.modifierGroups[0]?.id === group.id)
      check("…while the re-queued one stays hidden until an admin looks", !(await onStorefront(d1)))
      await invariant("group fixed by the vendor")
    }

    /* The re-queued dish is waiting for an ADMIN. No later group event may
     * clear it on its own: not the vendor editing the group again, and not an
     * admin approving the group from another dish's page. */
    await editGroup("Mellow")
    check("a re-queued dish stays in the queue when the vendor edits the group again",
      (await review(d1)).reviewStatus === "FLAGGED")
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    await call("POST", `${M}/modifier-groups/${group.id}/approve`)
    check("…and when an admin approves a group it shares",
      (await review(d1)).reviewStatus === "FLAGGED" && !(await onStorefront(d1)))
    check("…while its siblings are unaffected", (await review(d2)).reviewStatus === "AUTO_APPROVED")
    await invariant("re-queued dish, group approved")

    check("the re-queued dish can now be approved", (await call("POST", `${M}/${d1}/approve`)).json.data?.reviewStatus === "MANUALLY_APPROVED")

    // Flag it again, then resolve it from the GROUP side.
    asVendor(vendorA.userId)
    await editGroup("Shit sauce")
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    /* d3 is sent back over its options, and the vendor's next edit is STILL
     * flagged: d3 re-queues carrying the modifier reason. The admin then
     * approves the group from elsewhere — that clears the modifier reason, and
     * must NOT clear d3, which an admin sent back and nobody has looked at. */
    await call("POST", `${M}/${d3}/send-back`, { reason: "Check the sauces." })
    asVendor(vendorA.userId)
    await editGroup("Shit sauces")
    check("a dish sent back over its options re-queues when the vendor re-edits, even if still flagged",
      (await review(d3)).reviewStatus === "FLAGGED")
    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const before = await noteCount("MEAL_OPTIONS_APPROVED")
      const ap = await call("POST", `${M}/modifier-groups/${group.id}/approve`)
      check("group approve → MANUALLY_APPROVED", ap.status === 200 && ap.json.data?.reviewStatus === "MANUALLY_APPROVED", ap.json)
      check("…the vendor is notified", (await noteCount("MEAL_OPTIONS_APPROVED")) === before + 1)
      const [r1, r2, r3] = await Promise.all([review(d1), review(d2), review(d3)])
      check("…dishes it held back by screening alone clear in the same write",
        [r1, r2].every((r) => r.reviewStatus === "AUTO_APPROVED" && r.flagReasons.length === 0), { r1, r2 })
      check("…but a re-queued, sent-back dish stays in the queue for an admin (modifier reason dropped)",
        r3.reviewStatus === "FLAGGED" && r3.flagReasons.length === 0 && !(await onStorefront(d3)), r3)
      check("…an admin-approved group is shown to customers", (await onStorefront(d2))?.modifierGroups[0]?.id === group.id)
      await invariant("group approved")
      const again = await call("POST", `${M}/modifier-groups/${group.id}/approve`)
      check("approving it twice is refused", again.status === 400 && again.json.code === "ALREADY_APPROVED", again.json)

      // A send-back about the dish's OWN words is not moved by a group change.
      await prisma.menuItem.update({ where: { id: d2 }, data: { flagReasons: ["INAPPROPRIATE_NAME"], reviewStatus: "FLAGGED" } })
      await call("POST", `${M}/${d2}/send-back`, { reason: "Rename the dish." })
    }
    asVendor(vendorA.userId)
    await editGroup("Hot")
    check("a dish sent back for its own words stays sent back when a group is edited",
      (await review(d2)).reviewStatus === "MANUALLY_REJECTED")
    await invariant("unrelated send-back")

    {
      const rows = await auditActions(group.id, 2)
      const names = rows.map((r) => r.action)
      check("group verdicts are audited", names.includes("modifier_group.approved") && names.includes("modifier_group.sent_back"), names)
      check("…attributed to the acting admin", rows.every((r) => r.adminUserId === admin.id))
    }

    console.log("\n  ── 3b. read-side guard and cache purge (Phase 10)\n")

    /* A row written BEFORE Phase 9: a dish an admin approved while its group
     * was flagged. Planted directly, bypassing the moderation rules, because
     * those rules can no longer produce it. The read-side guard in
     * SELLABLE_MENU_ITEM_WHERE must still keep it off every customer path. */
    {
      asVendor(vendorA.userId)
      const legacyGroup = (await call("POST", G, {
        name: `${MARKER} Legacy Sides`, minSelect: 1, maxSelect: 1,
        options: [{ name: "Rice", priceDeltaMinor: 0 }, { name: "Chips", priceDeltaMinor: 0 }],
      })).json.data as Json
      const legacy = (await call("POST", "/api/vendor/v1/menu/items", {
        name: `${MARKER} Legacy Plate`, basePriceMinor: 7000, outletIds: [o1.id], modifierGroupIds: [legacyGroup.id],
      })).json.data.id as string
      check("control: the legacy dish is on sale before the bad state is planted", !!(await onStorefront(legacy)))

      await prisma.modifierGroup.update({ where: { id: legacyGroup.id }, data: { reviewStatus: "FLAGGED" } })
      await prisma.menuItem.update({ where: { id: legacy }, data: { reviewStatus: "MANUALLY_APPROVED", flagReasons: [] } })
      const h = await hiddenEverywhere(legacy)
      check("a pre-Phase-9 approved dish over a flagged group is hidden on the storefront, the meal page and the cart",
        h.outletVisible && h.storefront && h.detailHidden && h.cartRefused, h)

      await prisma.modifierGroup.update({ where: { id: legacyGroup.id }, data: { reviewStatus: "AUTO_APPROVED" } })
      check("…and returns once the group is cleared", !!(await onStorefront(legacy)))
      asVendor(vendorA.userId)
      await call("DELETE", `/api/vendor/v1/menu/items/${legacy}`)
      await call("DELETE", `${G}/${legacyGroup.id}`)
    }

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const sent = await purgesDuring(() => call("POST", `${M}/${d1}/send-back`, { reason: "Recheck." }))
      check("a dish moderation action purges the cached city feeds", sent.includes("city-inventory"), sent)
      const appr = await purgesDuring(() => call("POST", `${M}/${d1}/approve`))
      check("…approve purges too", appr.includes("city-inventory"), appr)
      const grp  = await purgesDuring(() => call("POST", `${M}/modifier-groups/${group.id}/send-back`, { reason: "Again." }))
      check("…and so does a group verdict", grp.includes("city-inventory"), grp)
      await purgesDuring(() => call("POST", `${M}/modifier-groups/${group.id}/approve`))
      const refused = await purgesDuring(() => call("POST", `${M}/modifier-groups/${group.id}/approve`))
      check("a REFUSED action purges nothing", refused.length === 0, refused)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 4. operational status: the transition matrix\n")

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const S = `${M}/${d3}/status`
      const n = { s: await noteCount("MEAL_SUSPENDED"), b: await noteCount("MEAL_BANNED"), r: await noteCount("MEAL_REINSTATED") }

      const sus = await call("POST", S, { status: "SUSPENDED", reason: "Health complaint", expectedStatus: "ACTIVE" })
      check("suspend ACTIVE → SUSPENDED", sus.json.data?.adminStatus === "SUSPENDED" && sus.json.data?.adminSuspendedAt !== null, sus.json)
      check("…vendor notified (MEAL_SUSPENDED), without the internal reason",
        (await noteCount("MEAL_SUSPENDED")) === n.s + 1 &&
        !(await prisma.vendorNotification.findFirst({ where: { vendorId: vendorA.id, type: "MEAL_SUSPENDED" } }))?.message.includes("Health complaint"))
      const twice = await call("POST", S, { status: "SUSPENDED", reason: "x" })
      check("suspending twice is refused", twice.status === 400 && twice.json.code === "ALREADY_IN_STATE", twice.json)

      const ban = await call("POST", S, { status: "BANNED", reason: "Repeated" })
      check("ban SUSPENDED → BANNED, suspension marker cleared",
        ban.json.data?.adminStatus === "BANNED" && ban.json.data?.adminSuspendedAt === null && ban.json.data?.adminBannedAt !== null, ban.json)
      check("…vendor notified (MEAL_BANNED)", (await noteCount("MEAL_BANNED")) === n.b + 1)

      const down = await call("POST", S, { status: "SUSPENDED", reason: "x" })
      check("BANNED → SUSPENDED is refused", down.status === 409 && down.json.code === "INVALID_STATUS_TRANSITION", down.json)

      /* An admin who opened the page while it was SUSPENDED clicks "Reinstate"
       * after someone else banned it: that must not become an unban. */
      const stale = await call("POST", S, { status: "ACTIVE", expectedStatus: "SUSPENDED" })
      check("a stale reinstate on a banned meal is refused, not turned into an unban",
        stale.status === 409 && stale.json.code === "STATUS_CHANGED", stale.json)
      check("…and it is still banned", (await prisma.menuItem.findUniqueOrThrow({ where: { id: d3 } })).adminStatus === "BANNED")

      const unban = await call("POST", S, { status: "ACTIVE", expectedStatus: "BANNED" })
      check("unban BANNED → ACTIVE", unban.json.data?.adminStatus === "ACTIVE" && unban.json.data?.adminBannedAt === null, unban.json)

      await call("POST", S, { status: "SUSPENDED", reason: "Again" })
      const re = await call("POST", S, { status: "ACTIVE", expectedStatus: "SUSPENDED" })
      check("reinstate SUSPENDED → ACTIVE", re.json.data?.adminStatus === "ACTIVE" && re.json.data?.adminSuspendedAt === null, re.json)
      check("…both lifts notify MEAL_REINSTATED", (await noteCount("MEAL_REINSTATED")) === n.r + 2)

      const badExpected = await call("POST", S, { status: "SUSPENDED", reason: "x", expectedStatus: "NOPE" })
      check("an unknown expectedStatus is refused", badExpected.status === 400 && badExpected.json.code === "INVALID_STATUS", badExpected.json)

      check("refused transitions notified nobody",
        (await noteCount("MEAL_SUSPENDED")) === n.s + 2 && (await noteCount("MEAL_BANNED")) === n.b + 1)

      const rows = await auditActions(d3, 6)
      const names = rows.map((r) => r.action)
      check("every transition has its own audit verb",
        ["menu_item.suspended", "menu_item.banned", "menu_item.unbanned", "menu_item.reinstated"].every((a) => names.includes(a)), names)
      check("…and nothing is logged as menu_item.active", !names.includes("menu_item.active"), names)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 5. detail context, filters, export, deleted vendor\n")

    asVendor(vendorB.userId)
    const bDish = (await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} B Dish`, basePriceMinor: 12345, outletIds: [oB.id],
    })).json.data.id as string

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const d = (await call("GET", `${M}/${d1}`)).json.data as Json
      const o = (d.outlets as Json[])[0]!
      check("detail carries the outlet's city and statuses",
        o.outletCity === "ZZ MealMod City" && o.outletAdminStatus === "ACTIVE" && o.outletReviewStatus === "AUTO_APPROVED" &&
        o.outletClearance === "CLEARED" && o.adminStatus === "ACTIVE", o)
      check("…the archive flag and tax category", d.isArchived === false && "taxCategory" in d, { isArchived: d.isArchived })

      const byFlag = await call("GET", `${M}?flagReason=INAPPROPRIATE_NAME&pageSize=100`)
      const flagIds = (byFlag.json.data?.items as Json[]).map((i) => i.id)
      check("flag-reason filter narrows to dishes carrying it", flagIds.includes(d2) && !flagIds.includes(d1), flagIds)
      const junk = await call("GET", `${M}?flagReason=DROP_TABLE&pageSize=100`)
      check("…an unknown reason is ignored, not passed to Prisma", junk.status === 200 && junk.json.data?.total >= 3, junk.json.data?.total)

      const byOutlet = await call("GET", `${M}?outlet=${o1.id}&pageSize=100`)
      check("outlet filter lists that outlet's dishes", byOutlet.json.data?.total === 4, byOutlet.json.data?.total)
      const foreign = await call("GET", `${M}?outlet=${oB.id}&pageSize=100`)
      check("…another country's outlet resolves to zero rows (a filter, never authorization)", foreign.json.data?.total === 0, foreign.json.data?.total)
    }

    asAdmin(admin.id, [READ], GLOBAL)
    {
      const csv = await call("GET", `${M}/export?search=${MARKER}`)
      const lines = csv.text.trim().split(/\r?\n/)
      const header = lines[0] ?? ""
      check("export names the currency beside the minor-unit price",
        header.includes("Price (minor units)") && header.includes("Currency") && header.includes("Currency Minor Unit Digits"), header)
      const ugx = lines.find((l) => l.includes("Plate One"))
      const kes = lines.find((l) => l.includes("B Dish"))
      check("…UGX rows say UGX and 0 digits", !!ugx && /,10000,UGX,0,/.test(ugx), ugx)
      check("…KES rows say KES and 2 digits, unconverted", !!kes && /,12345,KES,2,/.test(kes), kes)
    }

    await prisma.vendorAccount.update({ where: { id: vendorB.id }, data: { deletedAt: new Date() } })
    asAdmin(admin.id, [READ, MOD], GLOBAL)
    {
      const g = await call("GET", `${M}/${bDish}`)
      check("a soft-deleted vendor's dish does not open by id", g.status === 404 && g.json.code === "NOT_FOUND", g.json)
      const s = await call("POST", `${M}/${bDish}/status`, { status: "SUSPENDED", reason: "x" })
      check("…nor accept a moderation write", s.status === 404, s.json)
      const l = await call("GET", `${M}?search=${MARKER}&pageSize=100`)
      check("…agreeing with the list, which excludes it",
        !(l.json.data?.items as Json[]).some((i) => i.id === bDish))
    }
  } finally {
    server.close()
  }
}

main()
  .catch((err) => { failed++; console.error("  CRASH", err) })
  .finally(async () => {
    await sweep().catch((err) => console.error("  cleanup failed", err))
    console.log("\n  cleaned up\n")
    console.log(`  ${passed} passed, ${failed} failed\n`)
    await prisma.$disconnect()
    process.exit(failed > 0 ? 1 : 0)
  })

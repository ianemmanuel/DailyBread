/*
 * Smoke test — the CUSTOMER MEAL API, against the DEV DATABASE.
 *
 *   GET /customer/v1/discovery/cities/:citySlug/meals   city-wide, anonymous
 *   GET /customer/v1/discovery/meals?addressId|lat,lng  reaching a point
 *   GET /customer/v1/meals/:mealId                      one meal in full
 *   GET /customer/v1/outlets/:outletId?addressId|lat,lng  storefront + delivery verdict
 *
 * What it proves, none of which a type can check:
 *   - the grain is the MEAL (a dish at an outlet): one dish at two outlets is
 *     two rows, each with its own mealId, menuItemId and outletId;
 *   - lifecycle: sold-out meals are left out of FEEDS but still shown (greyed)
 *     on the storefront and detail; removed, archived, deleted and moderation-
 *     hidden meals appear nowhere;
 *   - geography: the meal feeds read the SAME eligible outlets as places —
 *     city, the outlet's own zone, and (with a point) the outlet's radius;
 *   - pricing: a feed row, the storefront, the detail and the cart agree on
 *     price, was-price, offer and label for every case Phase 6 defined;
 *   - facets count MEALS by the dish's own cuisines, never outlets or the
 *     vendor profile's cuisines;
 *   - UGX (0 decimals), images, modifiers, and the pinned key sets;
 *   - location: anonymous storefront, a signed-in addressId, ownership, and
 *     the delivery verdict.
 *
 * The real customer v1 router is driven over real HTTP. Its only identity
 * middleware (attachCustomerContext) needs a Clerk token, so the signed-in
 * cases call the REAL controller handlers with `req.customer` set — the mapper
 * under test is the real one either way.
 *
 * Builds its own country, cities, zones, vendor, outlets, dishes, offers and
 * customers; cleans up after itself and sweeps strays from an aborted run.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.meals.smoke.ts
 */
import express, { type RequestHandler } from "express"
import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"
import { prisma } from "@repo/db"

import customerV1Router from "@/modules/customer/routes/v1"
import { errorHandler } from "@/middleware/error"
import {
  handleDiscoverMeals, handleGetStorefront,
} from "@/modules/customer/controllers/customer.discovery.controller"
import { discoverCityOutlets, discoverOutlets } from "@/modules/customer/services/customer.discovery.service"
import { priceCustomerCart } from "@/modules/customer/services/customer.cart.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"
import { clearCurrencyCache } from "@/modules/finance"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"

const MARKER = "zz-smoke-cmeals"
const TZ = "Pacific/Kiritimati"

/* A square in the empty Pacific: west half trades, east half is
 * registration-only. A second city sits beside it. */
const square = (w: number, e: number) => ({
  type       : "Polygon",
  coordinates: [[[w, -40], [e, -40], [e, -39], [w, -39], [w, -40]]],
})
const P      = { latitude: -39.5,  longitude: -169.75 } // the customer; west zone
const EDGE   = { latitude: -39.55, longitude: -169.75 } // ~5.5 km from P
const EAST   = { latitude: -39.5,  longitude: -169.25 } // registration-only zone
const OTHER  = { latitude: -39.5,  longitude: -171.5 }  // the second city

// ─── Reporting ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}

// ─── HTTP harness ────────────────────────────────────────────────────────────

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const app = express()
app.use(express.json())
app.use("/api/customer/v1", customerV1Router)
app.use(errorHandler)

let baseUrl = ""

async function get(path: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${baseUrl}/api/customer/v1${path}`)
  const text = await res.text()
  let json: Json = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* Express's own 404 page */ }
  return { status: res.status, json }
}

/** The REAL controller, with a signed-in customer — what the route does once
 *  attachCustomerContext has resolved a Clerk token. */
async function asCustomer(
  handler   : RequestHandler,
  customerId: string,
  params    : Record<string, string>,
  query     : Record<string, string>,
): Promise<{ data: Json | null; code: string | null }> {
  let data: Json | null = null
  let code: string | null = null
  const req = { params, query, customer: { id: customerId } } as never
  const res = {
    status() { return this },
    json(payload: { data?: Json }) { data = payload?.data ?? null; return this },
  } as never
  await handler(req, res, ((err: { code?: string }) => { code = err?.code ?? "UNKNOWN" }) as never)
  return { data, code }
}

const keys = (o: unknown) => Object.keys((o ?? {}) as object).sort().join(",")

// ─── Fixtures ────────────────────────────────────────────────────────────────

async function sweep() {
  await prisma.consumerAddress.deleteMany({ where: { consumer: { email: { startsWith: MARKER } } } })
  await prisma.consumerAccount.deleteMany({ where: { email: { startsWith: MARKER } } })
  // Vendor cascades: profile, outlets → meals, menu → images and links, groups, discounts.
  await prisma.vendorAccount.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorApplication.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorUser.deleteMany({ where: { email: { startsWith: MARKER } } })
  /* After the menu, which holds Restrict links to both. */
  await prisma.cuisine.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.dietaryTag.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

async function main() {
  console.log("\n── customer meals smoke ────────────────────────────────────\n")
  await sweep()

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  const hotFood    = await prisma.taxCategory.findFirst({ where: { code: "HOT_PREPARED_FOOD" }, select: { id: true } })
  const ugx        = await prisma.currency.findUnique({ where: { code: "UGX" } })
  if (!vendorType || !hotFood || !ugx || !publicMediaStorage.isConfigured()) {
    console.error("  SKIPPED — needs an active vendor type, the HOT_PREPARED_FOOD tax category, the UGX currency and a configured public media bucket")
    return
  }

  /* UGX has ZERO minor digits: anything assuming two is off by 100×. */
  const country = await prisma.country.create({
    data: {
      name: "ZZ CMeals", code: "ZZCM", slug: `${MARKER}-country`, currency: "UGX", currencyCode: "UGX",
      phoneCode: "+99983", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
      taxConfig: { create: { pricesIncludeTax: true, taxName: "VAT" } },
      taxRates : { create: { taxCategoryId: hotFood.id, rateBps: 1600, isStandard: true } },
    },
  })
  const city = await prisma.city.create({
    data: {
      countryId: country.id, name: "ZZ CMeals City", slug: `${MARKER}-city`, timezone: TZ, status: "ACTIVE",
      boundary: square(-170, -169), boundingBox: { north: -39, south: -40, east: -169, west: -170 },
      latitude: P.latitude, longitude: P.longitude,
    },
  })
  const otherCity = await prisma.city.create({
    data: {
      countryId: country.id, name: "ZZ CMeals Other", slug: `${MARKER}-other`, timezone: TZ, status: "ACTIVE",
      boundary: square(-172, -171), boundingBox: { north: -39, south: -40, east: -171, west: -172 },
      latitude: OTHER.latitude, longitude: OTHER.longitude,
    },
  })
  const trading = await prisma.zone.create({
    data: { cityId: city.id, name: "ZZ-CM-WEST", publicName: "ZZ West", boundaries: square(-170, -169.5), level: "MARKETPLACE", status: "ACTIVE" },
  })
  const dormant = await prisma.zone.create({
    data: { cityId: city.id, name: "ZZ-CM-EAST", publicName: "ZZ East", boundaries: square(-169.5, -169), level: "REGISTRATION_ONLY", status: "ACTIVE" },
  })
  const otherZone = await prisma.zone.create({
    data: { cityId: otherCity.id, name: "ZZ-CM-OTHER", publicName: "ZZ Other", boundaries: square(-172, -171), level: "MARKETPLACE", status: "ACTIVE" },
  })

  // ── Taxonomy: C1 on dishes, C2 on the soup only, C3 on the PROFILE only ──
  const taxonomy = (kind: "cuisine" | "dietaryTag", tag: string) => {
    const data = { code: `${MARKER}-${tag}`, slug: `${MARKER}-${tag}`, name: `${MARKER} ${tag}`, status: "ACTIVE" as const }
    return kind === "cuisine" ? prisma.cuisine.create({ data }) : prisma.dietaryTag.create({ data })
  }
  const c1 = await taxonomy("cuisine", "c1")
  const c2 = await taxonomy("cuisine", "c2")
  const c3 = await taxonomy("cuisine", "c3")
  const t1 = await taxonomy("dietaryTag", "t1")

  // ── Vendor ──
  const email = `${MARKER}-v@example.test`
  const user = await prisma.vendorUser.create({ data: { externalAuthId: `${MARKER}-v`, email } })
  const application = await prisma.vendorApplication.create({
    data: { userId: user.id, countryId: country.id, vendorTypeId: vendorType.id, businessEmail: email },
  })
  const vendor = await prisma.vendorAccount.create({
    data: {
      userId: user.id, vendorTypeId: vendorType.id, countryId: country.id, applicationId: application.id,
      legalBusinessName: `${MARKER} Vendor`, businessEmail: email, businessPhone: "+9993000000",
      ownerFirstName: "Smoke", ownerLastName: "Meals", businessAddress: "1 Test Road", status: "ACTIVE",
      vendorProfile: {
        create: {
          displayName: `${MARKER} Kitchen`, isPublished: true, reviewStatus: "AUTO_APPROVED",
          cuisines: { create: { cuisineId: c3.id } },
        },
      },
    },
  })

  const outlet = (name: string, at: typeof P, cityId: string, zoneId: string, radiusKm: number, fee: number | null = null) =>
    prisma.outlet.create({
      data: {
        vendorId: vendor.id, cityId, zoneId, name: `${MARKER} ${name}`, addressLine1: "1 Test Road",
        latitude: at.latitude, longitude: at.longitude, deliveryRadius: radiusKm, deliveryFeeMinor: fee,
        adminStatus: "ACTIVE", clearanceStatus: "CLEARED", reviewStatus: "AUTO_APPROVED",
      },
    })
  const oNear    = await outlet("Near Kitchen", P, city.id, trading.id, 5, 1500)
  const oFar     = await outlet("Far Kitchen", EDGE, city.id, trading.id, 1)
  const oClosed  = await outlet("Closed Kitchen", P, city.id, trading.id, 5)
  const oDormant = await outlet("Dormant Kitchen", EAST, city.id, dormant.id, 30)
  const oOther   = await outlet("Other City Kitchen", OTHER, otherCity.id, otherZone.id, 5)
  await prisma.outletOperatingHours.createMany({
    data: (["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const)
      .map((dayOfWeek) => ({ outletId: oClosed.id, dayOfWeek, openTime: "00:00", closeTime: "00:00", isClosed: true })),
  })

  const dish = (name: string, basePriceMinor: number, extra: Json = {}) =>
    prisma.menuItem.create({
      data: {
        vendorId: vendor.id, name: `${MARKER} ${name}`, basePriceMinor, taxCategoryId: hotFood.id,
        adminStatus: "ACTIVE", reviewStatus: "AUTO_APPROVED", ...extra,
      },
    })
  const plate    = await dish("Plate", 10000, {
    description: "A plate", portionSize: "Large", prepTimeMinutes: 20,
    cuisines: { create: { cuisineId: c1.id } }, dietaryTags: { create: { dietaryTagId: t1.id } },
  })
  const soup     = await dish("Soup", 5000, { cuisines: { create: [{ cuisineId: c1.id }, { cuisineId: c2.id }] } })
  const late     = await dish("Late Snack", 3000)
  const sold     = await dish("Sold Out Stew", 4000)
  const removed  = await dish("Removed Rice", 4000)
  const archived = await dish("Archived Bread", 4000, { isArchived: true })
  const deleted  = await dish("Deleted Pie", 4000, { deletedAt: new Date() })
  const flagged  = await dish("Flagged Fish", 4000, { reviewStatus: "FLAGGED" })
  /* Its OWN status would show it; a flagged option group attached directly,
   * bypassing the moderation rules, is what must hide it (the read-side guard
   * in SELLABLE_MENU_ITEM_WHERE). */
  const heldBack = await dish("Held Back Curry", 4000)
  const remote   = await dish("Dormant Dish", 4000)
  const faraway  = await dish("Other City Dish", 4000)

  const meal = (outletId: string, menuItemId: string, extra: Json = {}) =>
    prisma.meal.create({ data: { outletId, menuItemId, isAvailable: true, ...extra } })
  const mPlateNear  = await meal(oNear.id, plate.id)
  const mPlateFar   = await meal(oFar.id, plate.id, { priceMinorOverride: 12000 })
  const mSoup       = await meal(oNear.id, soup.id)
  const mLate       = await meal(oClosed.id, late.id)
  const mSold       = await meal(oNear.id, sold.id, { isAvailable: false })
  const mRemoved    = await meal(oNear.id, removed.id, { deletedAt: new Date() })
  const mArchived   = await meal(oNear.id, archived.id)
  const mDeleted    = await meal(oNear.id, deleted.id)
  const mFlagged    = await meal(oNear.id, flagged.id)
  const mHeldBack   = await meal(oNear.id, heldBack.id)
  const mRemote     = await meal(oDormant.id, remote.id)
  const mOther      = await meal(oOther.id, faraway.id)

  // ── Images: two on the plate, in order; none on the soup ──
  const imageKey = (n: number) => `meal-images/${MARKER}/${randomUUID()}-${n}.webp`
  const plateKeys = [imageKey(0), imageKey(1)]
  await prisma.menuItemImage.createMany({
    data: plateKeys.map((key, position) => ({
      menuItemId: plate.id, position, imageKey: key, originalKey: `${key}.orig`,
      width: 1600 - position * 100, height: 1200, blurDataUrl: `data:image/webp;base64,${MARKER}${position}`,
    })),
  })

  // ── Modifiers: one approved group (required) on the plate; one flagged
  //    group, on a dish of its own — a visible dish may not carry one ──
  const size = await prisma.modifierGroup.create({
    data: {
      vendorId: vendor.id, name: `${MARKER} Size`, minSelect: 1, maxSelect: 1, reviewStatus: "AUTO_APPROVED",
      options: {
        create: [
          { name: "Regular", priceDeltaMinor: 0,    position: 0 },
          { name: "Large",   priceDeltaMinor: 2000, position: 1 },
          { name: "Huge",    priceDeltaMinor: 4000, position: 2, isAvailable: false },
        ],
      },
    },
  })
  /* The plate's size is REQUIRED, so a cart line must choose one: the
   * zero-delta option keeps the price comparable with the menu. */
  const regular = await prisma.modifierOption.findFirstOrThrow({ where: { groupId: size.id, name: "Regular" } })
  const hidden = await prisma.modifierGroup.create({
    data: { vendorId: vendor.id, name: `${MARKER} Hidden`, reviewStatus: "FLAGGED", options: { create: [{ name: "X" }] } },
  })
  await prisma.menuItemModifierGroup.createMany({
    data: [{ menuItemId: plate.id, groupId: size.id, position: 0 }, { menuItemId: heldBack.id, groupId: hidden.id, position: 0 }],
  })

  // ── Customers ──
  const customer = await prisma.consumerAccount.create({
    data: { externalAuthId: `${MARKER}-c1`, email: `${MARKER}-c1@example.test`, fullName: "ZZ One" },
  })
  const stranger = await prisma.consumerAccount.create({
    data: { externalAuthId: `${MARKER}-c2`, email: `${MARKER}-c2@example.test`, fullName: "ZZ Two" },
  })
  const address = (consumerAccountId: string, at: typeof P) => prisma.consumerAddress.create({
    data: { consumerAccountId, addressLine1: "1 Home Road", city: "ZZ", countryId: country.id, ...at },
  })
  const home = await address(customer.id, P)
  const theirs = await address(stranger.id, P)

  clearOperatingCityCache()
  clearCurrencyCache()

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const now  = new Date()
  const past = new Date(now.getTime() - 86_400_000)
  const offer = (name: string, data: Json) => prisma.discount.create({
    data: { vendorId: vendor.id, name: `${MARKER} ${name}`, type: "PERCENTAGE_OFF_ITEMS", startsAt: past, ...data },
  })

  const cityMeals = async (query = "pageSize=50") =>
    (await get(`/discovery/cities/${MARKER}-city/meals?${query}`)).json.data as Json
  const pointMeals = async (query = "pageSize=50") =>
    (await get(`/discovery/meals?latitude=${P.latitude}&longitude=${P.longitude}&${query}`)).json.data as Json
  const mealIds = (r: Json | null | undefined) => ((r?.meals ?? []) as Json[]).map((m) => m.mealId as string)
  const outletSet = (list: string[]) => [...new Set(list)].sort().join(",")

  try {
    // ════════════════════════════════════════════════════════════════════
    console.log("  ── 1. grain and identity\n")

    const all = await cityMeals()
    const rowFar = (all.meals as Json[]).find((m) => m.mealId === mPlateFar.id)
    const rowNear = (all.meals as Json[]).find((m) => m.mealId === mPlateNear.id)
    check("one dish at two outlets is TWO rows", !!rowFar && !!rowNear)
    check("…each carries mealId, menuItemId and outletId",
      rowNear?.menuItemId === plate.id && rowNear?.outletId === oNear.id
        && rowFar?.menuItemId === plate.id && rowFar?.outletId === oFar.id, { rowNear, rowFar })
    check("…and the outlet reference names the place", rowNear?.outlet?.outletId === oNear.id
      && rowNear?.outlet?.name === `${MARKER} Near Kitchen` && rowNear?.outlet?.displayName === `${MARKER} Kitchen`, rowNear?.outlet)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. lifecycle\n")

    const listed = new Set(mealIds(all))
    check("a normal meal is listed", listed.has(mPlateNear.id) && listed.has(mSoup.id))
    check("a SOLD-OUT meal is left out of the feed", !listed.has(mSold.id))
    check("a meal REMOVED from its outlet is left out", !listed.has(mRemoved.id))
    check("an ARCHIVED dish is left out", !listed.has(mArchived.id))
    check("a DELETED dish is left out", !listed.has(mDeleted.id))
    check("a moderation-FLAGGED dish is left out", !listed.has(mFlagged.id))
    check("a dish carrying a FLAGGED option group is left out (read-side guard)", !listed.has(mHeldBack.id))

    const store = (await get(`/outlets/${oNear.id}`)).json.data as Json
    const storeItems = ((store?.sections ?? []) as Json[]).flatMap((s) => s.items as Json[])
    const storeSold = storeItems.find((i) => i.mealId === mSold.id)
    check("the STOREFRONT still shows the sold-out meal, greyed",
      storeSold?.isAvailable === false && storeSold?.unavailableReason === "OUT_OF_STOCK", storeSold)
    check("…and none of the removed, archived, deleted or flagged ones",
      ![mRemoved, mArchived, mDeleted, mFlagged, mHeldBack].some((m) => storeItems.some((i) => i.mealId === m.id)),
      storeItems.map((i) => i.name))

    const soldDetail = await get(`/meals/${mSold.id}`)
    check("detail of a sold-out meal is found and marked unavailable",
      soldDetail.status === 200 && soldDetail.json.data?.isAvailable === false
        && soldDetail.json.data?.unavailableReason === "OUT_OF_STOCK", soldDetail.json)
    for (const [label, m] of [["removed", mRemoved], ["archived", mArchived], ["deleted", mDeleted], ["flagged", mFlagged], ["option-group-flagged", mHeldBack], ["dormant-zone", mRemote]] as const) {
      const r = await get(`/meals/${m.id}`)
      check(`detail of a ${label} meal is a 404`, r.status === 404 && r.json.code === "MEAL_NOT_FOUND", r.json)
    }
    const nope = await get(`/meals/${randomUUID()}`)
    check("…indistinguishable from an id that never existed", nope.status === 404 && nope.json.code === "MEAL_NOT_FOUND")

    const lateRow = (all.meals as Json[]).find((m) => m.mealId === mLate.id)
    check("a meal at a CLOSED outlet is listed, marked OUTLET_CLOSED",
      lateRow?.isAvailable === false && lateRow?.unavailableReason === "OUTLET_CLOSED", lateRow)
    check("…and ranked after every orderable meal", (all.meals as Json[]).at(-1)?.mealId === mLate.id, mealIds(all))
    check("orderable rows say so", rowNear?.isAvailable === true && rowNear?.unavailableReason === null)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. geography\n")

    const places = await discoverCityOutlets(`${MARKER}-city`, { pageSize: 50 })
    const mealOutlets = outletSet((all.meals as Json[]).map((m) => m.outletId))
    check("city-wide meals come from EXACTLY the outlets city-wide places lists",
      mealOutlets === outletSet((places?.outlets ?? []).map((o) => o.outletId)),
      { meals: mealOutlets, places: places?.outlets.map((o) => o.name) })
    check("zone restriction: nothing from an outlet whose zone may not trade", !listed.has(mRemote.id))
    check("city restriction: nothing from another city", !listed.has(mOther.id))
    check("…which has its own list", mealIds(await (async () =>
      (await get(`/discovery/cities/${MARKER}-other/meals`)).json.data)()).includes(mOther.id))
    check("city-wide rows make no delivery claim", (all.meals as Json[]).every((m) => m.delivery === null))
    check("an unknown city is a 404", (await get("/discovery/cities/zz-no-such-city/meals")).status === 404)

    const near = await pointMeals()
    const nearIds = new Set(mealIds(near))
    check("located: the point is serviceable", near?.serviceability?.isServiceable === true, near?.serviceability)
    check("located: an outlet whose radius reaches the point is listed", nearIds.has(mPlateNear.id) && nearIds.has(mSoup.id))
    check("located: an outlet 5 km away with a 1 km radius is NOT", !nearIds.has(mPlateFar.id))
    const nearPlaces = await discoverOutlets(P, { pageSize: 50 }, null)
    check("located meals come from EXACTLY the outlets the located places feed lists",
      outletSet((near.meals as Json[]).map((m) => m.outletId)) === outletSet(nearPlaces.outlets.map((o) => o.outletId)),
      { meals: (near.meals as Json[]).map((m) => m.outletId), places: nearPlaces.outlets.map((o) => o.name) })
    const nearPlate = (near.meals as Json[]).find((m) => m.mealId === mPlateNear.id)
    check("located rows carry distance, ETA and the outlet's fee",
      nearPlate?.delivery?.distanceMeters === 0 && typeof nearPlate?.delivery?.eta?.maxMinutes === "number"
        && nearPlate?.delivery?.deliveryFeeMinor === 1500, nearPlate?.delivery)
    const unserved = (await get(`/discovery/meals?latitude=${EAST.latitude}&longitude=${EAST.longitude}`)).json.data as Json
    check("a point in a zone that cannot trade: not serviceable, and no meals",
      unserved?.serviceability?.isServiceable === false && unserved?.meals?.length === 0, unserved?.serviceability)
    const noPoint = await get("/discovery/meals")
    check("the located feed without a location is refused, not guessed", noPoint.status === 400 && noPoint.json.code === "LOCATION_REQUIRED", noPoint.json)
    const sorted = await pointMeals("sort=DISTANCE&pageSize=50")
    check("located sort is accepted", Array.isArray(sorted?.meals) && sorted.meals.length === near.meals.length)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 4. filters, facets, pagination (through the real controller)\n")

    check("search matches a dish name", mealIds(await cityMeals("search=Soup")).join() === mSoup.id)
    check("search matches the place selling it", mealIds(await cityMeals("search=Far%20Kitchen")).join() === mPlateFar.id)
    check("cuisine filter matches the DISH's cuisine",
      mealIds(await cityMeals(`cuisineId=${c2.id}`)).join() === mSoup.id)
    check("…a profile-only cuisine matches no dish", mealIds(await cityMeals(`cuisineId=${c3.id}`)).length === 0)
    check("dietary filter matches the dish's tags",
      outletSet(mealIds(await cityMeals(`dietaryTagId=${t1.id}`))) === outletSet([mPlateNear.id, mPlateFar.id]))

    const facet = (all.availableCuisines as Json[])
    check("the cuisine facet counts MEALS (3 carry C1, across only 2 outlets)",
      facet.find((f) => f.id === c1.id)?.count === 3 && facet.find((f) => f.id === c2.id)?.count === 1, facet)
    check("…and never the vendor profile's cuisines", !facet.some((f) => f.id === c3.id), facet)
    check("places' facet DOES carry the profile cuisine — the two describe different things",
      (places?.availableCuisines ?? []).some((f) => f.id === c3.id))

    const p1 = await cityMeals("pageSize=2&page=1")
    const p2 = await cityMeals("pageSize=2&page=2")
    check("paging: total is the whole list, each page its size",
      p1.total === 4 && p1.meals.length === 2 && p2.meals.length === 2 && p1.pageSize === 2 && p2.page === 2, { p1: p1.total, p2: p2.page })
    check("…and page 2 shares no row with page 1",
      !mealIds(p1).some((id) => mealIds(p2).includes(id)) && new Set([...mealIds(p1), ...mealIds(p2)]).size === 4)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 5. pricing parity: feed = storefront = detail = cart\n")

    const dTarget  = await offer("Target",  { percentBps: 1000, appliesToAllItems: true, appliesToAllOutlets: false, outlets: { create: { outletId: oFar.id } } })
    const dCeiling = await offer("Ceiling", { percentBps: 6000, appliesToAllItems: false, appliesToAllOutlets: true, items: { create: { menuItemId: soup.id } } })

    type View = { price: number; was: number | null; offer: string | null; label: string | null }
    const views = async (mealId: string, menuItemId: string, outletId: string) => {
      const feed = ((await cityMeals()).meals as Json[]).find((m) => m.mealId === mealId)
      const sf = (((await get(`/outlets/${outletId}`)).json.data?.sections ?? []) as Json[])
        .flatMap((s) => s.items as Json[]).find((i) => i.mealId === mealId)
      const detail = (await get(`/meals/${mealId}`)).json.data as Json
      const cart = await priceCustomerCart({
        outletId, lines: [{ menuItemId, quantity: 1, selectedOptionIds: menuItemId === plate.id ? [regular.id] : [] }],
      })
      const line = cart.lines[0]
      const view = (x: Json | undefined): View | null => x
        ? { price: x.priceMinor, was: x.wasPriceMinor ?? null, offer: x.offer?.id ?? null, label: x.offer?.label ?? null }
        : null
      return {
        feed: view(feed), store: view(sf), detail: view(detail),
        cart: line ? { price: line.totalMinor, was: line.discountMinor > 0 ? line.subtotalMinor : null, offer: line.appliedOfferId, label: line.appliedOfferName } : null,
        feedRow: feed, detailRow: detail, cartCurrency: cart.currency,
      }
    }
    const agree = async (label: string, mealId: string, menuItemId: string, outletId: string, want: View) => {
      const v = await views(mealId, menuItemId, outletId)
      const got = [v.feed, v.store, v.detail, v.cart].map((x) => JSON.stringify(x))
      check(label, got.every((g) => g === JSON.stringify(want)),
        { want, feed: got[0], store: got[1], detail: got[2], cart: got[3] })
      return v
    }

    await agree("base price, and an offer targeted ELSEWHERE does not apply (10000)", mPlateNear.id, plate.id, oNear.id,
      { price: 10000, was: null, offer: null, label: null })
    const far = await agree("outlet override + targeted offer (12000 → 10800, \"10% off\")", mPlateFar.id, plate.id, oFar.id,
      { price: 10800, was: 12000, offer: dTarget.id, label: "10% off" })
    await agree("the 50% ceiling, everywhere (5000 → 2500, \"50% off\")", mSoup.id, soup.id, oNear.id,
      { price: 2500, was: 5000, offer: dCeiling.id, label: "50% off" })
    check("the label is generated, never the vendor's offer name",
      far.feedRow?.offer?.label === "10% off" && !JSON.stringify(far).includes(`${MARKER} Target`))

    const dBig = await offer("Big", { percentBps: 2500, appliesToAllItems: true, appliesToAllOutlets: true })
    await agree("competing offers: the bigger saving wins (12000 → 9000)", mPlateFar.id, plate.id, oFar.id,
      { price: 9000, was: 12000, offer: dBig.id, label: "25% off" })
    await agree("…and the ceilinged 50% still beats 25% on the soup", mSoup.id, soup.id, oNear.id,
      { price: 2500, was: 5000, offer: dCeiling.id, label: "50% off" })
    await prisma.discount.delete({ where: { id: dBig.id } })

    const tLater   = await offer("Later",   { percentBps: 1500, appliesToAllItems: true, appliesToAllOutlets: true, startsAt: new Date(now.getTime() - 86_400_000) })
    const tEarlier = await offer("Earlier", { percentBps: 1500, appliesToAllItems: true, appliesToAllOutlets: true, startsAt: new Date(now.getTime() - 2 * 86_400_000) })
    await agree("equal savings: the EARLIER start wins, deterministically (10000 → 8500)", mPlateNear.id, plate.id, oNear.id,
      { price: 8500, was: 10000, offer: tEarlier.id, label: "15% off" })
    await prisma.discount.deleteMany({ where: { id: { in: [tLater.id, tEarlier.id] } } })

    const offersOnly = await cityMeals("hasOffer=true")
    check("the offer filter keeps exactly the rows with an applying offer",
      outletSet(mealIds(offersOnly)) === outletSet([mPlateFar.id, mSoup.id]), mealIds(offersOnly))

    // ── Currency ──
    const cur = far.feedRow?.currency
    check("UGX (0 digits) on the feed, the detail and the cart",
      cur?.code === "UGX" && cur?.minorUnitDigits === 0 && far.detailRow?.currency?.code === "UGX"
        && far.detailRow?.currency?.minorUnitDigits === 0 && far.cartCurrency.minorUnitDigits === 0, cur)
    check("…and every figure a whole number", [far.feed, far.store, far.detail, far.cart].every((v) => Number.isInteger(v?.price)))
    check("the detail carries Tax's breakdown (16% inclusive of 10800 → 1490)",
      far.detailRow?.price?.grossMinor === 10800 && far.detailRow?.price?.taxMinor === 1490 && far.detailRow?.price?.taxInclusive === true, far.detailRow?.price)
    check("…and the feed row carries none", !("price" in (far.feedRow ?? {})))

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 6. images and modifiers\n")

    const img = rowNear?.image
    check("a feed row carries the MAIN image (position 0)",
      typeof img?.url === "string" && img.url.includes(plateKeys[0]!) && img.width === 1600 && img.height === 1200
        && img.blurDataUrl === `data:image/webp;base64,${MARKER}0`, img)
    check("a dish with no photo has image null", (all.meals as Json[]).find((m) => m.mealId === mSoup.id)?.image === null)
    const detail = (await get(`/meals/${mPlateNear.id}`)).json.data as Json
    check("detail carries the FULL gallery, in order",
      detail?.images?.length === 2 && detail.images[0].url.includes(plateKeys[0]) && detail.images[1].url.includes(plateKeys[1])
        && detail.images[1].width === 1500 && detail.image?.url === detail.images[0].url, detail?.images)
    const groups = detail?.modifierGroups as Json[] | undefined
    check("detail carries the plate's modifier group", groups?.length === 1 && groups[0]?.id === size.id, groups)
    check("…required (derived from minSelect), options in order, unavailable shown and marked",
      groups?.[0]?.isRequired === true
        && groups[0].options.map((o: Json) => `${o.name}:${o.priceDeltaMinor}:${o.isAvailable}`).join() === "Regular:0:true,Large:2000:true,Huge:4000:false",
      groups?.[0]?.options)
    check("detail carries the rest of the dish",
      detail?.description === "A plate" && detail?.portionSize === "Large" && detail?.prepTimeMinutes === 20
        && detail?.cuisines?.[0]?.id === c1.id && detail?.dietaryTags?.[0]?.id === t1.id
        && detail?.city?.slug === `${MARKER}-city` && detail?.outlet?.outletId === oNear.id && detail?.section === null, detail)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 7. the contract (pinned key sets)\n")

    check("feed row keys", keys(rowNear) === "cuisines,currency,delivery,description,dietaryTags,image,isAvailable,mealId,menuItemId,name,offer,outlet,outletId,priceMinor,unavailableReason,wasPriceMinor", keys(rowNear))
    check("feed outlet keys", keys(rowNear?.outlet) === "displayName,logoUrl,name,outletId", keys(rowNear?.outlet))
    check("image keys", keys(img) === "blurDataUrl,height,url,width", keys(img))
    check("located delivery keys", keys(nearPlate?.delivery) === "deliveryFeeMinor,distanceMeters,eta", keys(nearPlate?.delivery))
    check("city envelope keys", keys(all) === "availableCuisines,city,meals,page,pageSize,total", keys(all))
    check("located envelope keys", keys(near) === "availableCuisines,meals,page,pageSize,serviceability,total", keys(near))
    check("detail keys", keys(detail) === "city,cuisines,currency,description,dietaryTags,image,images,isAvailable,mealId,menuItemId,modifierGroups,name,offer,outlet,outletId,portionSize,prepTimeMinutes,price,priceMinor,section,unavailableReason,wasPriceMinor", keys(detail))
    check("storefront item keys gained mealId and nothing else", keys(storeItems[0]) === "cuisines,description,dietaryTags,id,image,images,isAvailable,mealId,modifierGroups,name,offer,portionSize,prepTimeMinutes,price,priceMinor,unavailableReason,wasPriceMinor", keys(storeItems[0]))

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 8. storefront location\n")

    check("anonymous storefront with no location: menu, city, and no delivery verdict",
      store?.city?.slug === `${MARKER}-city` && store?.delivery === null && store?.distanceMeters === null && storeItems.length > 0, store?.city)
    const byPoint = (await get(`/outlets/${oNear.id}?latitude=${P.latitude}&longitude=${P.longitude}`)).json.data as Json
    check("anonymous point: serviceable and delivers here",
      byPoint?.delivery?.deliversHere === true && byPoint?.delivery?.serviceability?.isServiceable === true && byPoint?.distanceMeters === 0, byPoint?.delivery)
    const anonAddress = await get(`/outlets/${oNear.id}?addressId=${home.id}`)
    check("an addressId without a signed-in customer is refused", anonAddress.status === 401 && anonAddress.json.code === "AUTH_REQUIRED", anonAddress.json)

    const mine = await asCustomer(handleGetStorefront, customer.id, { outletId: oNear.id }, { addressId: home.id })
    check("signed in, own addressId: resolved, delivers here", mine.data?.delivery?.deliversHere === true, mine)
    const mineFar = await asCustomer(handleGetStorefront, customer.id, { outletId: oFar.id }, { addressId: home.id })
    check("…the same address at an outlet whose radius misses it: serviceable, but does NOT deliver here",
      mineFar.data?.delivery?.serviceability?.isServiceable === true && mineFar.data?.delivery?.deliversHere === false, mineFar.data?.delivery)
    const notMine = await asCustomer(handleGetStorefront, customer.id, { outletId: oNear.id }, { addressId: theirs.id })
    check("someone else's addressId is not found", notMine.code === "ADDRESS_NOT_FOUND" && notMine.data === null, notMine)
    const eastStore = (await get(`/outlets/${oNear.id}?latitude=${EAST.latitude}&longitude=${EAST.longitude}`)).json.data as Json
    check("a point in a zone that cannot trade: not serviceable, does not deliver here",
      eastStore?.delivery?.serviceability?.isServiceable === false && eastStore?.delivery?.deliversHere === false, eastStore?.delivery)
    check("storefront delivery keys", keys(byPoint?.delivery) === "deliversHere,serviceability", keys(byPoint?.delivery))

    const mealsByAddress = await asCustomer(handleDiscoverMeals, customer.id, {}, { addressId: home.id, pageSize: "50" })
    check("located meals by addressId = located meals by the same point",
      mealIds(mealsByAddress.data).sort().join() === mealIds(near).sort().join(), mealsByAddress)
    const mealsNotMine = await asCustomer(handleDiscoverMeals, customer.id, {}, { addressId: theirs.id })
    check("…and someone else's address is not found there either", mealsNotMine.code === "ADDRESS_NOT_FOUND", mealsNotMine)

    await prisma.discount.deleteMany({ where: { id: { in: [dTarget.id, dCeiling.id] } } })
    server.close()
  } finally {
    server.close()
    await sweep()
    clearOperatingCityCache()
    console.log("\n  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

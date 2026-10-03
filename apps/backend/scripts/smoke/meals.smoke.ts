/*
 * Smoke test — the MEALS domain as it stands today, against the DEV DATABASE.
 *
 * This is the safety net for extracting meals into their own module. It pins
 * CURRENT behaviour end to end so a move that changes any of it fails here:
 *
 *   1. vendor authoring   — the REAL /vendor/v1/menu router (state gate →
 *                           controller mapper → service → Prisma)
 *   2. availability       — PATCH /menu/meals/:mealId/availability, which has
 *                           no dashboard UI yet
 *   3. admin moderation   — the REAL admin vendor router (permission gate →
 *                           controller → service → audit)
 *   4. customer visibility — every rule in customer.visibility.ts, flipped one
 *                           at a time, through the real storefront, city browse
 *                           and cart services
 *   5. pricing            — base, outlet override, offer, tax, currency
 *   6. integrity facts    — what the schema does TODAY on delete / name reuse
 *
 * The real application routers are driven over real HTTP on an ephemeral
 * port, mounted at the same /api prefix as bootstrap/app.ts, with only the
 * upstream IDENTITY middleware replaced (it needs a Clerk token): every gate
 * beneath it — requireVendorState at both levels, requirePermission — and
 * every mount point is the real one. Section 0 walks the full URL inventory.
 *
 * `known(...)` lines pin behaviour the Meals recon flagged as WRONG. They pass
 * while the behaviour is unchanged and FAIL when it changes, so a Phase 4 fix
 * has to update the line on purpose rather than drifting past it.
 *
 * Builds its own throwaway countries, city, zones, vendors and outlets (no
 * borrowed vendor — several checks suspend and unpublish the vendor), cleans
 * up after itself and sweeps strays from an aborted earlier run first.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/meals.smoke.ts
 */
import express from "express"
import sharp from "sharp"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import { AdminPermissions } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"

/* The APPLICATION-level routers, not the menu routers themselves: this smoke
 * must keep passing unchanged while the routes beneath these mounts move
 * between modules, and it is the mounts that make the public URLs. */
import vendorRoutes from "@/modules/vendor/routes"
import adminV1Router from "@/modules/admin/routes/v1"
import { errorHandler } from "@/middleware/error"
import { drainAuditQueue } from "@/services/audit"
import { getStorefront } from "@/modules/customer/services/customer.storefront.service"
import { discoverCityOutlets } from "@/modules/customer/services/customer.discovery.service"
import { priceCustomerCart } from "@/modules/customer/services/customer.cart.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"
import { clearCurrencyCache, getCurrencyForCountry } from "@/modules/finance"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"

const MARKER = "zz-smoke-meals"

/* A square in the empty Pacific, split down the middle: west may trade,
 * east is registration-only. Same construction as the city-browse smoke. */
const WEST = { latitude: -19.5, longitude: -149.75 }
const EAST = { latitude: -19.5, longitude: -149.25 }
const square = (w: number, e: number) => ({
  type       : "Polygon",
  coordinates: [[[w, -20], [e, -20], [e, -19], [w, -19], [w, -20]]],
})

/* UTC+14. Far from any plausible server clock, so a window evaluated in the
 * wrong zone is visibly wrong rather than accidentally right. */
const TZ = "Pacific/Kiritimati"

// ─── Reporting ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let pinned = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}

/** Current behaviour the recon flagged as wrong. Passes while unchanged. */
function known(label: string, condition: boolean, detail?: unknown) {
  if (condition) { pinned++; console.log(`  KNOWN ${label}`) }
  else { failed++; console.error(`  FAIL  [known issue changed — update this line deliberately] ${label}`, detail ?? "") }
}

// ─── HTTP harness ────────────────────────────────────────────────────────────

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let vendorCtx: { userId: string; state: string } | null = null
let adminCtx : { adminUser: { id: string }; adminPermissions: string[]; adminScope: AdminScopeContext } | null = null

const app = express()
app.use(express.json())
/* Stands in for vendorAuthChain (verifyVendorToken + loadVendorContext), which
 * routes/index.ts runs before vendorRoutes — everything BELOW this is real. */
app.use("/api/vendor", (req, _res, next) => {
  if (vendorCtx) {
    (req as unknown as Json).vendor = {
      user: { id: vendorCtx.userId, email: "", isActive: true, isBanned: false, banReason: null, bannedAt: null },
      application: null, account: null, state: vendorCtx.state,
    }
  }
  next()
}, vendorRoutes)
/* Stands in for adminAuthChain, which admin/routes/index.ts runs before
 * mounting this same v1 router — every mount and permission gate below it is
 * real. */
app.use("/api/admin/v1", (req, _res, next) => {
  if (adminCtx) Object.assign(req, adminCtx)
  next()
}, adminV1Router)
app.use(errorHandler)

let baseUrl = ""

async function call(
  method: string, path: string, body?: unknown,
): Promise<{ status: number; json: Json; text: string; contentType: string }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body   : body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: Json = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* CSV, or Express's own 404 page */ }
  return { status: res.status, json, text, contentType: res.headers.get("content-type") ?? "" }
}

function asVendor(userId: string, state = "ACTIVE") { vendorCtx = { userId, state } }
function asAdmin(adminId: string, permissions: string[], scope: AdminScopeContext) {
  adminCtx = { adminUser: { id: adminId }, adminPermissions: permissions, adminScope: scope }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Every staged upload this run made, so the sweep can remove the ones a save
 *  never consumed (the R2 lifecycle rule would, eventually). */
const stagedKeys = new Set<string>()

async function sweep() {
  const vendors = await prisma.vendorAccount.findMany({
    where : { businessEmail: { startsWith: MARKER } },
    select: { id: true, applicationId: true },
  })
  const vendorIds = vendors.map((v) => v.id)
  const items = await prisma.menuItem.findMany({ where: { vendorId: { in: vendorIds } }, select: { id: true } })
  /* Real R2 objects, not just rows: every saved photo's public master and
   * private original, and any staged upload left over. */
  const images = await prisma.menuItemImage.findMany({
    where : { menuItemId: { in: items.map((i) => i.id) } },
    select: { imageKey: true, originalKey: true },
  })
  await Promise.all([
    ...images.flatMap((i) => [
      publicMediaStorage.delete(i.imageKey).catch(() => undefined),
      R2Service.deleteObject(i.originalKey).catch(() => undefined),
    ]),
    ...[...stagedKeys].map((k) => R2Service.deleteObject(k).catch(() => undefined)),
  ])
  await prisma.auditLog.deleteMany({ where: { entityType: "MenuItem", entityId: { in: items.map((i) => i.id) } } })
  // Vendor cascades: profile, outlets → meals/meal plans, menu, discounts, notifications.
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
      businessPhone: `+999${tag === "a" ? "1" : "2"}000000`,
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
      latitude: WEST.latitude, longitude: WEST.longitude, deliveryRadius: 5,
      adminStatus: "ACTIVE", clearanceStatus: "CLEARED", reviewStatus: "AUTO_APPROVED",
    },
  })
}

/** The storefront, or null when it 404s the way a hidden outlet must. */
async function storefrontOrNull(outletId: string) {
  try {
    return await getStorefront(outletId, null, null)
  } catch (err) {
    if ((err as { code?: string }).code === "OUTLET_NOT_FOUND") return null
    throw err
  }
}

function menuOf(storefront: Awaited<ReturnType<typeof getStorefront>> | null) {
  return (storefront?.sections ?? []).flatMap((s) => s.items)
}

/** A generated photograph. `exif` plants camera metadata — including a GPS
 *  position — that the published master must not carry. */
async function photo(width: number, height: number, opts: { exif?: boolean; format?: "jpeg" | "png" } = {}) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
  if (opts.exif) {
    image = image.withMetadata({
      exif: {
        IFD0: { Make: "SmokePhone", Model: "Z1", Copyright: `${MARKER} secret` },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "19/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "149/1 45/1 0/1" },
      },
    })
  }
  return opts.format === "png" ? image.png().toBuffer() : image.jpeg({ quality: 90 }).toBuffer()
}

/**
 * Uploads bytes exactly as the vendor dashboard does: the real presign route,
 * then a PUT straight to R2. `declaredSize` is what the browser CLAIMS — the
 * point of several checks below is that the server does not believe it.
 */
async function stageUpload(
  userId: string,
  bytes: Buffer,
  contentType = "image/jpeg",
  declaredSize = bytes.byteLength,
): Promise<string> {
  const saved = vendorCtx
  vendorCtx = { userId, state: "ACTIVE" }
  const presign = await call("POST", "/api/vendor/v1/menu/images/presign", { contentType, fileSize: declaredSize })
  vendorCtx = saved
  if (presign.status !== 200) throw new Error(`presign failed: ${JSON.stringify(presign.json)}`)
  const { storageKey, uploadUrl } = presign.json.data as { storageKey: string; uploadUrl: string }
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(bytes) })
  if (!put.ok) throw new Error(`PUT to R2 failed: ${put.status} ${await put.text()}`)
  stagedKeys.add(storageKey)
  return storageKey
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n── meals smoke ─────────────────────────────────────────────\n")
  await sweep()

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  const admin      = await prisma.adminUser.findFirst({ select: { id: true } })
  const hotFood    = await prisma.taxCategory.findFirst({ where: { code: "HOT_PREPARED_FOOD" }, select: { id: true } })
  const grocery    = await prisma.taxCategory.findFirst({ where: { code: "PACKAGED_GROCERY" }, select: { id: true } })
  const ugx        = await prisma.currency.findUnique({ where: { code: "UGX" } })
  if (!vendorType || !admin || !hotFood || !grocery || !ugx || !publicMediaStorage.isConfigured()) {
    console.error("  SKIPPED — needs an active vendor type, an admin user, the HOT_PREPARED_FOOD / PACKAGED_GROCERY tax categories, the UGX currency and a configured public media bucket")
    return
  }

  /* Country A prices in UGX — ZERO minor digits — so anything assuming two
   * decimals is off by a factor of a hundred rather than subtly wrong. */
  const countryA = await prisma.country.create({
    data: {
      name: "ZZ Meals A", code: "ZZMA", slug: `${MARKER}-a`, currency: "UGX", currencyCode: "UGX",
      phoneCode: "+99981", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
      taxConfig: { create: { pricesIncludeTax: true, taxName: "VAT" } },
      taxRates : { create: { taxCategoryId: hotFood.id, rateBps: 1600, isStandard: true } },
    },
  })
  const countryB = await prisma.country.create({
    data: {
      name: "ZZ Meals B", code: "ZZMB", slug: `${MARKER}-b`, currency: "KES", currencyCode: "KES",
      phoneCode: "+99982", timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const cityA = await prisma.city.create({
    data: {
      countryId: countryA.id, name: "ZZ Meals City", slug: `${MARKER}-city`, timezone: TZ, status: "ACTIVE",
      boundary: square(-150, -149), boundingBox: { north: -19, south: -20, east: -149, west: -150 },
      latitude: WEST.latitude, longitude: WEST.longitude,
    },
  })
  const cityB = await prisma.city.create({
    data: {
      countryId: countryB.id, name: "ZZ Meals City B", slug: `${MARKER}-city-b`, timezone: TZ, status: "ACTIVE",
      latitude: 0, longitude: 0,
    },
  })
  const trading = await prisma.zone.create({
    data: { cityId: cityA.id, name: "ZZ-MEALS-WEST", publicName: "ZZ West", boundaries: square(-150, -149.5), level: "MARKETPLACE", status: "ACTIVE" },
  })
  const dormant = await prisma.zone.create({
    data: { cityId: cityA.id, name: "ZZ-MEALS-EAST", publicName: "ZZ East", boundaries: square(-149.5, -149), level: "REGISTRATION_ONLY", status: "ACTIVE" },
  })

  const vendorA = await makeVendor("a", countryA.id, vendorType.id)
  const vendorB = await makeVendor("b", countryB.id, vendorType.id)
  const o1 = await makeOutlet(vendorA.id, cityA.id, trading.id, "Outlet One")
  const o2 = await makeOutlet(vendorA.id, cityA.id, trading.id, "Outlet Two")
  const oB = await makeOutlet(vendorB.id, cityB.id, null, "Outlet B")

  clearOperatingCityCache()
  clearCurrencyCache()

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  /* Real uploads, because a save now DECODES what the browser stored. The
   * plate's gallery starts as one staged upload and, once saved, is identified
   * by its original's key — which is what every later full-form save sends. */
  let plateStaged = ""
  let stagedB     = ""
  let plateImages: string[] = []

  /** A valid full-form body; tests override one field at a time. */
  const body = (over: Json = {}): Json => ({
    name: `${MARKER} Plate`, description: "A plate", basePriceMinor: 10000,
    outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 12000 }, imageKeys: plateImages,
    taxCategoryId: hotFood.id,
    ...over,
  })

  try {
    plateStaged = await stageUpload(vendorA.userId, await photo(1200, 900))
    stagedB     = await stageUpload(vendorB.userId, await photo(1200, 900))
    plateImages = [plateStaged]

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 0. the public URL contract, through the real mounts\n")

    /*
     * Every meal URL the vendor dashboard and the ERP call today. Each must be
     * ROUTED — answered by one of our handlers in the API's JSON envelope —
     * rather than falling through to Express's own "Cannot GET" 404. Bodies
     * are empty and ids unknown, so nothing here writes anything.
     */
    {
      const NOPE = "00000000-0000-4000-8000-000000000000"
      const VENDOR_URLS: Array<[string, string]> = [
        ["GET",    "/context"],
        ["GET",    "/sections"],
        ["POST",   "/sections"],
        ["PUT",    "/sections/order"],
        ["PATCH",  `/sections/${NOPE}`],
        ["DELETE", `/sections/${NOPE}`],
        ["POST",   "/images/presign"],
        ["DELETE", "/images"],
        ["GET",    "/items"],
        ["POST",   "/items"],
        ["PUT",    "/items/order"],
        ["GET",    `/items/${NOPE}`],
        ["PUT",    `/items/${NOPE}`],
        ["PATCH",  `/items/${NOPE}/archive`],
        ["DELETE", `/items/${NOPE}`],
        ["GET",    "/modifier-groups"],
        ["POST",   "/modifier-groups"],
        ["GET",    `/modifier-groups/${NOPE}`],
        ["PUT",    `/modifier-groups/${NOPE}`],
        ["DELETE", `/modifier-groups/${NOPE}`],
        ["PATCH",  `/modifier-options/${NOPE}/availability`],
        ["PATCH",  `/meals/${NOPE}/availability`],
      ]
      asVendor(vendorA.userId)
      const unrouted: string[] = []
      for (const [method, path] of VENDOR_URLS) {
        const r = await call(method, `/api/vendor/v1/menu${path}`, method === "GET" ? undefined : {})
        if (r.json.status !== "success" && r.json.status !== "error") unrouted.push(`${method} ${path} → ${r.status}`)
      }
      check(`all ${VENDOR_URLS.length} vendor menu URLs are routed at /api/vendor/v1/menu`, unrouted.length === 0, unrouted)

      const ADMIN_URLS: Array<[string, string]> = [
        ["GET",  "/meals"],
        ["GET",  `/meals/${NOPE}`],
        ["POST", `/meals/${NOPE}/approve`],
        ["POST", `/meals/${NOPE}/send-back`],
        ["POST", `/meals/${NOPE}/status`],
        ["POST", `/meals/modifier-groups/${NOPE}/approve`],
        ["POST", `/meals/modifier-groups/${NOPE}/send-back`],
      ]
      asAdmin(admin.id, [AdminPermissions.VENDORS_MEALS_READ, AdminPermissions.VENDORS_MEALS_MODERATE],
        { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" })
      const adminUnrouted: string[] = []
      for (const [method, path] of ADMIN_URLS) {
        const r = await call(method, `/api/admin/v1/vendors${path}`, method === "GET" ? undefined : {})
        if (r.json.status !== "success" && r.json.status !== "error") adminUnrouted.push(`${method} ${path} → ${r.status}`)
      }
      const csv = await call("GET", "/api/admin/v1/vendors/meals/export")
      check(`all ${ADMIN_URLS.length + 1} admin meal URLs are routed at /api/admin/v1/vendors`,
        adminUnrouted.length === 0 && csv.status === 200 && csv.contentType.startsWith("text/csv"),
        { adminUnrouted, csv: [csv.status, csv.contentType] })

      /* …and the gates in front of them are the same ones: a vendor not in
       * ACTIVE is stopped by the vendor module, and a BANNED one earlier. */
      asVendor(vendorA.userId, "BANNED")
      const banned = await call("GET", "/api/vendor/v1/menu/items")
      check("a BANNED vendor is stopped at the vendor v1 gate", banned.status === 403 && banned.json.code === "INVALID_VENDOR_STATE", banned.json)
      vendorCtx = null
      const anon = await call("GET", "/api/vendor/v1/menu/items")
      check("no vendor context at all is a 401", anon.status === 401, anon.json)
      asVendor(vendorA.userId)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 1. vendor authoring\n")

    asVendor(vendorA.userId)
    const created = await call("POST", "/api/vendor/v1/menu/items", body({
      // Principle 7 — none of these may be client-settable.
      adminStatus: "BANNED", isArchived: true, reviewStatus: "FLAGGED", vendorId: vendorB.id,
    }))
    check("create returns 201", created.status === 201, created.json)
    const plate = created.json.data as Json
    const plateId = plate.id as string
    const mealO1 = (plate.outlets as Json[]).find((o) => o.outletId === o1.id)
    const mealO2 = (plate.outlets as Json[]).find((o) => o.outletId === o2.id)

    check("…one Meal row per selected outlet", plate.outlets.length === 2, plate.outlets)
    check("…the override lands on its outlet only", mealO2?.priceMinorOverride === 12000 && mealO1?.priceMinorOverride === null)
    check("…owned by the CALLER, not a vendorId in the body",
      (await prisma.menuItem.findUnique({ where: { id: plateId } }))?.vendorId === vendorA.id)
    check("…moderation/lifecycle fields in the body are ignored",
      plate.adminStatus === "ACTIVE" && plate.isArchived === false && plate.reviewStatus === "AUTO_APPROVED", plate)
    check("…the staged photo is attached as the main image, under its permanent key",
      plate.images?.length === 1
        && plate.images[0].storageKey === plateStaged.replace("meal-uploads/", "meal-images/")
        && plate.mainImageUrl === plate.images[0].url, plate.images)
    // From here on the gallery is identified by the saved original's key.
    plateImages = [plate.images[0].storageKey]
    check("…the tax category is stored", plate.taxCategoryId === hotFood.id)

    /*
     * The response SHAPE is the dashboard's contract. `discounts` is composed
     * at the vendor boundary (offers stay in the vendor module until Phase 6),
     * so this is what proves the composition still lands on every response.
     */
    const keys = (o: unknown) => Object.keys((o ?? {}) as object).sort().join(",")
    const ITEM_KEYS = [
      "adminStatus", "basePriceMinor", "createdAt", "cuisines", "description", "dietaryTags", "discounts",
      "flagReasons", "id", "images", "isArchived", "mainImageUrl",
      "modifierGroups", "name", "outlets", "portionSize", "position", "prepTimeMinutes", "rejectionReason",
      "reviewStatus", "section", "tax", "taxCategory", "taxCategoryId", "updatedAt",
    ].sort().join(",")
    check("create response keeps its exact key set", keys(plate) === ITEM_KEYS, keys(plate))
    check("…outlet rows keep theirs", keys(plate.outlets[0]) === "adminStatus,isAvailable,mealId,outletId,outletName,priceMinorOverride,pricing", keys(plate.outlets[0]))
    check("…discounts is an array on create", Array.isArray(plate.discounts))
    {
      const one  = await call("GET", `/api/vendor/v1/menu/items/${plateId}`)
      const list = await call("GET", "/api/vendor/v1/menu/items?pageSize=5")
      check("GET one keeps the key set", keys(one.json.data) === ITEM_KEYS, keys(one.json.data))
      check("GET list keeps its page envelope", keys(list.json.data) === "items,page,pageSize,total,totalPages", keys(list.json.data))
      check("…and each list item the item key set", keys(list.json.data?.items?.[0]) === ITEM_KEYS, keys(list.json.data?.items?.[0]))
      const ctx = await call("GET", "/api/vendor/v1/menu/context")
      check("GET context keeps its key set",
        keys(ctx.json.data) === "cuisines,currency,dietaryTags,maxCuisines,maxDietaryTags,maxImages,outlets,sections,tax", keys(ctx.json.data))
    }

    // ── validation, asserted on the REASON ──
    const reject = async (label: string, over: Json, status: number, code: string) => {
      // No photos unless the case is about photos: each rejection must be the
      // one the case names, not an image refusal that happens to come first.
      const r = await call("POST", "/api/vendor/v1/menu/items", body({ name: `${MARKER} Invalid`, imageKeys: undefined, ...over }))
      check(label, r.status === status && r.json.code === code, { status: r.status, code: r.json.code })
    }
    await reject("a decimal price is refused",          { basePriceMinor: 99.5 },  400, "INVALID_PRICE")
    await reject("a zero price is refused",             { basePriceMinor: 0 },     400, "INVALID_PRICE")
    await reject("a string price is refused",           { basePriceMinor: "10000" }, 400, "INVALID_PRICE")
    await reject("a decimal override is refused",       { priceOverrides: { [o1.id]: 1.5 } }, 400, "INVALID_PRICE")
    await reject("a blank name is refused",             { name: "  " },            400, "MISSING_FIELDS")
    await reject("no outlet selected is refused",       { outletIds: [] },         400, "NO_OUTLET_SELECTED")
    await reject("omitted outlets with 2 outlets is refused", { outletIds: undefined }, 400, "MISSING_FIELDS")
    await reject("another vendor's outlet 404s",        { outletIds: [oB.id] },    404, "OUTLET_NOT_FOUND")
    await reject("another vendor's staged upload is refused", { imageKeys: [stagedB] }, 403, "FORBIDDEN")
    await reject("…and so is another dish's saved photo, even this vendor's own", { imageKeys: plateImages }, 403, "FORBIDDEN")
    await reject("a tax category the country has not rated is refused",
      { taxCategoryId: grocery.id }, 404, "TAX_CATEGORY_NOT_AVAILABLE")
    {
      const dup = await call("POST", "/api/vendor/v1/menu/items", body({ name: `${MARKER} PLATE`, imageKeys: undefined }))
      check("a duplicate name (any case) is refused", dup.status === 409 && dup.json.code === "DUPLICATE_MEAL_NAME", dup.json)
    }
    {
      asVendor(vendorA.userId, "SUSPENDED")
      const r = await call("GET", "/api/vendor/v1/menu/items")
      check("the ACTIVE state gate is enforced by the router", r.status === 403 && r.json.code === "INVALID_VENDOR_STATE", r.json)
      asVendor(vendorA.userId)
    }

    // ── update + outlet reconciliation ──
    const upd1 = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({
      outletIds: [o2.id], priceOverrides: { [o2.id]: 15000 }, taxCategoryId: undefined,
    }))
    check("update returns 200", upd1.status === 200, upd1.json)
    check("…the response lists only the selected outlet", upd1.json.data?.outlets?.length === 1)
    check("…the override changed", upd1.json.data?.outlets?.[0]?.priceMinorOverride === 15000)
    check("…an ABSENT taxCategoryId leaves the stored one alone", upd1.json.data?.taxCategoryId === hotFood.id)
    const droppedRow = await prisma.meal.findUnique({ where: { id: mealO1!.mealId } })
    check("…the unselected outlet's Meal is SOFT-deleted, not removed", droppedRow !== null && droppedRow.deletedAt !== null)

    {
      const r = await call("PATCH", `/api/vendor/v1/menu/meals/${mealO1!.mealId}/availability`, { isAvailable: false })
      check("availability on a soft-deleted Meal 404s", r.status === 404 && r.json.code === "NOT_FOUND", r.json)
    }

    const upd2 = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({ taxCategoryId: null }))
    const reAdded = (upd2.json.data?.outlets as Json[] | undefined)?.find((o) => o.outletId === o1.id)
    check("re-selecting the outlet RESTORES the same Meal id", reAdded?.mealId === mealO1!.mealId, reAdded)
    check("…an explicit null taxCategoryId clears it", upd2.json.data?.taxCategoryId === null)
    await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body()) // back to the base fixture: o1 + o2 @ 12000, hot food

    // ── tenant isolation ──
    asVendor(vendorB.userId)
    const bCreate = await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} B Dish`, basePriceMinor: 500, outletIds: [oB.id],
    })
    check("vendor B can create in its own menu (single outlet, outletIds optional)", bCreate.status === 201, bCreate.json)
    const bDishId = bCreate.json.data?.id as string

    {
      const r = await call("GET", `/api/vendor/v1/menu/items/${plateId}`)
      check("vendor B cannot READ vendor A's dish (404, not 403)", r.status === 404, r.json)
      const u = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body())
      check("vendor B cannot UPDATE vendor A's dish", u.status === 404, u.json)
      const a = await call("PATCH", `/api/vendor/v1/menu/meals/${mealO2!.mealId}/availability`, { isAvailable: false })
      check("vendor B cannot toggle vendor A's Meal", a.status === 404, a.json)
      const l = await call("GET", "/api/vendor/v1/menu/items?pageSize=100")
      const ids = (l.json.data?.items as Json[] ?? []).map((i) => i.id)
      check("vendor B's list holds only its own dishes", ids.includes(bDishId) && !ids.includes(plateId), ids)
      const lo = await call("GET", `/api/vendor/v1/menu/items?outletId=${o1.id}`)
      check("…and filtering by A's outlet returns nothing", lo.json.data?.total === 0, lo.json.data?.total)
      const d = await call("DELETE", "/api/vendor/v1/menu/images", { storageKey: plateImages[0] })
      check("vendor B cannot discard vendor A's image", d.status === 403 && d.json.code === "FORBIDDEN", d.json)
    }
    asVendor(vendorA.userId)
    {
      const d = await call("DELETE", "/api/vendor/v1/menu/images", { storageKey: plateImages[0] })
      check("an image a saved dish still uses cannot be discarded", d.status === 409 && d.json.code === "IMAGE_IN_USE", d.json)
    }

    // ── option groups — each dish owns its own ──
    console.log("\n  ── 1b. option groups (owned by one dish)\n")
    {
      const G = "/api/vendor/v1/menu/modifier-groups"
      const I = "/api/vendor/v1/menu/items"
      const size = (over: Json = {}): Json => ({
        name: "Size", description: "Pick one", minSelect: 1, maxSelect: 1,
        options: [{ name: "Small", priceDeltaMinor: 0 }, { name: "Large", priceDeltaMinor: 500 }],
        ...over,
      })
      const groupsOf = (res: { json: Json }) => (res.json.data?.modifierGroups ?? []) as Json[]

      // Created THROUGH the dish's own save — the only way a group is written.
      const saved = await call("PUT", `${I}/${plateId}`, body({
        modifierGroups: [size({ reviewStatus: "MANUALLY_APPROVED", flagReasons: [], vendorId: vendorB.id })],
      }))
      const group = groupsOf(saved)[0]!
      check("a dish save creates its group", saved.status === 200 && group?.name === "Size", saved.json)
      check("…attached-group key set",
        keys(group) === "description,flagged,id,maxSelect,minSelect,name,options,position,rejectionReason,required,reviewStatus", keys(group))
      check("…required is derived from minSelect", group.required === true)
      check("…options keep their authored order", (group.options as Json[]).map((o) => o.name).join(",") === "Small,Large")
      check("…moderation fields in the body are ignored", group.reviewStatus === "AUTO_APPROVED")
      check("…owned by the caller", (await prisma.modifierGroup.findUnique({ where: { id: group.id } }))?.vendorId === vendorA.id)
      check("…the customer storefront shows it",
        menuOf(await storefrontOrNull(o1.id)).find((i) => i.id === plateId)?.modifierGroups[0]?.id === group.id)

      const bad = async (label: string, groups: Json[], status: number, code: string) => {
        const r = await call("PUT", `${I}/${plateId}`, body({ modifierGroups: groups }))
        check(label, r.status === status && r.json.code === code, { status: r.status, code: r.json.code })
      }
      await bad("a nameless group is refused", [size({ name: "" })], 400, "MISSING_FIELDS")
      await bad("min above max is refused", [size({ minSelect: 2, maxSelect: 1 })], 400, "INVALID_RULE")
      await bad("a decimal price delta is refused", [size({ options: [{ name: "Odd", priceDeltaMinor: 2.5 }] })], 400, "INVALID_PRICE")
      await bad("two groups with one name on ONE dish are refused", [size({ id: group.id }), size({ name: "size" })], 400, "DUPLICATE_GROUP_NAME")
      await bad("a discounting option that could take the dish to zero is refused",
        [size({ id: group.id }), { name: "Half", minSelect: 0, maxSelect: 1, options: [{ name: "Tiny", priceDeltaMinor: -20000 }] }],
        400, "OPTIONS_ZERO_OUT_DISH")

      // The retired library field and endpoints say so instead of being ignored.
      const legacy = await call("PUT", `${I}/${plateId}`, body({ modifierGroupIds: [group.id] }))
      check("the old modifierGroupIds field is refused, not silently dropped",
        legacy.status === 400 && legacy.json.code === "UNSUPPORTED_FIELD", legacy.json)
      for (const [method, path] of [["POST", G], ["PUT", `${G}/${group.id}`], ["DELETE", `${G}/${group.id}`]] as const) {
        const r = await call(method, path, size())
        check(`${method} ${path.replace(group.id as string, ":id")} answers 410 — groups are saved with their meal`,
          r.status === 410 && r.json.code === "GROUPS_BELONG_TO_MEALS", { status: r.status, code: r.json.code })
      }

      // A save that does not mention the groups leaves them alone.
      const untouched = await call("PUT", `${I}/${plateId}`, body({ description: "A plate, again" }))
      check("a save without modifierGroups keeps the dish's groups", groupsOf(untouched)[0]?.id === group.id, groupsOf(untouched))

      const [small, large] = group.options as Json[]
      const reordered = await call("PUT", `${I}/${plateId}`, body({ modifierGroups: [size({
        id: group.id,
        options: [{ id: large!.id, name: "Large", priceDeltaMinor: 600 }, { id: small!.id, name: "Small", priceDeltaMinor: 0 }],
      })] }))
      const ro = groupsOf(reordered)[0]?.options as Json[] | undefined
      check("editing in place keeps the group id and option ids, and applies order and price",
        groupsOf(reordered)[0]?.id === group.id && ro?.[0]?.id === large!.id && ro?.[1]?.id === small!.id && ro?.[0]?.priceDeltaMinor === 600, ro)

      // The (groupId, name) unique used to break both of these.
      const swapped = await call("PUT", `${I}/${plateId}`, body({ modifierGroups: [size({
        id: group.id,
        options: [{ id: large!.id, name: "Small", priceDeltaMinor: 0 }, { id: small!.id, name: "Large", priceDeltaMinor: 600 }],
      })] }))
      check("swapping two option names saves", swapped.status === 200, swapped.json)
      await call("PUT", `${I}/${plateId}`, body({ modifierGroups: [size({
        id: group.id, options: [{ id: large!.id, name: "Small", priceDeltaMinor: 0 }],
      })] }))
      const readded = await call("PUT", `${I}/${plateId}`, body({ modifierGroups: [size({
        id: group.id,
        options: [{ id: large!.id, name: "Small", priceDeltaMinor: 0 }, { name: "Large", priceDeltaMinor: 700 }],
      })] }))
      const back = (groupsOf(readded)[0]?.options as Json[] | undefined)?.find((o) => o.name === "Large")
      check("re-adding a removed option saves, and brings back the same option id",
        readded.status === 200 && back?.id === small!.id && back?.priceDeltaMinor === 700, readded.json)
      // The fixture from here: Small +0, Large +700.
      const plateGroup = groupsOf(readded)[0]!
      const plateSmall = (plateGroup.options as Json[]).find((o) => o.name === "Small")!
      const plateLarge = (plateGroup.options as Json[]).find((o) => o.name === "Large")!

      check("GET one returns it with its dish", (await call("GET", `${G}/${group.id}`)).json.data?.dish?.id === plateId)
      check("GET list includes it", ((await call("GET", G)).json.data as Json[]).some((g) => g.id === group.id))

      // ── INDEPENDENCE: a copy is its own group, and edits never cross ──
      const copyDish = await call("POST", I, {
        name: `${MARKER} Copy Dish`, basePriceMinor: 8000, outletIds: [o1.id],
        // What the dashboard's "copy" sends: the content, never the ids.
        modifierGroups: [size({ options: [{ name: "Small", priceDeltaMinor: 0 }, { name: "Large", priceDeltaMinor: 250 }] })],
      })
      const copyId = copyDish.json.data?.id as string
      const copyGroup = groupsOf(copyDish)[0]!
      check("a copied group is a NEW group on the other dish",
        copyDish.status === 201 && copyGroup.id !== plateGroup.id && copyGroup.name === "Size", copyDish.json)

      const before = JSON.stringify(groupsOf(await call("GET", `${I}/${plateId}`)))
      const copyBody = (groups: Json[], over: Json = {}): Json => ({
        name: `${MARKER} Copy Dish`, basePriceMinor: 8000, outletIds: [o1.id], modifierGroups: groups, ...over,
      })
      await call("PUT", `${I}/${copyId}`, copyBody([size({
        id: copyGroup.id, name: "Portion", description: "Changed on the copy only",
        options: [{ id: (copyGroup.options as Json[])[1]!.id, name: "Large", priceDeltaMinor: 300 },
                  { id: (copyGroup.options as Json[])[0]!.id, name: "Small", priceDeltaMinor: 0 }],
      })]))
      check("editing the copy leaves the original dish's group exactly as it was",
        JSON.stringify(groupsOf(await call("GET", `${I}/${plateId}`))) === before)

      const firstGroupOn = async (dishId: string) =>
        menuOf(await storefrontOrNull(o1.id)).find((i) => i.id === dishId)?.modifierGroups[0]
      check("…and customers see each dish's own options",
        (await firstGroupOn(plateId))?.name === "Size" && (await firstGroupOn(copyId))?.name === "Portion")

      // The cart prices each dish from ITS options, never from the client.
      const priced = async (dishId: string, optionIds: string[]) =>
        priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: dishId, quantity: 1, selectedOptionIds: optionIds }] })
      const plateWithLarge = await priced(plateId, [plateLarge.id as string])
      const plateWithSmall = await priced(plateId, [plateSmall.id as string])
      check("the cart prices the plate's Large at the plate's own +700",
        plateWithLarge.lines[0]!.totalMinor - plateWithSmall.lines[0]!.totalMinor === 700,
        [plateWithLarge.lines[0], plateWithSmall.lines[0]])
      const crossed = await priced(copyId, [plateLarge.id as string, (copyGroup.options as Json[])[0]!.id as string])
      check("…and refuses the plate's option on the copy dish",
        crossed.problems.some((p) => p.code === "OPTION_NOT_ON_ITEM") && !crossed.canCheckout, crossed.problems)

      // The isolation guarantee, attacked directly.
      const hijack = await call("PUT", `${I}/${copyId}`, copyBody([size({ id: plateGroup.id, name: "Hijacked" })]))
      check("another dish's group id is refused (404 GROUP_NOT_FOUND)", hijack.status === 404 && hijack.json.code === "GROUP_NOT_FOUND", hijack.json)
      const optHijack = await call("PUT", `${I}/${copyId}`, copyBody([size({
        id: copyGroup.id, name: "Portion", options: [{ id: plateLarge.id, name: "Stolen", priceDeltaMinor: 1 }],
      })]))
      check("another group's option id is refused (404 OPTION_NOT_FOUND)", optHijack.status === 404 && optHijack.json.code === "OPTION_NOT_FOUND", optHijack.json)
      check("…and the plate's group is untouched by either attempt",
        JSON.stringify(groupsOf(await call("GET", `${I}/${plateId}`))) === before)

      // A price cut alone is checked against the groups already on the dish.
      await call("PUT", `${I}/${copyId}`, copyBody([
        { name: "Half", minSelect: 0, maxSelect: 1, options: [{ name: "Half portion", priceDeltaMinor: -5000 }] },
      ]))
      const cut = await call("PUT", `${I}/${copyId}`, { name: `${MARKER} Copy Dish`, basePriceMinor: 4000, outletIds: [o1.id] })
      check("cutting the price under an existing discounting option is refused even when groups are not resent",
        cut.status === 400 && cut.json.code === "OPTIONS_ZERO_OUT_DISH", cut.json)
      check("…and replacing the copy's groups soft-deleted the old one",
        (await prisma.modifierGroup.findUnique({ where: { id: copyGroup.id } }))?.deletedAt != null)

      const offSmall = await call("PATCH", `/api/vendor/v1/menu/modifier-options/${plateSmall.id}/availability`, { isAvailable: false })
      check("an option can be 86'd", offSmall.status === 200 && offSmall.json.data?.isAvailable === false, offSmall.json)
      const offLarge = await call("PATCH", `/api/vendor/v1/menu/modifier-options/${plateLarge.id}/availability`, { isAvailable: false })
      check("…but not the last one a required group has", offLarge.status === 409 && offLarge.json.code === "REQUIRED_GROUP_UNSATISFIABLE", offLarge.json)
      const nonBool = await call("PATCH", `/api/vendor/v1/menu/modifier-options/${plateSmall.id}/availability`, { isAvailable: 1 })
      check("…and a non-boolean is refused", nonBool.status === 400 && nonBool.json.code === "MISSING_FIELDS", nonBool.json)
      await call("PATCH", `/api/vendor/v1/menu/modifier-options/${plateSmall.id}/availability`, { isAvailable: true })

      asVendor(vendorB.userId)
      check("vendor B cannot read A's group", (await call("GET", `${G}/${plateGroup.id}`)).status === 404)
      check("…or 86 one of its options", (await call("PATCH", `/api/vendor/v1/menu/modifier-options/${plateSmall.id}/availability`, { isAvailable: false })).status === 404)
      const steal = await call("PUT", `${I}/${bDishId}`, {
        name: `${MARKER} B Dish`, basePriceMinor: 500, outletIds: [oB.id], modifierGroups: [size({ id: plateGroup.id })],
      })
      check("…or put it on its own dish", steal.status === 404 && steal.json.code === "GROUP_NOT_FOUND", steal.json)
      check("…and B's group list does not include it", !((await call("GET", G)).json.data as Json[]).some((g) => g.id === plateGroup.id))
      asVendor(vendorA.userId)

      const cleared = await call("PUT", `${I}/${plateId}`, body({ modifierGroups: [] }))
      check("an empty list removes the dish's groups", cleared.status === 200 && groupsOf(cleared).length === 0, groupsOf(cleared))
      check("…and the removed group is gone from reads", (await call("GET", `${G}/${plateGroup.id}`)).status === 404)
      await call("DELETE", `${I}/${copyId}`)
    }

    // ── portion size is customer-visible text, so it is screened ──
    {
      const P = `/api/vendor/v1/menu/items/${plateId}`
      const flagged = (await call("PUT", P, body({ portionSize: "Shit portion" }))).json.data as Json
      check("an inappropriate portion size flags the dish for review (INAPPROPRIATE_PORTION)",
        flagged?.reviewStatus === "FLAGGED" && (flagged.flagReasons as string[]).includes("INAPPROPRIATE_PORTION"), flagged?.flagReasons)
      const clean = (await call("PUT", P, body({ portionSize: "Serves 2" }))).json.data as Json
      check("…and rewording it re-screens the dish clean, storing the text as typed",
        clean?.reviewStatus === "AUTO_APPROVED" && clean.portionSize === "Serves 2" && !(clean.flagReasons as string[]).length, clean?.flagReasons)
      await call("PUT", P, body())
    }

    // ── images ──
    console.log("\n  ── 1c. image presign / discard\n")
    {
      const P = "/api/vendor/v1/menu/images/presign"
      const ok = await call("POST", P, { contentType: "image/jpeg", fileSize: 1000 })
      const key = ok.json.data?.storageKey as string | undefined
      check("presign returns a vendor-scoped STAGING key and an upload URL",
        ok.status === 200 && keys(ok.json.data) === "storageKey,uploadUrl"
          && !!key && key.startsWith(`meal-uploads/${vendorA.id}/`) && key.endsWith(".jpg")
          && typeof ok.json.data.uploadUrl === "string" && ok.json.data.uploadUrl.startsWith("https://"), ok.json)
      const pdf = await call("POST", P, { contentType: "application/pdf", fileSize: 1000 })
      check("…a non-image type is refused", pdf.status === 400 && pdf.json.code === "UNSUPPORTED_MEDIA_TYPE", pdf.json)
      const big = await call("POST", P, { contentType: "image/png", fileSize: 6 * 1024 * 1024 })
      check("…an oversized file is refused", big.status === 400 && big.json.code === "FILE_TOO_LARGE", big.json)
      const none = await call("POST", P, {})
      check("…a missing type is refused", none.status === 400 && none.json.code === "MISSING_FIELDS", none.json)
      const shown = (await call("GET", `/api/vendor/v1/menu/items/${plateId}`)).json.data as Json
      check("a saved dish's image comes back as its PUBLIC master, keyed by its original",
        shown.images?.[0]?.storageKey === plateImages[0]
          && shown.images[0].url === publicMediaStorage.publicUrl((await prisma.menuItemImage.findUnique({ where: { originalKey: plateImages[0]! } }))!.imageKey)
          && !shown.images[0].url.includes("X-Amz-") && shown.mainImageUrl === shown.images[0].url, shown.images)
      check("…with its dimensions and blur placeholder",
        keys(shown.images[0]) === "blurDataUrl,height,storageKey,url,width"
          && shown.images[0].width === 1200 && shown.images[0].height === 900
          && String(shown.images[0].blurDataUrl).startsWith("data:image/webp;base64,"), shown.images[0])
      const staged = await stageUpload(vendorA.userId, await photo(800, 800))
      const discard = await call("DELETE", "/api/vendor/v1/menu/images", { storageKey: staged })
      check("an unsaved (staged) upload of one's own can be discarded",
        discard.status === 200 && discard.json.data?.discarded === true && !(await R2Service.objectExists(staged)), discard.json)
    }

    // ── the real R2 image pipeline ──
    console.log("\n  ── 1d. image pipeline: staging → validate → process → publish\n")
    {
      const I = "/api/vendor/v1/menu/items"
      const rowsOf = (menuItemId: string) =>
        prisma.menuItemImage.findMany({ where: { menuItemId }, orderBy: { position: "asc" } })
      const anon = (url: string) => fetch(url)
      const gone = async (row: { imageKey: string; originalKey: string }) =>
        (await anon(publicMediaStorage.publicUrl(row.imageKey))).status !== 200 && !(await R2Service.objectExists(row.originalKey))

      const big   = await stageUpload(vendorA.userId, await photo(2400, 1800, { exif: true }))
      const small = await stageUpload(vendorA.userId, await photo(800, 700, { format: "png" }), "image/png")
      const photoBody = (imageKeys: string[]): Json => ({
        name: `${MARKER} Photo`, basePriceMinor: 3000, outletIds: [o1.id], imageKeys,
      })
      const created = await call("POST", I, photoBody([big, small]))
      check("a dish saves with two staged photos", created.status === 201, created.json)
      const dishId = created.json.data?.id as string
      const rows = await rowsOf(dishId)
      check("…one MenuItemImage row each, in order, main first",
        rows.length === 2 && rows[0]!.position === 0 && rows[1]!.position === 1
          && rows.every((r) => r.menuItemId === dishId)
          && rows[0]!.originalKey === big.replace("meal-uploads/", "meal-images/")
          && rows[1]!.originalKey === small.replace("meal-uploads/", "meal-images/"), rows)
      check("…the permanent private originals exist and the staging uploads are cleared",
        (await R2Service.objectExists(rows[0]!.originalKey)) && (await R2Service.objectExists(rows[1]!.originalKey))
          && !(await R2Service.objectExists(big)) && !(await R2Service.objectExists(small)))

      const master = await anon(publicMediaStorage.publicUrl(rows[0]!.imageKey))
      const bytes = Buffer.from(await master.arrayBuffer())
      const meta = await sharp(bytes).metadata()
      check("the public master is fetchable ANONYMOUSLY", master.status === 200, master.status)
      check("…served immutable and long-cached", (master.headers.get("cache-control") ?? "").includes("immutable"),
        master.headers.get("cache-control"))
      check("…is WebP, fitted to 1600px on the long edge, aspect kept",
        meta.format === "webp" && meta.width === 1600 && meta.height === 1200, { format: meta.format, w: meta.width, h: meta.height })
      check("…and carries NO EXIF — no camera, no GPS position", meta.exif === undefined && meta.orientation === undefined,
        { exif: !!meta.exif })
      check("…its stored dimensions match the bytes", rows[0]!.width === 1600 && rows[0]!.height === 1200)
      check("…and a blur placeholder is stored", rows[0]!.blurDataUrl.startsWith("data:image/webp;base64,"))
      const smallMeta = await sharp(Buffer.from(await (await anon(publicMediaStorage.publicUrl(rows[1]!.imageKey))).arrayBuffer())).metadata()
      check("a smaller source is NOT upscaled", smallMeta.width === 800 && smallMeta.height === 700 && rows[1]!.width === 800,
        { w: smallMeta.width, h: smallMeta.height })

      // ── the customer gets the public master, never the original ──
      const onMenu = menuOf(await storefrontOrNull(o1.id)).find((i) => i.id === dishId)
      check("the customer receives the public master with its size and blur",
        onMenu?.image?.url === publicMediaStorage.publicUrl(rows[0]!.imageKey)
          && onMenu.image.width === 1600 && onMenu.image.height === 1200
          && onMenu.image.blurDataUrl === rows[0]!.blurDataUrl && onMenu.images.length === 2, onMenu?.image)
      const customerJson = JSON.stringify(onMenu)
      check("…and nothing that points at a private original or a signed link",
        !customerJson.includes("meal-images/") && !customerJson.includes("meal-uploads/") && !customerJson.includes("X-Amz-"))

      // ── reorder: positions only, no reprocessing ──
      const [k0, k1] = rows.map((r) => r.originalKey) as [string, string]
      const reordered = await call("PUT", `${I}/${dishId}`, photoBody([k1, k0]))
      const after = await rowsOf(dishId)
      check("reordering swaps positions without reprocessing",
        reordered.status === 200 && after[0]!.id === rows[1]!.id && after[1]!.id === rows[0]!.id
          && after[0]!.imageKey === rows[1]!.imageKey && after[1]!.imageKey === rows[0]!.imageKey, after)
      check("…and the new first photo is the main image", reordered.json.data?.mainImageUrl === publicMediaStorage.publicUrl(rows[1]!.imageKey))
      let dupPosition = ""
      try {
        await prisma.menuItemImage.create({
          data: { menuItemId: dishId, position: 0, originalKey: `${MARKER}-x`, imageKey: `${MARKER}-x`, width: 1, height: 1, blurDataUrl: "" },
        })
      } catch (err) { dupPosition = (err as { code?: string }).code ?? "" }
      check("the database refuses two images at one position", dupPosition === "P2002", dupPosition)

      // ── replacement: new keys, old objects gone ──
      const fresh = await stageUpload(vendorA.userId, await photo(1000, 1000))
      const replaced = await call("PUT", `${I}/${dishId}`, photoBody([k1, fresh]))
      const now3 = await rowsOf(dishId)
      const newRow = now3.find((r) => r.originalKey === fresh.replace("meal-uploads/", "meal-images/"))
      check("replacing a photo writes a NEW public key and URL",
        replaced.status === 200 && now3.length === 2 && !!newRow
          && newRow.imageKey !== rows[0]!.imageKey && newRow.imageKey !== rows[1]!.imageKey, now3)
      check("…the replaced row is gone", !now3.some((r) => r.id === rows[0]!.id))
      check("…and its public master and private original are deleted", await gone(rows[0]!))

      // ── limits and bad input ──
      const seven = Array.from({ length: 7 }, (_, i) => `meal-uploads/${vendorA.id}/${MARKER}-${i}.jpg`)
      const tooMany = await call("PUT", `${I}/${dishId}`, photoBody(seven))
      check("more than 6 photos is refused", tooMany.status === 400 && tooMany.json.code === "TOO_MANY_IMAGES", tooMany.json)
      const dup = await call("PUT", `${I}/${dishId}`, photoBody([k1, k1]))
      check("the same photo twice is refused", dup.status === 400 && dup.json.code === "DUPLICATE_IMAGE", dup.json)

      const notImage = await stageUpload(vendorA.userId, Buffer.from("<html><script>alert(1)</script></html>"), "image/jpeg")
      const bad = await call("PUT", `${I}/${dishId}`, photoBody([k1, notImage]))
      check("bytes that only CLAIM to be a JPEG are refused on save",
        bad.status === 400 && bad.json.code === "UNSUPPORTED_MEDIA_TYPE", bad.json)
      check("…the rejected upload is cleaned up and the dish is untouched",
        !(await R2Service.objectExists(notImage)) && JSON.stringify(await rowsOf(dishId)) === JSON.stringify(now3))

      const tiny = await stageUpload(vendorA.userId, await photo(500, 400))
      const tooSmall = await call("PUT", `${I}/${dishId}`, photoBody([k1, tiny]))
      check("a photo under 600px on its short edge is refused", tooSmall.status === 400 && tooSmall.json.code === "IMAGE_TOO_SMALL", tooSmall.json)

      /* A decompression bomb in miniature: ~42 megapixels of flat colour
       * compresses to a few hundred KB — well under the byte limit — and would
       * decode to over 120 MB of raw pixels. The pixel ceiling is what stops it. */
      const huge = await stageUpload(vendorA.userId, await photo(7000, 6000, { format: "png" }), "image/png")
      const tooManyPixels = await call("PUT", `${I}/${dishId}`, photoBody([k1, huge]))
      check("an image over 40 megapixels is refused, however few bytes it is",
        tooManyPixels.status === 400 && tooManyPixels.json.code === "IMAGE_TOO_LARGE", tooManyPixels.json)

      /* The ACTUAL stored size is what counts: the browser declared 1 KB and
       * uploaded 6 MB. The presigned PUT does not hold it to the claim, so the
       * server's HEAD has to. */
      const lying = await stageUpload(vendorA.userId, Buffer.alloc(6 * 1024 * 1024, 7), "image/jpeg", 1024)
      const oversize = await call("PUT", `${I}/${dishId}`, photoBody([k1, lying]))
      check("an upload larger than declared is refused by its REAL size",
        oversize.status === 400 && oversize.json.code === "FILE_TOO_LARGE", oversize.json)
      check("…and removed from staging", !(await R2Service.objectExists(lying)))

      // ── ownership ──
      const foreign = await call("PUT", `${I}/${dishId}`, photoBody([k1, stagedB]))
      check("vendor A cannot attach vendor B's staged upload", foreign.status === 403 && foreign.json.code === "FORBIDDEN", foreign.json)
      asVendor(vendorB.userId)
      const steal = await call("PUT", `${I}/${bDishId}`, { name: `${MARKER} B Dish`, basePriceMinor: 500, outletIds: [oB.id], imageKeys: [k1] })
      check("vendor B cannot attach vendor A's saved photo to its own dish", steal.status === 403 && steal.json.code === "FORBIDDEN", steal.json)
      const bDiscard = await call("DELETE", "/api/vendor/v1/menu/images", { storageKey: k1 })
      check("…or discard it", bDiscard.status === 403 && bDiscard.json.code === "FORBIDDEN", bDiscard.json)
      asVendor(vendorA.userId)

      // ── lifecycle keeps images ──
      const beforeLifecycle = JSON.stringify(await rowsOf(dishId))
      await call("PATCH", `${I}/${dishId}/archive`, { isArchived: true })
      check("archiving keeps every image row and object",
        JSON.stringify(await rowsOf(dishId)) === beforeLifecycle && (await R2Service.objectExists(k1)))
      await call("PATCH", `${I}/${dishId}/archive`, { isArchived: false })
      check("restoring needs no reprocessing — same rows, same public keys",
        JSON.stringify(await rowsOf(dishId)) === beforeLifecycle)
      await call("DELETE", `${I}/${dishId}`)
      const afterDelete = await rowsOf(dishId)
      check("soft-deleting keeps every image row and object",
        JSON.stringify(afterDelete) === beforeLifecycle && (await R2Service.objectExists(k1))
          && (await anon(publicMediaStorage.publicUrl(afterDelete[0]!.imageKey))).status === 200)
      const deletedDiscard = await call("DELETE", "/api/vendor/v1/menu/images", { storageKey: k1 })
      check("a deleted dish's photo still cannot be discarded as a loose upload",
        deletedDiscard.status === 409 && deletedDiscard.json.code === "IMAGE_IN_USE", deletedDiscard.json)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. availability\n")

    {
      const bad = await call("PATCH", `/api/vendor/v1/menu/meals/${mealO1!.mealId}/availability`, { isAvailable: "no" })
      check("a non-boolean is refused", bad.status === 400 && bad.json.code === "MISSING_FIELDS", bad.json)

      const off = await call("PATCH", `/api/vendor/v1/menu/meals/${mealO1!.mealId}/availability`, { isAvailable: false })
      check("the owner can 86 a dish at one outlet", off.status === 200 && off.json.data?.isAvailable === false, off.json)
      const rows = await prisma.meal.findMany({ where: { menuItemId: plateId }, select: { outletId: true, isAvailable: true } })
      check("…only at that outlet",
        rows.find((r) => r.outletId === o1.id)?.isAvailable === false && rows.find((r) => r.outletId === o2.id)?.isAvailable === true, rows)

      const shown = menuOf(await storefrontOrNull(o1.id)).find((i) => i.id === plateId)
      check("…the customer still SEES it, greyed", shown?.isAvailable === false && shown?.unavailableReason === "OUT_OF_STOCK", shown)
      const other = menuOf(await storefrontOrNull(o2.id)).find((i) => i.id === plateId)
      check("…and it is still available at the other outlet", other?.isAvailable === true, other)

      const cart = await priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: plateId, quantity: 1, selectedOptionIds: [] }] })
      check("…and the cart refuses it", cart.problems.some((p) => p.code === "ITEM_UNAVAILABLE") && !cart.canCheckout, cart.problems)

      await call("PATCH", `/api/vendor/v1/menu/meals/${mealO1!.mealId}/availability`, { isAvailable: true })
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. admin moderation\n")

    const READ = AdminPermissions.VENDORS_MEALS_READ
    const MOD  = AdminPermissions.VENDORS_MEALS_MODERATE
    const SCOPE_A: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" }
    const SCOPE_B: AdminScopeContext = { isGlobal: false, countryIds: [countryB.id], cityIds: [], tier: "COUNTRY" }

    await prisma.menuItem.update({ where: { id: plateId }, data: { reviewStatus: "FLAGGED", flagReasons: ["INAPPROPRIATE_NAME"] } })

    asAdmin(admin.id, [], SCOPE_A)
    {
      const r = await call("GET", `/api/admin/v1/vendors/meals/${plateId}`)
      check("no meals permission → 403 at the route", r.status === 403 && r.json.code === "FORBIDDEN", r.json)
    }
    asAdmin(admin.id, [READ], SCOPE_A)
    {
      const r = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/approve`)
      check("read-only cannot moderate → 403", r.status === 403, r.json)
      const g = await call("GET", `/api/admin/v1/vendors/meals/${plateId}`)
      check("read permission in scope can read", g.status === 200 && g.json.data?.id === plateId, g.json)
    }
    asAdmin(admin.id, [READ, MOD], SCOPE_B)
    {
      const g = await call("GET", `/api/admin/v1/vendors/meals/${plateId}`)
      check("out-of-scope READ is a 404, never a 403", g.status === 404 && g.json.code === "NOT_FOUND", g.json)
      const a = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/approve`)
      check("out-of-scope APPROVE is a 404", a.status === 404, a.json)
      const s = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "SUSPENDED", reason: "x" })
      check("out-of-scope SUSPEND is a 404", s.status === 404, s.json)
      const l = await call("GET", `/api/admin/v1/vendors/meals?vendor=${vendorA.id}`)
      check("a vendor filter cannot widen scope — zero rows", l.status === 200 && l.json.data?.total === 0, l.json.data?.total)
      const own = await call("GET", "/api/admin/v1/vendors/meals?pageSize=100")
      const ownIds = (own.json.data?.items as Json[] ?? []).map((i) => i.id)
      check("…while its own country's dish is listed", ownIds.includes(bDishId) && !ownIds.includes(plateId))
    }

    const hiddenWhileFlagged = !menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === plateId)
    check("a FLAGGED dish is hidden from customers", hiddenWhileFlagged)

    asAdmin(admin.id, [READ, MOD], SCOPE_A)
    {
      const a = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/approve`)
      check("approve in scope → MANUALLY_APPROVED", a.status === 200 && a.json.data?.reviewStatus === "MANUALLY_APPROVED", a.json)
      check("…and the customer sees it again", menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === plateId))
      const note = await prisma.vendorNotification.findFirst({ where: { vendorId: vendorA.id, type: "MEAL_APPROVED" } })
      check("…the vendor is notified", note !== null)

      const sbNo = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/send-back`, {})
      check("send-back without a reason is refused", sbNo.status === 400 && sbNo.json.code === "REASON_REQUIRED", sbNo.json)
      const sb = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/send-back`, { reason: "Photo is blurry" })
      check("send-back → MANUALLY_REJECTED with the reason", sb.json.data?.reviewStatus === "MANUALLY_REJECTED" && sb.json.data?.rejectionReason === "Photo is blurry", sb.json)
      check("…hidden from customers", !menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === plateId))

      /* Principle 9: the vendor's next TEXT edit re-screens and re-queues it
       * with no admin action. */
      asVendor(vendorA.userId)
      const edit = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({ description: "A better plate" }))
      check("a vendor text edit clears the send-back (principle 9)",
        edit.json.data?.reviewStatus === "AUTO_APPROVED" && edit.json.data?.rejectionReason === null, edit.json.data?.reviewStatus)

      const sNo = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "SUSPENDED" })
      check("suspend without a reason is refused", sNo.status === 400 && sNo.json.code === "REASON_REQUIRED", sNo.json)
      const sBad = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "DELETED", reason: "x" })
      check("an unknown status is refused", sBad.status === 400 && sBad.json.code === "INVALID_STATUS", sBad.json)
      const s = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "SUSPENDED", reason: "Health complaint" })
      check("suspend in scope → SUSPENDED", s.json.data?.adminStatus === "SUSPENDED", s.json)
      check("…hidden from customers", !menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === plateId))

      const ban = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "BANNED", reason: "Repeated" })
      check("ban → BANNED, suspension marker cleared", ban.json.data?.adminStatus === "BANNED" && ban.json.data?.adminSuspendedAt === null, ban.json.data)
      const vEdit = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body())
      check("…the vendor can no longer edit a banned dish", vEdit.status === 403 && vEdit.json.code === "MEAL_BANNED", vEdit.json)

      const back = await call("POST", `/api/admin/v1/vendors/meals/${plateId}/status`, { status: "ACTIVE" })
      check("unban → ACTIVE (no reason needed)", back.json.data?.adminStatus === "ACTIVE", back.json)

      /*
       * Drained, then polled. The drain used to be a no-op (the writer and
       * drainAuditQueue kept separate lists — fixed in Phase 10, unit-tested
       * in audit.queue.test.ts); the bounded poll stays as a belt for slow
       * writes. Five audited actions are expected.
       */
      await drainAuditQueue()
      const readAudit = () => prisma.auditLog.findMany({
        where : { entityType: "MenuItem", entityId: plateId },
        select: { action: true, adminUserId: true },
      })
      let actions = await readAudit()
      for (let i = 0; i < 30 && actions.length < 5; i++) {
        await new Promise((r) => setTimeout(r, 100))
        actions = await readAudit()
      }
      const names = actions.map((a) => a.action)
      check("every moderation write is audited",
        ["menu_item.approved", "menu_item.sent_back", "menu_item.suspended", "menu_item.banned", "menu_item.unbanned"]
          .every((a) => names.includes(a)), names)
      check("…attributed to the acting admin", actions.every((a) => a.adminUserId === admin.id))
      check("…and refused actions wrote nothing", !names.some((n) => n.includes("deleted")) && names.length === 5, names)
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 4. customer visibility\n")

    asVendor(vendorA.userId)
    // A second dish at o1 only, so dish-level rules can be flipped while the
    // outlet itself stays visible.
    const probe = (await call("POST", "/api/vendor/v1/menu/items", {
      name: `${MARKER} Probe`, basePriceMinor: 4000, outletIds: [o1.id],
    })).json.data as Json
    const probeMealId = (probe.outlets as Json[])[0]!.mealId as string

    const cityIds = async () => ((await discoverCityOutlets(`${MARKER}-city`, {}))?.outlets ?? []).map((o) => o.outletId)

    check("baseline: outlet one is in the storefront", (await storefrontOrNull(o1.id)) !== null)
    check("baseline: …and in city browse", (await cityIds()).includes(o1.id))
    check("baseline: the probe dish is on its menu", menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === probe.id))

    /** Flip one fact, assert the OUTLET disappears everywhere, restore it. */
    async function outletHiddenWhen(label: string, apply: () => Promise<unknown>, restore: () => Promise<unknown>) {
      await apply(); clearOperatingCityCache()
      try {
        const sf = await storefrontOrNull(o1.id)
        const ids = await cityIds()
        let cartRefused = false
        try { await priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: probe.id, quantity: 1, selectedOptionIds: [] }] }) }
        catch (err) { cartRefused = (err as { code?: string }).code === "OUTLET_NOT_FOUND" }
        check(`${label} → storefront 404, not in city browse, cart refused`, sf === null && !ids.includes(o1.id) && cartRefused,
          { storefront: sf !== null, inBrowse: ids.includes(o1.id), cartRefused })
      } finally { await restore(); clearOperatingCityCache() }
    }

    const v  = (data: Json) => () => prisma.vendorAccount.update({ where: { id: vendorA.id }, data })
    const vp = (data: Json) => () => prisma.vendorProfile.update({ where: { vendorAccountId: vendorA.id }, data })
    const ol = (data: Json) => () => prisma.outlet.update({ where: { id: o1.id }, data })

    await outletHiddenWhen("inactive vendor (SUSPENDED)", v({ status: "SUSPENDED" }), v({ status: "ACTIVE" }))
    await outletHiddenWhen("deleted vendor", v({ deletedAt: new Date() }), v({ deletedAt: null }))
    await outletHiddenWhen("unpublished vendor", vp({ isPublished: false }), vp({ isPublished: true }))
    await outletHiddenWhen("vendor profile not approved", vp({ reviewStatus: "FLAGGED" }), vp({ reviewStatus: "AUTO_APPROVED" }))
    await outletHiddenWhen("inactive outlet (SUSPENDED)", ol({ adminStatus: "SUSPENDED" }), ol({ adminStatus: "ACTIVE" }))
    await outletHiddenWhen("outlet suspended for compliance", ol({ adminStatus: "SUSPENDED_COMPLIANCE" }), ol({ adminStatus: "ACTIVE" }))
    await outletHiddenWhen("disabled outlet", ol({ vendorDisabledAt: new Date() }), ol({ vendorDisabledAt: null }))
    await outletHiddenWhen("deleted outlet", ol({ deletedAt: new Date() }), ol({ deletedAt: null }))
    await outletHiddenWhen("uncleared outlet", ol({ clearanceStatus: "PENDING_DOCUMENTS" }), ol({ clearanceStatus: "CLEARED" }))
    await outletHiddenWhen("outlet review not approved", ol({ reviewStatus: "FLAGGED" }), ol({ reviewStatus: "AUTO_APPROVED" }))
    await outletHiddenWhen("temporarily closed outlet", ol({ isTemporarilyClosed: true }), ol({ isTemporarilyClosed: false }))
    await outletHiddenWhen("outlet in a non-selling zone", ol({ zoneId: dormant.id }), ol({ zoneId: trading.id }))
    await outletHiddenWhen("country not open to customers",
      () => prisma.country.update({ where: { id: countryA.id }, data: { readyForCustomerOperations: false } }),
      () => prisma.country.update({ where: { id: countryA.id }, data: { readyForCustomerOperations: true } }))

    /** Flip one fact, assert the DISH disappears (outlet stays), restore it. */
    async function dishHiddenWhen(label: string, apply: () => Promise<unknown>, restore: () => Promise<unknown>) {
      await apply()
      try {
        const menu = menuOf(await storefrontOrNull(o1.id))
        const cart = await priceCustomerCart({ outletId: o1.id, lines: [{ menuItemId: probe.id, quantity: 1, selectedOptionIds: [] }] })
        check(`${label} → off the menu, cart says ITEM_UNAVAILABLE, outlet still listed`,
          menu.length > 0 && !menu.some((i) => i.id === probe.id)
            && cart.problems.some((p) => p.code === "ITEM_UNAVAILABLE" && p.menuItemId === probe.id),
          { menu: menu.map((i) => i.name), problems: cart.problems })
      } finally { await restore() }
    }

    const ml = (data: Json) => () => prisma.meal.update({ where: { id: probeMealId }, data })
    const mi = (data: Json) => () => prisma.menuItem.update({ where: { id: probe.id }, data })

    await dishHiddenWhen("inactive Meal (SUSPENDED)", ml({ adminStatus: "SUSPENDED" }), ml({ adminStatus: "ACTIVE" }))
    await dishHiddenWhen("banned Meal", ml({ adminStatus: "BANNED" }), ml({ adminStatus: "ACTIVE" }))
    await dishHiddenWhen("deleted Meal", ml({ deletedAt: new Date() }), ml({ deletedAt: null }))
    await dishHiddenWhen("archived MenuItem", mi({ isArchived: true }), mi({ isArchived: false }))
    await dishHiddenWhen("deleted MenuItem", mi({ deletedAt: new Date() }), mi({ deletedAt: null }))
    await dishHiddenWhen("inactive MenuItem (SUSPENDED)", mi({ adminStatus: "SUSPENDED" }), mi({ adminStatus: "ACTIVE" }))
    await dishHiddenWhen("unapproved MenuItem (FLAGGED)", mi({ reviewStatus: "FLAGGED" }), mi({ reviewStatus: "AUTO_APPROVED" }))
    await dishHiddenWhen("rejected MenuItem", mi({ reviewStatus: "MANUALLY_REJECTED" }), mi({ reviewStatus: "AUTO_APPROVED" }))

    {
      // The outlet's LAST sellable dish going away removes the outlet too —
      // SELLABLE_OUTLET_WHERE requires `meals: { some: … }`.
      await prisma.meal.updateMany({ where: { outletId: o1.id }, data: { adminStatus: "SUSPENDED" } })
      check("an outlet with nothing sellable is not listed at all", (await storefrontOrNull(o1.id)) === null && !(await cityIds()).includes(o1.id))
      await prisma.meal.updateMany({ where: { outletId: o1.id }, data: { adminStatus: "ACTIVE" } })
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 4b. vendor lifecycle: archive, delete, per-outlet availability\n")
    {
      asVendor(vendorA.userId)
      const I = "/api/vendor/v1/menu/items"
      const o3 = await makeOutlet(vendorA.id, cityA.id, trading.id, "Outlet Three")
      clearOperatingCityCache()

      /* A dish carrying every relationship a lifecycle action could damage:
       * three outlets, a local price, a modifier group, a photo and a place
       * in a meal plan. */
      // The dish's own group. Sent without an id on create; every later
      // full-form save sends it back by id, as the dashboard does.
      let lcGroups: Json[] = [{ name: "Sauce", minSelect: 0, maxSelect: 1, options: [{ name: "Chilli", priceDeltaMinor: 0 }] }]
      // Created with a staged photo; every later full-form save sends it back
      // by its saved original's key.
      let lcImages = [await stageUpload(vendorA.userId, await photo(900, 900))]
      const lcBody = (over: Json = {}): Json => ({
        name: `${MARKER} Lifecycle`, basePriceMinor: 7000, imageKeys: lcImages,
        outletIds: [o1.id, o2.id, o3.id], priceOverrides: { [o2.id]: 9000 }, modifierGroups: lcGroups,
        ...over,
      })
      const lc = (await call("POST", I, lcBody())).json.data as Json
      lcImages = (lc.images as Json[]).map((i) => i.storageKey as string)
      lcGroups = lc.modifierGroups as Json[]
      const mealOf = (outletId: string) => (lc.outlets as Json[]).find((o) => o.outletId === outletId)!.mealId as string
      const plan = await prisma.mealPlan.create({
        data: { outletId: o1.id, name: `${MARKER} LC Plan`, meals: { create: { mealId: mealOf(o1.id) } } },
      })

      /** Everything the dish references, straight from the database. */
      const relations = async () => {
        const meals = await prisma.meal.findMany({
          where  : { menuItemId: lc.id },
          orderBy: { outletId: "asc" },
          select : { id: true, outletId: true, deletedAt: true, isAvailable: true, priceMinorOverride: true },
        })
        return JSON.stringify({
          meals,
          planLinks: await prisma.mealPlanMeal.count({ where: { mealPlanId: plan.id } }),
          groups   : await prisma.menuItemModifierGroup.count({ where: { menuItemId: lc.id } }),
          images   : await prisma.menuItemImage.findMany({
            where: { menuItemId: lc.id }, orderBy: { position: "asc" },
            select: { id: true, position: true, originalKey: true, imageKey: true },
          }),
        })
      }
      const before = await relations()
      const onMenu = async (outletId: string) => menuOf(await storefrontOrNull(outletId)).find((i) => i.id === lc.id)
      const cartProblem = async () => (await priceCustomerCart({
        outletId: o1.id, lines: [{ menuItemId: lc.id, quantity: 1, selectedOptionIds: [] }],
      })).problems.some((p) => p.code === "ITEM_UNAVAILABLE" && p.menuItemId === lc.id)

      check("baseline: the dish sells at all three outlets",
        !!(await onMenu(o1.id)) && !!(await onMenu(o2.id)) && !!(await onMenu(o3.id)))

      // ── archive ──
      const bad = await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: "yes" })
      check("archive needs a boolean", bad.status === 400 && bad.json.code === "MISSING_FIELDS", bad.json)
      const arch = await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: true })
      check("archive succeeds", arch.status === 200 && keys(arch.json.data) === "id,isArchived" && arch.json.data.isArchived === true, arch.json)
      const again = await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: true })
      check("…and is idempotent", again.status === 200 && again.json.data?.isArchived === true, again.json)
      check("…off every customer menu", !(await onMenu(o1.id)) && !(await onMenu(o2.id)) && !(await onMenu(o3.id)))
      check("…and the cart refuses it", await cartProblem())
      const vRead = await call("GET", `${I}/${lc.id}`)
      check("…still on the vendor's own menu, marked archived", vRead.status === 200 && vRead.json.data?.isArchived === true)
      check("…and in the vendor's list", ((await call("GET", `${I}?pageSize=100`)).json.data?.items as Json[]).some((i) => i.id === lc.id))
      check("…moderation untouched", vRead.json.data?.reviewStatus === "AUTO_APPROVED" && vRead.json.data?.adminStatus === "ACTIVE")
      check("…and every relationship intact: outlets, prices, availability, modifiers, image, meal plan", (await relations()) === before)

      asVendor(vendorB.userId)
      check("another vendor cannot archive it (404)", (await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: false })).status === 404)
      asVendor(vendorA.userId)

      const un = await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: false })
      check("unarchive succeeds", un.status === 200 && un.json.data?.isArchived === false, un.json)
      check("…back on all three customer menus", !!(await onMenu(o1.id)) && !!(await onMenu(o2.id)) && !!(await onMenu(o3.id)))
      check("…at the same prices (local price kept)", (await onMenu(o2.id))?.priceMinor === 9000 && (await onMenu(o1.id))?.priceMinor === 7000)
      check("…with nothing changed underneath", (await relations()) === before)

      // ── per-outlet availability: A / B / C ──
      const setAvail = (outletId: string, isAvailable: boolean) =>
        call("PATCH", `/api/vendor/v1/menu/meals/${mealOf(outletId)}/availability`, { isAvailable })
      await setAvail(o2.id, false)
      const rows = await prisma.meal.findMany({ where: { menuItemId: lc.id }, select: { outletId: true, isAvailable: true } })
      const avail = (id: string) => rows.find((r) => r.outletId === id)?.isAvailable
      check("86-ing at outlet B changes only B", avail(o1.id) === true && avail(o2.id) === false && avail(o3.id) === true, rows)
      const atB = await onMenu(o2.id)
      check("…B shows it greyed as sold out, not hidden", atB?.isAvailable === false && atB?.unavailableReason === "OUT_OF_STOCK", atB)
      check("…A and C still sell it", (await onMenu(o1.id))?.isAvailable === true && (await onMenu(o3.id))?.isAvailable === true)

      // Removing outlet C from the dish leaves A and B exactly as they were.
      await call("PUT", `${I}/${lc.id}`, lcBody({ outletIds: [o1.id, o2.id], priceOverrides: { [o2.id]: 9000 } }))
      check("removing outlet C takes it off C's menu only",
        !(await onMenu(o3.id)) && (await onMenu(o1.id))?.isAvailable === true && (await onMenu(o2.id))?.isAvailable === false)
      const cRow = await prisma.meal.findUnique({ where: { id: mealOf(o3.id) } })
      check("…C's Meal is soft-deleted, not removed", cRow !== null && cRow.deletedAt !== null)
      await call("PUT", `${I}/${lc.id}`, lcBody())
      check("…re-adding C restores the same Meal", (await prisma.meal.findUnique({ where: { id: mealOf(o3.id) } }))?.deletedAt === null
        && !!(await onMenu(o3.id)))
      check("…and B is still 86'd — a form save never touches availability", (await onMenu(o2.id))?.isAvailable === false)
      await setAvail(o2.id, true)
      const afterAvail = await relations()

      // ── soft delete ──
      asVendor(vendorB.userId)
      check("another vendor cannot delete it (404)", (await call("DELETE", `${I}/${lc.id}`)).status === 404)
      asVendor(vendorA.userId)
      const del = await call("DELETE", `${I}/${lc.id}`)
      check("delete succeeds", del.status === 200 && keys(del.json.data) === "deleted,id" && del.json.data.deleted === true, del.json)
      const row = await prisma.menuItem.findUnique({ where: { id: lc.id } })
      check("…the row is still there, soft-deleted", row !== null && row.deletedAt !== null)
      check("…with every relationship intact: Meals, prices, availability, modifiers, image, meal plan",
        (await relations()) === afterAvail, { before: afterAvail, after: await relations() })
      check("…gone from the vendor's reads", (await call("GET", `${I}/${lc.id}`)).status === 404
        && !((await call("GET", `${I}?pageSize=100`)).json.data?.items as Json[]).some((i) => i.id === lc.id))
      check("…and from every customer menu", !(await onMenu(o1.id)) && !(await onMenu(o2.id)) && !(await onMenu(o3.id)))
      check("…a deleted dish cannot be edited, archived, deleted again or 86'd",
        (await call("PUT", `${I}/${lc.id}`, lcBody())).status === 404
          && (await call("PATCH", `${I}/${lc.id}/archive`, { isArchived: true })).status === 404
          && (await call("DELETE", `${I}/${lc.id}`)).status === 404
          && (await setAvail(o1.id, false)).status === 404)
      const reuse = await call("POST", I, lcBody({ imageKeys: [], modifierGroups: [] }))
      check("…and its name is free for a new live dish", reuse.status === 201 && reuse.json.data?.id !== lc.id, reuse.json)
      check("…which customers see", menuOf(await storefrontOrNull(o1.id)).some((i) => i.id === reuse.json.data?.id))
      await call("DELETE", `${I}/${reuse.json.data.id}`)

      // ── lifecycle does not reach past moderation ──
      await prisma.menuItem.update({ where: { id: probe.id }, data: { adminStatus: "BANNED" } })
      const bArch = await call("PATCH", `${I}/${probe.id}/archive`, { isArchived: true })
      const bDel  = await call("DELETE", `${I}/${probe.id}`)
      check("a BANNED dish is refused, as an edit of it is",
        bArch.status === 403 && bArch.json.code === "MEAL_BANNED" && bDel.status === 403 && bDel.json.code === "MEAL_BANNED",
        { bArch: bArch.json.code, bDel: bDel.json.code })
      await prisma.menuItem.update({ where: { id: probe.id }, data: { adminStatus: "ACTIVE" } })

      // Leave o3 out of the pricing section's world.
      await prisma.meal.deleteMany({ where: { outletId: o3.id } })
      await prisma.outlet.delete({ where: { id: o3.id } })
      clearOperatingCityCache()
    }

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 5. pricing\n")

    const now = new Date()
    const past = new Date(now.getTime() - 86_400_000)

    /* D1: 10% on every dish, but ONLY at outlet two. */
    const d1 = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} D1`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 1000,
        appliesToAllItems: true, appliesToAllOutlets: false, startsAt: past,
        outlets: { create: { outletId: o2.id } },
      },
    })

    const sf1 = await storefrontOrNull(o1.id)
    const sf2 = await storefrontOrNull(o2.id)
    const p1 = menuOf(sf1).find((i) => i.id === plateId)
    const p2 = menuOf(sf2).find((i) => i.id === plateId)

    check("currency is the COUNTRY's, with its real scale (UGX, 0 digits)",
      sf1?.currency.code === "UGX" && sf1.currency.minorUnitDigits === 0, sf1?.currency)
    check("base price at an outlet with no override", p1?.priceMinor === 10000 && p1?.wasPriceMinor === null, p1)
    check("an outlet-targeted offer does not apply elsewhere", p1?.offer === null)
    check("tax is split out of an inclusive price (16% of 10000 → 1379)",
      p1?.price.grossMinor === 10000 && p1?.price.taxMinor === 1379 && p1?.price.netMinor === 8621 && p1?.price.taxInclusive === true, p1?.price)
    check("the override is the list price at its outlet (was 12000)", p2?.wasPriceMinor === 12000, p2)
    check("…and the offer applies to the OVERRIDE, not the base (10% of 12000 → 10800)", p2?.priceMinor === 10800 && p2?.offer?.id === d1.id, p2)
    check("…tax is on the discounted amount (16% of 10800 → 1490)", p2?.price.grossMinor === 10800 && p2?.price.taxMinor === 1490, p2?.price)

    const cart2 = await priceCustomerCart({ outletId: o2.id, lines: [{ menuItemId: plateId, quantity: 2, selectedOptionIds: [] }] })
    const line2 = cart2.lines[0]
    check("the cart agrees with the storefront: unit 12000, 10% off",
      line2?.unitMinor === 12000 && line2.discountMinor === 2400 && line2.totalMinor === 21600, line2)
    check("…in the same currency", cart2.currency.code === "UGX" && cart2.currency.minorUnitDigits === 0)
    check("…and the cart response carries no commission", !("commissionMinor" in (cart2 as object)))

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 5b. pricing parity: vendor preview = storefront = cart\n")
    /*
     * One dish, one outlet, one moment must price identically in all three
     * places. Each case reads the REAL vendor route, the REAL storefront
     * service and the REAL cart service, and asserts the same four facts from
     * each: the price, the struck-through list price, the applying offer and
     * the label the customer is shown.
     */
    asVendor(vendorA.userId)
    const vPlate = (await call("GET", `/api/vendor/v1/menu/items/${plateId}`)).json.data as Json
    check("the vendor sees the same base price and override", vPlate.basePriceMinor === 10000
      && (vPlate.outlets as Json[]).find((o) => o.outletId === o2.id)?.priceMinorOverride === 12000)
    check("the vendor tax breakdown agrees with the customer's for the base price", vPlate.tax?.taxMinor === 1379, vPlate.tax)

    const views = async (dishId: string, outletId: string) => {
      const v = (await call("GET", `/api/vendor/v1/menu/items/${dishId}`)).json.data as Json
      const vp = (v.outlets as Json[]).find((o) => o.outletId === outletId)?.pricing as Json | undefined
      const st = menuOf(await storefrontOrNull(outletId)).find((i) => i.id === dishId)
      const cart = await priceCustomerCart({ outletId, lines: [{ menuItemId: dishId, quantity: 1, selectedOptionIds: [] }] })
      const line = cart.lines[0]
      return {
        vendor: vp ? { price: vp.priceMinor, was: vp.wasPriceMinor ?? null, offer: vp.offer?.id ?? null, label: vp.offer?.label ?? null } : null,
        store : st ? { price: st.priceMinor, was: st.wasPriceMinor, offer: st.offer?.id ?? null, label: st.offer?.label ?? null } : null,
        cart  : line ? {
          price: line.totalMinor,
          was  : line.discountMinor > 0 ? line.subtotalMinor : null,
          offer: line.appliedOfferId,
          label: line.appliedOfferName,
        } : null,
        discounts: v.discounts as Json[],
        cartCurrency: cart.currency,
      }
    }
    const agree = async (
      label: string, dishId: string, outletId: string,
      want: { price: number; was: number | null; offer: string | null; label: string | null },
    ) => {
      const r = await views(dishId, outletId)
      const expected = JSON.stringify(want)
      const got = [r.vendor, r.store, r.cart].map((x) => JSON.stringify(x))
      check(label, got.every((x) => x === expected), { want: expected, vendor: got[0], store: got[1], cart: got[2] })
      return r
    }

    // A — no override: the base price, everywhere.
    await agree("A · no override: the base price in all three", plateId, o1.id,
      { price: 10000, was: null, offer: null, label: null })

    // B + C — override + targeted offer: the OUTLET price, discounted, everywhere.
    const atO2 = await agree("B+C · outlet override, targeted offer: 12000 → 10800 in all three", plateId, o2.id,
      { price: 10800, was: 12000, offer: d1.id, label: "10% off" })

    // D — the same offer does not touch a non-targeted outlet (A already shows
    // o1 untouched); the dish-level list still says it is applying somewhere.
    const d1Row = atO2.discounts.find((d) => d.id === d1.id)
    check("D · the dish's offer list says D1 applies (at its targeted outlet) without claiming a single price",
      d1Row?.appliesNow === true && d1Row.state === "RUNNING" && !("discountedPriceMinor" in d1Row) && !("savingMinor" in d1Row), d1Row)

    // I — every surface shows the GENERATED label, never the vendor's internal name.
    check("I · the customer label is generated, never the vendor's internal offer name",
      atO2.cart?.label === "10% off" && atO2.store?.label === "10% off" && atO2.vendor?.label === "10% off"
        && d1Row?.label === "10% off" && d1Row?.name === `${MARKER} D1`, { cart: atO2.cart?.label, row: d1Row })

    // J — a zero-decimal currency end to end.
    check("J · UGX (0 digits) end to end — the cart's currency, and every price a whole number",
      atO2.cartCurrency.code === "UGX" && atO2.cartCurrency.minorUnitDigits === 0
        && [atO2.vendor, atO2.store, atO2.cart].every((x) => Number.isInteger(x?.price)), atO2.cartCurrency)

    // E — a happy hour open NOW on the outlet's clock (UTC+14), and a second one
    // whose hours are "now" on the SERVER clock but shut where the outlet is.
    const localHour  = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now))
    const serverHour = now.getHours()
    const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`
    const d2 = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} D2`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 2000,
        appliesToAllItems: false, appliesToAllOutlets: true, startsAt: past,
        startTime: hh(localHour), endTime: hh(localHour + 1),
        items: { create: { menuItemId: probe.id } },
      },
    })
    const d2x = serverHour !== localHour ? await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} D2x`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 3000,
        appliesToAllItems: false, appliesToAllOutlets: true, startsAt: past,
        startTime: hh(serverHour), endTime: hh(serverHour + 1),
        items: { create: { menuItemId: probe.id } },
      },
    }) : null
    const happy = await agree("E · a happy hour on the OUTLET's clock applies in all three (4000 → 3200)", probe.id, o1.id,
      { price: 3200, was: 4000, offer: d2.id, label: "20% off" })
    if (d2x) {
      check("E · …and one open only on the SERVER clock applies nowhere — not even in the vendor's list",
        happy.discounts.find((d) => d.id === d2x.id)?.appliesNow === false, happy.discounts)
      const list = (await call("GET", "/api/vendor/v1/discounts")).json.data as Json[]
      check("E · the vendor's offer list agrees: D2 applying, D2x not",
        list.find((d) => d.id === d2.id)?.appliesNow === true && list.find((d) => d.id === d2x.id)?.appliesNow === false,
        list.map((d) => [d.name, d.appliesNow]))
      asAdmin(admin.id, [AdminPermissions.FINANCE_DISCOUNTS_READ],
        { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" })
      const adminList = (await call("GET", `/api/admin/v1/vendors/discounts?vendor=${vendorA.id}&pageSize=50`)).json.data?.discounts as Json[]
      const adminOne = (await call("GET", `/api/admin/v1/vendors/discounts/${d2x.id}`)).json.data as Json
      check("E · the admin's \"applies now\" agrees, on the outlet's clock",
        adminList?.find((d) => d.id === d2.id)?.appliesNow === true
          && adminList?.find((d) => d.id === d2x.id)?.appliesNow === false && adminOne?.appliesNow === false,
        adminList?.map((d) => [d.name, d.appliesNow]))
    } else {
      console.log("  skip  server-clock contrast — the server's hour coincides with the outlet's this hour")
    }

    // F + G — a stored row above the ceiling competes with the happy hour: it
    // wins on saving, and takes only the 50% the platform allows.
    const d3 = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} D3`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 6000,
        appliesToAllItems: false, appliesToAllOutlets: true, startsAt: past,
        items: { create: { menuItemId: probe.id } },
      },
    })
    await agree("F+G · the bigger saving wins, re-clamped to 50% everywhere (4000 → 2000, \"50% off\")", probe.id, o1.id,
      { price: 2000, was: 4000, offer: d3.id, label: "50% off" })
    await prisma.discount.deleteMany({ where: { id: { in: [d2.id, d3.id, ...(d2x ? [d2x.id] : [])] } } })

    // G — at the override outlet, a larger offer beats D1.
    const d4 = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} D4`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 2500,
        appliesToAllItems: true, appliesToAllOutlets: true, startsAt: past,
      },
    })
    await agree("G · competing offers: 25% beats 10% everywhere (12000 → 9000)", plateId, o2.id,
      { price: 9000, was: 12000, offer: d4.id, label: "25% off" })
    await prisma.discount.deleteMany({ where: { id: { in: [d1.id, d4.id] } } })

    // H — equal savings. Created in the "wrong" order on purpose: row order must not decide.
    const hLater = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} H-later`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 1500,
        appliesToAllItems: true, appliesToAllOutlets: true, startsAt: new Date(now.getTime() - 86_400_000),
      },
    })
    const hEarlier = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} H-earlier`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 1500,
        appliesToAllItems: true, appliesToAllOutlets: true, startsAt: new Date(now.getTime() - 2 * 86_400_000),
      },
    })
    await agree("H · equal savings: the EARLIER start wins in all three", plateId, o1.id,
      { price: 8500, was: 10000, offer: hEarlier.id, label: "15% off" })
    await prisma.discount.deleteMany({ where: { id: { in: [hLater.id, hEarlier.id] } } })

    const sameStart = new Date(now.getTime() - 3 * 86_400_000)
    const hA = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} H-a`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 1500,
        appliesToAllItems: true, appliesToAllOutlets: true, startsAt: sameStart,
      },
    })
    const hB = await prisma.discount.create({
      data: {
        vendorId: vendorA.id, name: `${MARKER} H-b`, type: "PERCENTAGE_OFF_ITEMS", percentBps: 1500,
        appliesToAllItems: true, appliesToAllOutlets: true, startsAt: sameStart,
      },
    })
    const lowerId = [hA.id, hB.id].sort()[0]!
    await agree("H · equal savings AND start: the lower id wins in all three", plateId, o1.id,
      { price: 8500, was: 10000, offer: lowerId, label: "15% off" })
    await prisma.discount.deleteMany({ where: { id: { in: [hA.id, hB.id] } } })

    // J — the vendor's own form is told the same scale.
    const ctxA = (await call("GET", "/api/vendor/v1/menu/context")).json.data as Json
    check("J · the vendor's form is told UGX with 0 digits", ctxA.currency?.code === "UGX" && ctxA.currency?.minorUnitDigits === 0, ctxA.currency)

    // Offer dates are meant on the outlets' shared clock.
    const discountCtx = (await call("GET", "/api/vendor/v1/discounts/context")).json.data as Json
    check("the offer form is told the timezone the vendor's outlets share", discountCtx?.timeZone === TZ, discountCtx?.timeZone)

    // ── modifier zero-price check holds at the CHEAPEST outlet price ──
    asVendor(vendorA.userId)
    const cutGroup = { name: "Half", minSelect: 0, maxSelect: 1, options: [{ name: "Half portion", priceDeltaMinor: -5000 }] }
    const cheapAtO2 = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({
      priceOverrides: { [o2.id]: 3000 }, modifierGroups: [cutGroup],
    }))
    check("a group harmless on the 10000 base is refused when an outlet sells the dish at 3000",
      cheapAtO2.status === 400 && cheapAtO2.json.code === "OPTIONS_ZERO_OUT_DISH", cheapAtO2.json)
    const fineEverywhere = await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({
      priceOverrides: { [o2.id]: 12000 }, modifierGroups: [cutGroup],
    }))
    check("…and accepted when every outlet's price can carry it", fineEverywhere.status === 200, fineEverywhere.json)
    await call("PUT", `/api/vendor/v1/menu/items/${plateId}`, body({ modifierGroups: [] }))

    // ── currency with no Currency link ──
    await prisma.country.update({ where: { id: countryB.id }, data: { currencyCode: null, currency: "ZZX" } })
    clearCurrencyCache()
    /* An unknown code must never be priced at an ASSUMED two digits — the one
     * guess principle 2 forbids. Finance refuses to answer instead. */
    let resolverRefused = ""
    try { await getCurrencyForCountry(countryB.id) }
    catch (err) { resolverRefused = (err as { code?: string }).code ?? "" }
    check("an unresolvable currency fails loudly — no assumed scale (finance resolver)",
      resolverRefused === "CURRENCY_NOT_CONFIGURED", resolverRefused)
    asVendor(vendorB.userId)
    const bCtx = await call("GET", "/api/vendor/v1/menu/context")
    check("…the vendor meal form refuses rather than guess",
      bCtx.status === 500 && bCtx.json.code === "CURRENCY_NOT_CONFIGURED", { status: bCtx.status, code: bCtx.json.code })
    asAdmin(admin.id, [AdminPermissions.VENDORS_MEALS_READ], { isGlobal: false, countryIds: [countryB.id], cityIds: [], tier: "COUNTRY" })
    const bAdmin = await call("GET", "/api/admin/v1/vendors/meals")
    check("…and so does the admin meal queue",
      bAdmin.status === 500 && bAdmin.json.code === "CURRENCY_NOT_CONFIGURED", { status: bAdmin.status, code: bAdmin.json.code })
    await prisma.country.update({ where: { id: countryB.id }, data: { currencyCode: null, currency: "KES" } })
    clearCurrencyCache()
    check("a country with only the legacy currency column still resolves through it",
      (await getCurrencyForCountry(countryB.id)).code === "KES")
    await prisma.country.update({ where: { id: countryB.id }, data: { currencyCode: "KES", currency: "KES" } })
    clearCurrencyCache()

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 6. integrity facts the deletion decision rests on\n")

    asVendor(vendorA.userId)
    {
      const s1 = await call("POST", "/api/vendor/v1/menu/sections", { name: `${MARKER} Mains` })
      await call("DELETE", `/api/vendor/v1/menu/sections/${s1.json.data?.id}`)
      const s2 = await call("POST", "/api/vendor/v1/menu/sections", { name: `${MARKER} Mains` })
      check("a deleted section no longer occupies its name (partial unique index)",
        s2.status === 201, { status: s2.status, code: s2.json.code })
      const s3 = await call("POST", "/api/vendor/v1/menu/sections", { name: `${MARKER} Mains` })
      check("…while a LIVE duplicate is still refused", s3.status === 409 && s3.json.code === "DUPLICATE_SECTION", s3.json)
      /* Below the service: the index itself must still refuse two live rows. */
      let dbRefused = false
      try { await prisma.menuSection.create({ data: { vendorId: vendorA.id, name: `${MARKER} Mains` } }) }
      catch (err) { dbRefused = (err as { code?: string }).code === "P2002" }
      check("…and so does the database, beneath the service check", dbRefused)
    }
    {
      await prisma.menuItem.update({ where: { id: probe.id }, data: { deletedAt: new Date() } })
      const again = await call("POST", "/api/vendor/v1/menu/items", { name: `${MARKER} Probe`, basePriceMinor: 4000, outletIds: [o1.id] })
      check("a soft-deleted dish no longer occupies its name", again.status === 201, { status: again.status, code: again.json.code })
      let dbRefused = false
      try { await prisma.menuItem.create({ data: { vendorId: vendorA.id, name: `${MARKER} Probe`, basePriceMinor: 1 } }) }
      catch (err) { dbRefused = (err as { code?: string }).code === "P2002" }
      check("…while the database still refuses a second LIVE dish of that name", dbRefused)
      /* Two rows now share the name — one deleted, one live. Restoring the old
       * one would collide, which is exactly the index doing its job; remove
       * the new one first so the cascade check below uses the original. */
      await prisma.menuItem.delete({ where: { id: again.json.data.id } })
      await prisma.menuItem.update({ where: { id: probe.id }, data: { deletedAt: null } })
    }
    {
      const plan = await prisma.mealPlan.create({
        data: { outletId: o1.id, name: `${MARKER} Plan`, meals: { create: { mealId: probeMealId } } },
      })
      await prisma.menuItem.delete({ where: { id: probe.id } })
      const mealGone = (await prisma.meal.findUnique({ where: { id: probeMealId } })) === null
      const linkGone = (await prisma.mealPlanMeal.count({ where: { mealPlanId: plan.id } })) === 0
      known("a HARD delete of a dish cascades its Meals and silently empties meal plans", mealGone && linkGone, { mealGone, linkGone })
    }
  } finally {
    vendorCtx = null
    adminCtx = null
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await drainAuditQueue()
    await sweep()
    clearOperatingCityCache()
    clearCurrencyCache()
    console.log("\n  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${pinned} known issues pinned, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

/*
 * Vendor menus, through the REAL vendor and admin routers, with a real R2
 * upload for the logo.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/meals.menus.smoke.ts
 *
 * Pins: create/read/update with the logo on the meal-photo pipeline; a menu
 * lists only its own outlet's meals (refused in the service AND by the
 * database); another vendor cannot read, write, attach meals to, or use
 * images of a menu that is not theirs — every such attempt answers like a
 * missing resource; the ERP reads menus in scope and cannot mutate them; and
 * no customer read path exposes menus.
 *
 * Creates its own fixtures under MARKER, sweeps strays first, cleans up after.
 * Needs an active vendor type, an admin user, and the public media bucket.
 */
import express from "express"
import sharp from "sharp"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import { AdminPermissions } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import vendorRoutes from "@/modules/vendor/routes"
import adminV1Router from "@/modules/admin/routes/v1"
import { errorHandler } from "@/middleware/error"
import { drainAuditQueue } from "@/services/audit"
import { getStorefront, getMealDetail } from "@/modules/customer/services/customer.storefront.service"
import { discoverCityOutlets } from "@/modules/customer/services/customer.discovery.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"
import { clearCurrencyCache } from "@/modules/finance"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"

const MARKER = "zz-smoke-menus"
const TZ = "Pacific/Kiritimati"
const POINT = { latitude: -19.5, longitude: -149.75 }
const square = (w: number, e: number) => ({
  type: "Polygon", coordinates: [[[w, -20], [e, -20], [e, -19], [w, -19], [w, -20]]],
})

let passed = 0
let failed = 0
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.error(`  FAIL  ${label}`, detail ?? "") }
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let vendorCtx: { userId: string } | null = null
let adminCtx: { adminUser: { id: string }; adminPermissions: string[]; adminScope: AdminScopeContext } | null = null
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
app.use("/api/admin/v1", (req, _res, next) => { if (adminCtx) Object.assign(req, adminCtx); next() }, adminV1Router)
app.use(errorHandler)

let baseUrl = ""
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
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
const asAdmin = (id: string, permissions: string[], scope: AdminScopeContext) => {
  adminCtx = { adminUser: { id }, adminPermissions: permissions, adminScope: scope }
}

const stagedKeys = new Set<string>()
const savedKeys  = new Set<string>()   // [original, public] pairs, for cleanup

async function sweep() {
  const vendors = await prisma.vendorAccount.findMany({ where: { businessEmail: { startsWith: MARKER } }, select: { id: true } })
  const menus = await prisma.menu.findMany({
    where : { outlet: { vendorId: { in: vendors.map((v) => v.id) } } },
    select: { imageOriginalKey: true, imageKey: true },
  })
  const images = await prisma.menuItemImage.findMany({
    where : { menuItem: { vendorId: { in: vendors.map((v) => v.id) } } },
    select: { originalKey: true, imageKey: true },
  })
  await Promise.all([
    ...[...menus.map((m) => ({ originalKey: m.imageOriginalKey, imageKey: m.imageKey })), ...images].flatMap((i) => [
      publicMediaStorage.delete(i.imageKey).catch(() => undefined),
      R2Service.deleteObject(i.originalKey).catch(() => undefined),
    ]),
    ...[...stagedKeys, ...savedKeys].map((k) => R2Service.deleteObject(k).catch(() => undefined)),
  ])
  await prisma.vendorAccount.deleteMany({ where: { id: { in: vendors.map((v) => v.id) } } })
  await prisma.vendorApplication.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorUser.deleteMany({ where: { email: { startsWith: MARKER } } })
  await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

async function makeVendor(tag: string, countryId: string, vendorTypeId: string) {
  const email = `${MARKER}-${tag}@example.test`
  const user = await prisma.vendorUser.create({ data: { externalAuthId: `${MARKER}-${tag}`, email } })
  const application = await prisma.vendorApplication.create({ data: { userId: user.id, countryId, vendorTypeId, businessEmail: email } })
  const account = await prisma.vendorAccount.create({
    data: {
      userId: user.id, vendorTypeId, countryId, applicationId: application.id,
      legalBusinessName: `${MARKER} ${tag}`, businessEmail: email, businessPhone: `+997${tag === "a" ? "1" : "2"}000000`,
      ownerFirstName: "Smoke", ownerLastName: tag.toUpperCase(), businessAddress: "1 Test Road", status: "ACTIVE",
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

const logo = (w = 600, h = 400) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer()

async function stage(userId: string, bytes: Buffer, contentType = "image/png"): Promise<string> {
  const saved = vendorCtx
  vendorCtx = { userId }
  const presign = await call("POST", "/api/vendor/v1/menu/images/presign", { contentType, fileSize: bytes.byteLength })
  vendorCtx = saved
  if (presign.status !== 200) throw new Error(`presign failed: ${JSON.stringify(presign.json)}`)
  const { storageKey, uploadUrl } = presign.json.data as { storageKey: string; uploadUrl: string }
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(bytes) })
  if (!put.ok) throw new Error(`PUT failed: ${put.status}`)
  stagedKeys.add(storageKey)
  return storageKey
}

async function main() {
  console.log("\n── menus smoke ─────────────────────────────────────────────\n")
  await sweep()

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  const admin = await prisma.adminUser.findFirst({ select: { id: true } })
  if (!vendorType || !admin || !publicMediaStorage.isConfigured()) {
    console.error("  SKIPPED — needs an active vendor type, an admin user and the public media bucket")
    return
  }

  const mkCountry = (tag: string, phone: string) => prisma.country.create({
    data: {
      name: `ZZ Menus ${tag}`, code: `ZZM${tag}`, slug: `${MARKER}-${tag.toLowerCase()}`, currency: "KES", currencyCode: "KES",
      phoneCode: phone, timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const countryA = await mkCountry("A", "+99971")
  const countryB = await mkCountry("B", "+99972")
  const city = await prisma.city.create({
    data: {
      countryId: countryA.id, name: "ZZ Menus City", slug: `${MARKER}-city`, timezone: TZ, status: "ACTIVE",
      boundary: square(-150, -149), boundingBox: { north: -19, south: -20, east: -149, west: -150 },
      latitude: POINT.latitude, longitude: POINT.longitude,
    },
  })
  const cityB = await prisma.city.create({
    data: { countryId: countryB.id, name: "ZZ Menus City B", slug: `${MARKER}-city-b`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const zone = await prisma.zone.create({
    data: { cityId: city.id, name: "ZZ-MENUS", publicName: "ZZ Menus", boundaries: square(-150, -149), level: "MARKETPLACE", status: "ACTIVE" },
  })

  const vendorA = await makeVendor("a", countryA.id, vendorType.id)
  const vendorB = await makeVendor("b", countryB.id, vendorType.id)
  const o1 = await makeOutlet(vendorA.id, city.id, zone.id, "One")
  const o2 = await makeOutlet(vendorA.id, city.id, zone.id, "Two")
  const oB = await makeOutlet(vendorB.id, cityB.id, null, "B")
  clearOperatingCityCache(); clearCurrencyCache()

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const I = "/api/vendor/v1/menu/items"
  const MN = "/api/vendor/v1/menu/menus"

  try {
    asVendor(vendorA.userId)
    const dish = async (name: string, outletIds: string[]) =>
      (await call("POST", I, { name: `${MARKER} ${name}`, basePriceMinor: 50000, outletIds })).json.data as Json
    const plate = await dish("Plate", [o1.id, o2.id])
    const soup  = await dish("Soup", [o1.id])
    const mealAt = (d: Json, outletId: string) => (d.outlets as Json[]).find((o) => o.outletId === outletId)!.mealId as string
    asVendor(vendorB.userId)
    const bDish = (await call("POST", I, { name: `${MARKER} B Dish`, basePriceMinor: 900, outletIds: [oB.id] })).json.data as Json
    const bMeal = mealAt(bDish, oB.id)

    // ── 1. create / read ──
    console.log("  ── 1. create and read\n")
    asVendor(vendorA.userId)
    const staged1 = await stage(vendorA.userId, await logo())
    const created = await call("POST", MN, {
      outletId: o1.id, name: `${MARKER} Breakfast`, description: "Mornings", imageKey: staged1,
      mealIds: [mealAt(plate, o1.id)],
      // Principle 7 — not client-settable, and must not reach a write.
      imageOriginalKey: "x", vendorId: vendorB.id,
    })
    const menu = created.json.data as Json
    check("a vendor creates a menu for their outlet", created.status === 201 && menu?.outlet?.id === o1.id, created.json)
    check("…detail key set", Object.keys(menu ?? {}).sort().join(",")
      === "createdAt,currency,description,id,image,imageStorageKey,mealCount,mealIds,name,outlet,sections,updatedAt", Object.keys(menu ?? {}))
    check("…listing exactly the meal chosen, grouped by its section",
      menu.mealCount === 1 && menu.sections[0].meals[0].mealId === mealAt(plate, o1.id))

    const row = await prisma.menu.findUniqueOrThrow({ where: { id: menu.id } })
    savedKeys.add(row.imageOriginalKey)
    check("the logo's original is kept privately under menu-images/<vendorId>/",
      row.imageOriginalKey.startsWith(`menu-images/${vendorA.id}/`) && await R2Service.objectExists(row.imageOriginalKey))
    check("…and its public master is a menus/ WebP the server produced", row.imageKey.startsWith("menus/") && row.imageKey.endsWith(".webp"))
    const pub = await fetch(menu.image.url)
    const meta = await sharp(Buffer.from(await pub.arrayBuffer())).metadata()
    check("…fetchable anonymously, decoding as WebP at its own size", pub.ok && meta.format === "webp" && meta.width === 600, { status: pub.status, meta: meta.format })
    check("…and the consumed staging upload is cleared", !(await R2Service.objectExists(staged1)))

    const listed = await call("GET", MN)
    check("the vendor's list shows it", (listed.json.data as Json[]).some((m) => m.id === menu.id && m.mealCount === 1))
    check("…filterable by outlet", ((await call("GET", `${MN}?outletId=${o2.id}`)).json.data as Json[]).length === 0)
    check("GET one returns it", (await call("GET", `${MN}/${menu.id}`)).json.data?.id === menu.id)
    const picker = (await call("GET", `${MN}/outlet-meals?outletId=${o1.id}`)).json.data as Json
    check("the picker offers that outlet's meals only",
      (picker.sections as Json[]).flatMap((s) => s.meals).map((m: Json) => m.mealId).sort().join()
        === [mealAt(plate, o1.id), mealAt(soup, o1.id)].sort().join())

    // ── 2. validation ──
    console.log("\n  ── 2. validation\n")
    const bad = async (label: string, body: Json, status: number, code: string) => {
      const r = await call("POST", MN, body)
      check(label, r.status === status && r.json.code === code, { status: r.status, code: r.json.code })
    }
    const ok = { outletId: o1.id, name: `${MARKER} Valid`, imageKey: await stage(vendorA.userId, await logo()) }
    await bad("a menu without a logo is refused", { ...ok, imageKey: undefined }, 400, "MISSING_IMAGE")
    await bad("a nameless menu is refused", { ...ok, name: " " }, 400, "MISSING_FIELDS")
    await bad("a meal from ANOTHER outlet of the same vendor is refused", { ...ok, mealIds: [mealAt(plate, o2.id)] }, 404, "MEAL_NOT_FOUND")
    await bad("a second menu with the same name at the outlet is refused", { ...ok, name: `${MARKER} breakfast` }, 409, "DUPLICATE_MENU_NAME")
    await bad("a logo too small to render well is refused", { ...ok, imageKey: await stage(vendorA.userId, await logo(120, 80)) }, 400, "IMAGE_TOO_SMALL")
    check("a refused save leaves the valid staged upload in place (the lifecycle rule or a discard removes it)",
      await R2Service.objectExists(ok.imageKey as string))
    check("…and created no menu", (await prisma.menu.count({ where: { outletId: o1.id } })) === 1)

    // The database's own guarantee, beneath the service.
    let dbRefused = false
    try {
      await prisma.menuMeal.create({ data: { menuId: menu.id, mealId: mealAt(plate, o2.id), outletId: o1.id } })
    } catch { dbRefused = true }
    check("the database itself refuses linking another outlet's meal (composite FK)", dbRefused)

    // ── 3. update ──
    console.log("\n  ── 3. update\n")
    const kept = await call("PUT", `${MN}/${menu.id}`, {
      name: `${MARKER} Breakfast & Brunch`, description: null, imageKey: menu.imageStorageKey,
      mealIds: [mealAt(soup, o1.id), mealAt(plate, o1.id)],
    })
    check("update renames and replaces the meal list, keeping the logo when its key is sent back",
      kept.status === 200 && kept.json.data.name === `${MARKER} Breakfast & Brunch` && kept.json.data.mealCount === 2
        && kept.json.data.image.url === menu.image.url, kept.json)
    const untouched = await call("PUT", `${MN}/${menu.id}`, { name: `${MARKER} Breakfast & Brunch` })
    check("…a save that omits mealIds leaves the list alone", untouched.json.data?.mealCount === 2, untouched.json)
    const moved = await call("PUT", `${MN}/${menu.id}`, { outletId: o2.id, name: `${MARKER} Breakfast & Brunch` })
    check("…moving a menu to another outlet is refused, not ignored", moved.status === 400 && moved.json.code === "OUTLET_IMMUTABLE", moved.json)

    const oldOriginal = row.imageOriginalKey
    const oldPublicUrl = menu.image.url as string
    const replaced = await call("PUT", `${MN}/${menu.id}`, {
      name: `${MARKER} Breakfast & Brunch`, imageKey: await stage(vendorA.userId, await logo(800, 800)),
    })
    const rowAfter = await prisma.menu.findUniqueOrThrow({ where: { id: menu.id } })
    savedKeys.add(rowAfter.imageOriginalKey)
    check("replacing the logo publishes a new uuid-named master",
      replaced.status === 200 && rowAfter.imageKey !== row.imageKey && replaced.json.data.image.url !== oldPublicUrl, replaced.json)
    check("…and deletes the old original", !(await R2Service.objectExists(oldOriginal)))
    const oldGone = await fetch(`${oldPublicUrl}?cb=${Date.now()}`)
    check("…and the old public master", oldGone.status === 404 || oldGone.status === 403, oldGone.status)

    // Removing a meal from the outlet drops it from the menu with no menu write.
    await call("PUT", `${I}/${soup.id}`, { name: `${MARKER} Soup`, basePriceMinor: 50000, outletIds: [o2.id] })
    check("a meal removed from the outlet drops out of the menu on read",
      (await call("GET", `${MN}/${menu.id}`)).json.data?.mealCount === 1)

    // ── 4. another vendor ──
    console.log("\n  ── 4. another vendor = nothing there\n")
    asVendor(vendorB.userId)
    const missing = "00000000-0000-4000-8000-000000000000"
    const same = async (label: string, method: string, path: string, missingPath: string, body?: unknown) => {
      const a = await call(method, path, body)
      const b = await call(method, missingPath, body)
      check(label, a.status === 404 && a.status === b.status && a.json.code === b.json.code && a.json.message === b.json.message,
        { foreign: [a.status, a.json.code], missing: [b.status, b.json.code] })
    }
    await same("B reading A's menu = a missing menu", "GET", `${MN}/${menu.id}`, `${MN}/${missing}`)
    await same("B updating A's menu = a missing menu", "PUT", `${MN}/${menu.id}`, `${MN}/${missing}`, { name: "Hijacked" })
    await same("B listing A's outlet's meals = a missing outlet", "GET", `${MN}/outlet-meals?outletId=${o1.id}`, `${MN}/outlet-meals?outletId=${missing}`)
    await same("B filtering its list by A's outlet = a missing outlet", "GET", `${MN}?outletId=${o1.id}`, `${MN}?outletId=${missing}`)
    const bStaged = await stage(vendorB.userId, await logo())
    await same("B creating a menu on A's outlet = a missing outlet", "POST", MN, MN,
      { outletId: o1.id, name: `${MARKER} Hijack`, imageKey: bStaged })
    check("…and A's menu is unchanged", (await prisma.menu.findUniqueOrThrow({ where: { id: menu.id } })).name === `${MARKER} Breakfast & Brunch`)
    check("B's list does not include A's menu", !((await call("GET", MN)).json.data as Json[]).some((m) => m.id === menu.id))

    const bMenu = await call("POST", MN, { outletId: oB.id, name: `${MARKER} B Menu`, imageKey: bStaged, mealIds: [bMeal] })
    check("B creates its own menu", bMenu.status === 201, bMenu.json)
    if (bMenu.status === 201) savedKeys.add((await prisma.menu.findUniqueOrThrow({ where: { id: bMenu.json.data.id } })).imageOriginalKey)
    const steal = await call("PUT", `${MN}/${bMenu.json.data?.id}`, { name: `${MARKER} B Menu`, mealIds: [mealAt(plate, o1.id)] })
    check("B cannot put A's meal on its menu (404 MEAL_NOT_FOUND)", steal.status === 404 && steal.json.code === "MEAL_NOT_FOUND", steal.json)
    const stealImg = await call("PUT", `${MN}/${bMenu.json.data?.id}`, { name: `${MARKER} B Menu`, imageKey: rowAfter.imageOriginalKey })
    check("B cannot attach A's saved logo by its key (403 FORBIDDEN)", stealImg.status === 403 && stealImg.json.code === "FORBIDDEN", stealImg.json)
    const aStaged = await stage(vendorA.userId, await logo())
    const stealStaged = await call("PUT", `${MN}/${bMenu.json.data?.id}`, { name: `${MARKER} B Menu`, imageKey: aStaged })
    check("…nor A's staged upload (403 FORBIDDEN)", stealStaged.status === 403 && stealStaged.json.code === "FORBIDDEN", stealStaged.json)

    // ── 5. the ERP: read only, in scope ──
    console.log("\n  ── 5. ERP read-only\n")
    const AM = "/api/admin/v1/vendors/meals/menus"
    asAdmin(admin.id, [AdminPermissions.VENDORS_MEALS_READ], { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" })
    const al = await call("GET", AM)
    check("an admin with meals:read in A's country lists A's menus",
      al.status === 200 && (al.json.data as Json[]).some((m) => m.id === menu.id), al.json)
    check("…and not B's (another country)", !(al.json.data as Json[]).some((m) => m.id === bMenu.json.data?.id))
    check("…reads one in scope", (await call("GET", `${AM}/${menu.id}`)).json.data?.mealCount === 1)
    const outOfScope = await call("GET", `${AM}/${bMenu.json.data?.id}`)
    check("…and out of scope is a 404", outOfScope.status === 404 && outOfScope.json.code === "NOT_FOUND", outOfScope.json)
    const before = JSON.stringify(await prisma.menu.findUniqueOrThrow({ where: { id: menu.id }, include: { meals: true } }))
    for (const [method, path] of [["POST", AM], ["PUT", `${AM}/${menu.id}`], ["PATCH", `${AM}/${menu.id}`], ["DELETE", `${AM}/${menu.id}`]] as const) {
      const r = await call(method, path, { name: "Admin edit", outletId: o1.id })
      check(`${method} ${path.replace(menu.id, ":id")} is not a route for the ERP`, r.status === 404, [r.status, r.json.code])
    }
    asAdmin(admin.id, [AdminPermissions.VENDORS_MEALS_READ, AdminPermissions.VENDORS_MEALS_MODERATE], { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" })
    const modWrite = await call("PUT", `${AM}/${menu.id}`, { name: "Admin edit" })
    check("…not even with moderate permission and global scope", modWrite.status === 404, modWrite.status)
    check("…and the menu is unchanged after every attempt",
      JSON.stringify(await prisma.menu.findUniqueOrThrow({ where: { id: menu.id }, include: { meals: true } })) === before)
    asAdmin(admin.id, [], { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" })
    check("no meals permission → 403 at the route", (await call("GET", AM)).status === 403)

    // ── 6. customers see no menus ──
    console.log("\n  ── 6. customers\n")
    const storefront = await getStorefront(o1.id, null, null)
    const detail = await getMealDetail(mealAt(plate, o1.id))
    const browse = await discoverCityOutlets(city.slug, {})
    const exposed = JSON.stringify([storefront, detail, browse])
    check("no customer read carries a menu's id, name or logo",
      !exposed.includes(menu.id) && !exposed.includes("Breakfast") && !exposed.includes(rowAfter.imageKey))
    // Isolate the menu's effect: the same storefront with the menus present
    // and with them gone must be identical.
    const withMenus = JSON.stringify(await getStorefront(o1.id, null, null))
    for (const m of await prisma.menu.findMany({ where: { outlet: { vendorId: vendorA.id } } })) {
      await publicMediaStorage.delete(m.imageKey).catch(() => undefined)
      await R2Service.deleteObject(m.imageOriginalKey).catch(() => undefined)
    }
    await prisma.menu.deleteMany({ where: { outlet: { vendorId: vendorA.id } } })
    check("the storefront is byte-identical with and without menus",
      withMenus === JSON.stringify(await getStorefront(o1.id, null, null)))
    check("…and deleting a menu leaves its meals and dishes in place",
      (await prisma.meal.count({ where: { outletId: o1.id, deletedAt: null } })) >= 1)
  } finally {
    server.close()
    await drainAuditQueue()
    await sweep()
    console.log("\n  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => { console.error(err); process.exitCode = 1 }).finally(() => prisma.$disconnect())

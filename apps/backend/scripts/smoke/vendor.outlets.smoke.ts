/*
 * Vendor outlet reads and writes, through the REAL vendor router.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/vendor.outlets.smoke.ts
 *
 * Two regressions this pins:
 *
 *   1. Another vendor's outlet answers EXACTLY like an outlet that does not
 *      exist — same status, same code, same message — on every outlet route.
 *      It used to be a 403 "Unauthorized", which made outlet ids probeable
 *      (principle 6) and, in the dashboard, read as an auth failure.
 *   2. The serialized vendor outlet response carries no zone capability
 *      `level` and no `operationalStatus` anywhere — only the zone's PUBLIC
 *      name and what the vendor can do there.
 *
 * Creates its own country / city / zone / two vendors under MARKER and
 * deletes them, sweeping strays from an aborted run first.
 */
import express from "express"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import vendorRoutes from "@/modules/vendor/routes"
import { errorHandler } from "@/middleware/error"
import { drainAuditQueue } from "@/services/audit"

const MARKER = "zz-smoke-vendor-outlets"
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

async function sweep() {
  const vendors = await prisma.vendorAccount.findMany({ where: { businessEmail: { startsWith: MARKER } }, select: { id: true } })
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
      legalBusinessName: `${MARKER} ${tag}`, businessEmail: email, businessPhone: `+998${tag === "a" ? "1" : "2"}000000`,
      ownerFirstName: "Smoke", ownerLastName: tag.toUpperCase(), businessAddress: "1 Test Road", status: "ACTIVE",
    },
  })
  return { userId: user.id, id: account.id }
}

/** Every key anywhere in a JSON value, at any depth. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out))
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out) }
  }
  return out
}

async function main() {
  console.log("\n── vendor outlets smoke ────────────────────────────────────\n")
  await sweep()

  const vendorType = await prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  if (!vendorType) { console.error("  SKIPPED — needs an active vendor type"); return }

  const country = await prisma.country.create({
    data: {
      name: "ZZ Outlets", code: "ZZVO", slug: `${MARKER}-c`, currency: "KES", currencyCode: "KES",
      phoneCode: "+99983", timezones: [TZ], status: "ACTIVE",
    },
  })
  const city = await prisma.city.create({
    data: {
      countryId: country.id, name: "ZZ Outlets City", slug: `${MARKER}-city`, timezone: TZ, status: "ACTIVE",
      boundary: square(-150, -149), boundingBox: { north: -19, south: -20, east: -149, west: -150 },
      latitude: POINT.latitude, longitude: POINT.longitude,
    },
  })
  const zone = await prisma.zone.create({
    data: {
      cityId: city.id, name: "ZZ-OPS-INTERNAL-CODENAME", publicName: "ZZ Riverside",
      boundaries: square(-150, -149), level: "FULL_OPERATIONS", status: "ACTIVE",
    },
  })

  const vendorA = await makeVendor("a", country.id, vendorType.id)
  const vendorB = await makeVendor("b", country.id, vendorType.id)
  const outlet = await prisma.outlet.create({
    data: {
      vendorId: vendorA.id, cityId: city.id, zoneId: zone.id, name: `${MARKER} Kitchen`, addressLine1: "1 Test Road",
      latitude: POINT.latitude, longitude: POINT.longitude, deliveryRadius: 5,
      adminStatus: "ACTIVE", clearanceStatus: "CLEARED", reviewStatus: "AUTO_APPROVED",
    },
  })

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    const O = "/api/vendor/v1/outlets"
    const NOPE = "00000000-0000-4000-8000-000000000000"

    // ── 1. the owner's read, serialized ──
    console.log("  ── 1. the vendor's outlet response\n")
    asVendor(vendorA.userId)
    const own = await call("GET", `${O}/${outlet.id}`)
    check("the owner reads their outlet", own.status === 200 && own.json.data?.id === outlet.id, own.json)
    const body = own.json.data as Json
    const keys = allKeys(body)
    check("no `level` key anywhere in the serialized response", !keys.has("level"), [...keys])
    check("…no `operationalStatus` anywhere", !keys.has("operationalStatus"))
    check("…and no capability-ladder value anywhere", !/FULL_OPERATIONS|PLATFORM_DELIVERY|REGISTRATION_ONLY|"MARKETPLACE"/.test(JSON.stringify(body)))
    check("…nor the operational zone name", !JSON.stringify(body).includes("ZZ-OPS-INTERNAL-CODENAME"))
    check("the outlet's zone is { id, public name }",
      JSON.stringify(body.zone) === JSON.stringify({ id: zone.id, name: "ZZ Riverside" }), body.zone)
    const goZone = body.goLiveStatus?.zone as Json
    check("go-live zone keeps the public information the page needs",
      Object.keys(goZone ?? {}).sort().join(",") === "capabilities,id,isOperational,name,onDemandAllowed"
        && goZone.name === "ZZ Riverside" && goZone.isOperational === true, goZone)
    check("…with what the vendor can do there, in their words",
      JSON.stringify(goZone?.capabilities) === JSON.stringify({ orders: true, weDeliver: true, selfDeliver: false, mealPlans: true }),
      goZone?.capabilities)

    // ── 2. another vendor's outlet is indistinguishable from none ──
    console.log("\n  ── 2. another vendor's outlet = a missing outlet\n")
    asVendor(vendorB.userId)
    const routes: Array<[string, string, unknown?]> = [
      ["GET",   ""],
      ["PATCH", "", { name: "Hijacked" }],
      ["POST",  "/deactivate"],
      ["POST",  "/reactivate"],
      ["POST",  "/close-temporarily", { reopenAt: new Date(Date.now() + 86_400_000).toISOString() }],
      ["POST",  "/reopen"],
      ["POST",  "/set-primary"],
      ["PUT",   "/operating-hours", { hours: [] }],
      ["GET",   "/documents/status"],
      ["POST",  "/documents/presign", { documentTypeId: NOPE, fileName: "x.pdf", fileType: "application/pdf" }],
      ["GET",   "/inspections"],
    ]
    for (const [method, suffix, payload] of routes) {
      const foreign = await call(method, `${O}/${outlet.id}${suffix}`, payload ?? (method === "GET" ? undefined : {}))
      const missing = await call(method, `${O}/${NOPE}${suffix}`, payload ?? (method === "GET" ? undefined : {}))
      check(`${method} ${suffix || "/:id"} → another vendor's outlet answers exactly like a missing one (404)`,
        foreign.status === 404 && foreign.json.code === "NOT_FOUND"
          && foreign.status === missing.status && foreign.json.code === missing.json.code && foreign.json.message === missing.json.message,
        { foreign: [foreign.status, foreign.json.code, foreign.json.message], missing: [missing.status, missing.json.code, missing.json.message] })
    }

    // Ownership is still enforced — nothing the foreign calls did landed.
    const after = await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } })
    check("…and none of those calls changed the outlet",
      after.name === outlet.name && after.vendorDisabledAt === null && after.isTemporarilyClosed === false, after)
    asVendor(vendorA.userId)
    check("the owner can still read it", (await call("GET", `${O}/${outlet.id}`)).status === 200)
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

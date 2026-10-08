/*
 * Smoke test — Meals Phase 2.1: reason-backed controls, "Other", CITY →
 * COUNTRY escalation, and reason governance — against the DEV DATABASE.
 *
 * Driven over real HTTP through the REAL admin router (so every body goes
 * through the real controller mappers — bug class #1), with only identity
 * replaced. Builds throwaway countries, cities, vendors, outlets, dishes,
 * admins and reasons; sweeps strays first and cleans up after itself.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/meals.reasons.smoke.ts
 */
import express from "express"
import type { AddressInfo } from "node:net"
import { prisma } from "@repo/db"
import { AdminPermissions, MEAL_REASON_ACTIONS, MealReasonActions as A } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import adminV1Router from "@/modules/admin/routes/v1"
import { errorHandler } from "@/middleware/error"
import { createActionReason, updateActionReason } from "@/modules/admin/services/admin.actionReason.service"

const MARKER = "zz-smoke-mealreasons"
const TZ     = "Pacific/Kiritimati"

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
async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return "NO_ERROR" } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
let adminCtx: { adminUser: { id: string }; adminPermissions: string[]; adminScope: AdminScopeContext } | null = null
const app = express()
app.use(express.json())
app.use("/api/admin/v1", (req, _res, next) => { if (adminCtx) Object.assign(req, adminCtx); next() }, adminV1Router)
app.use(errorHandler)
let baseUrl = ""
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
const READ = AdminPermissions.VENDORS_MEALS_READ
const MOD  = AdminPermissions.VENDORS_MEALS_MODERATE
const as = (id: string, scope: AdminScopeContext, perms: string[] = [READ, MOD]) => {
  adminCtx = { adminUser: { id }, adminPermissions: perms, adminScope: scope }
}

async function sweep() {
  await prisma.adminActionReason.deleteMany({ where: { code: { startsWith: "ZZ_SMOKE_MR" } } })
  const admins = await prisma.adminUser.findMany({ where: { email: { startsWith: MARKER } }, select: { id: true } })
  const adminIds = admins.map((a) => a.id)
  await prisma.mealEscalation.deleteMany({ where: { OR: [{ createdById: { in: adminIds } }, { assignedToId: { in: adminIds } }] } })
  const vendors = await prisma.vendorAccount.findMany({ where: { businessEmail: { startsWith: MARKER } }, select: { id: true } })
  const meals = await prisma.meal.findMany({ where: { outlet: { vendorId: { in: vendors.map((v) => v.id) } } }, select: { id: true, menuItemId: true } })
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...meals.map((m) => m.id), ...meals.map((m) => m.menuItemId), ...adminIds] } },
  })
  await prisma.auditLog.deleteMany({ where: { entityType: "MealEscalation", adminUserId: { in: adminIds } } })
  await prisma.vendorAccount.deleteMany({ where: { id: { in: vendors.map((v) => v.id) } } })
  await prisma.vendorApplication.deleteMany({ where: { businessEmail: { startsWith: MARKER } } })
  await prisma.vendorUser.deleteMany({ where: { email: { startsWith: MARKER } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

async function main() {
  console.log("\n── meals reasons + escalation smoke ────────────────────────\n")
  await sweep()

  const [vendorOps, vendorType, modPerm] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { name: "vendor_ops" } }),
    prisma.vendorType.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }),
    prisma.adminPermission.findUniqueOrThrow({ where: { key: MOD } }),
  ])
  if (!vendorType) { console.error("  SKIPPED — needs an active vendor type"); return }

  const mkCountry = (tag: string, code: string, cur: string) => prisma.country.create({
    data: { name: `ZZ MR ${tag}`, code, slug: `${MARKER}-${tag}`, currency: cur, currencyCode: cur,
      phoneCode: `+9993${tag === "a" ? 1 : 2}`, timezones: [TZ], status: "ACTIVE", readyForCustomerOperations: true },
  })
  const countryA = await mkCountry("a", "ZZMA", "KES")
  const countryB = await mkCountry("b", "ZZMB", "UGX")
  const mkCity = (countryId: string, slug: string) => prisma.city.create({
    data: { countryId, name: `ZZ MR ${slug}`, slug: `${MARKER}-${slug}`, timezone: TZ, status: "ACTIVE", latitude: 0, longitude: 0 },
  })
  const cityA1 = await mkCity(countryA.id, "a1")
  const cityB1 = await mkCity(countryB.id, "b1")

  // Admins: who is and is not an eligible escalation recipient.
  const mkAdmin = async (tag: string, scope: { scopeType: "GLOBAL" | "COUNTRY" | "CITY"; countryId?: string; cityId?: string },
    opts: { moderate?: boolean; status?: "active" | "suspended" } = {}) => {
    const u = await prisma.adminUser.create({
      data: {
        email: `${MARKER}-${tag}@example.test`, firstName: `ZZ ${tag}`, lastName: "Smoke", roleId: vendorOps.id,
        status: opts.status ?? "active", isActive: (opts.status ?? "active") === "active",
      },
    })
    await prisma.adminUserScope.create({
      data: { adminUserId: u.id, scopeType: scope.scopeType, countryId: scope.countryId ?? null, cityId: scope.cityId ?? null },
    })
    if (opts.moderate !== false) {
      await prisma.adminUserPermission.create({ data: { adminUserId: u.id, permissionId: modPerm.id, grantedById: u.id } })
    }
    return u.id
  }
  const cityAdmin       = await mkAdmin("city-a1", { scopeType: "CITY", cityId: cityA1.id, countryId: countryA.id })
  const countryAdminA   = await mkAdmin("country-a", { scopeType: "COUNTRY", countryId: countryA.id })
  const countryNoPerm   = await mkAdmin("country-a-noperm", { scopeType: "COUNTRY", countryId: countryA.id }, { moderate: false })
  const countrySusp     = await mkAdmin("country-a-suspended", { scopeType: "COUNTRY", countryId: countryA.id }, { status: "suspended" })
  const countryAdminB   = await mkAdmin("country-b", { scopeType: "COUNTRY", countryId: countryB.id })
  const globalAdmin     = await mkAdmin("global", { scopeType: "GLOBAL" })
  const otherCityAdmin  = await mkAdmin("city-a1-peer", { scopeType: "CITY", cityId: cityA1.id, countryId: countryA.id })

  const CITY   : AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [cityA1.id], tier: "CITY" }
  const COUNTRY: AdminScopeContext = { isGlobal: false, countryIds: [countryA.id], cityIds: [], tier: "COUNTRY" }
  const COUNTRY_B: AdminScopeContext = { isGlobal: false, countryIds: [countryB.id], cityIds: [], tier: "COUNTRY" }
  const GLOBAL : AdminScopeContext = { isGlobal: true, countryIds: [], cityIds: [], tier: "GLOBAL" }

  // Reasons (global unless noted).
  const mkReason = (code: string, appliesTo: string[], extra: Record<string, unknown> = {}) =>
    prisma.adminActionReason.create({
      data: { code, label: `Label ${code}`, description: `Vendor explanation for ${code}.`, appliesTo, ...extra },
    })
  const rAll      = await mkReason("ZZ_SMOKE_MR_ALL", [...MEAL_REASON_ACTIONS])
  const rHideOnly = await mkReason("ZZ_SMOKE_MR_HIDE", [A.LISTING_HIDE])
  await mkReason("ZZ_SMOKE_MR_OFF", [...MEAL_REASON_ACTIONS], { isActive: false })
  await mkReason("ZZ_SMOKE_MR_NOTEXT", [...MEAL_REASON_ACTIONS], { description: null })
  // A country A overlay of rAll's code with its own wording.
  await mkReason("ZZ_SMOKE_MR_ALL", [...MEAL_REASON_ACTIONS], { countryId: countryA.id, description: "Country A wording for this reason." })

  // Inventory: vendor in A with a dish at an A1 outlet; vendor in B likewise.
  const mkVendor = async (tag: string, countryId: string) => {
    const email = `${MARKER}-${tag}@example.test`
    const user = await prisma.vendorUser.create({ data: { externalAuthId: `${MARKER}-${tag}`, email } })
    const appl = await prisma.vendorApplication.create({ data: { userId: user.id, countryId, vendorTypeId: vendorType.id, businessEmail: email } })
    return prisma.vendorAccount.create({
      data: { userId: user.id, vendorTypeId: vendorType.id, countryId, applicationId: appl.id,
        legalBusinessName: `${MARKER} ${tag}`, businessEmail: email, businessPhone: `+9992${tag === "va" ? 1 : 2}000000`,
        ownerFirstName: "S", ownerLastName: tag, businessAddress: "1 Road", status: "ACTIVE" },
    })
  }
  const vA = await mkVendor("va", countryA.id)
  const vB = await mkVendor("vb", countryB.id)
  const oA = await prisma.outlet.create({ data: { vendorId: vA.id, cityId: cityA1.id, name: `${MARKER} A1`, addressLine1: "1", latitude: 0, longitude: 0 } })
  const oB = await prisma.outlet.create({ data: { vendorId: vB.id, cityId: cityB1.id, name: `${MARKER} B1`, addressLine1: "1", latitude: 0, longitude: 0 } })
  const dishA = await prisma.menuItem.create({ data: { vendorId: vA.id, name: `${MARKER} Dish A`, basePriceMinor: 1000 } })
  const dishB = await prisma.menuItem.create({ data: { vendorId: vB.id, name: `${MARKER} Dish B`, basePriceMinor: 1000 } })
  const mA = await prisma.meal.create({ data: { outletId: oA.id, menuItemId: dishA.id } })
  const mB = await prisma.meal.create({ data: { outletId: oB.id, menuItemId: dishB.id } })

  const server = app.listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const M = "/api/admin/v1/vendors/meals"
  const L = (id: string, act: string) => `${M}/listings/${id}/${act}`
  const audit = async (entityId: string, action: string) => {
    for (let i = 0; i < 30; i++) {
      const row = await prisma.auditLog.findFirst({ where: { entityId, action }, orderBy: { createdAt: "desc" } })
      if (row) return row
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  }
  const reset = () => prisma.meal.update({ where: { id: mA.id }, data: { adminHiddenAt: null, adminStatus: "ACTIVE", adminSuspendedAt: null } })

  try {
    // ════════════════════════════════════════════════════════════════════
    console.log("  ── 1. predefined reasons\n")

    as(cityAdmin, CITY)
    const offered = await call("GET", `${M}/reasons?action=${A.LISTING_HIDE}`)
    const codes = ((offered.json.data?.reasons ?? []) as Json[]).map((r) => r.code)
    check("the picker offers active, applicable, explained reasons only",
      codes.includes(rAll.code) && codes.includes(rHideOnly.code)
      && !codes.includes("ZZ_SMOKE_MR_OFF") && !codes.includes("ZZ_SMOKE_MR_NOTEXT"), codes)
    check("…with the COUNTRY's wording where the country overrides a code",
      ((offered.json.data.reasons as Json[]).find((r) => r.code === rAll.code))?.vendorMessage === "Country A wording for this reason.")
    check("a CITY admin is told: no Other, but may escalate",
      offered.json.data.canUseOther === false && offered.json.data.canEscalate === true, offered.json.data)
    const susOffered = await call("GET", `${M}/reasons?action=${A.LISTING_SUSPEND}`)
    check("a reason is offered only for the actions it applies to",
      !((susOffered.json.data.reasons as Json[]).some((r) => r.code === rHideOnly.code)))
    check("a non-global admin cannot ask about another country's reasons",
      (await call("GET", `${M}/reasons?action=${A.LISTING_HIDE}&countryId=${countryB.id}`)).status === 404)

    const noReason = await call("POST", L(mA.id, "hide"), {})
    check("an action with no reason is refused", noReason.status === 400 && noReason.json.code === "REASON_REQUIRED", noReason.json)
    const inactive = await call("POST", L(mA.id, "hide"), { reasonCode: "ZZ_SMOKE_MR_OFF" })
    check("an inactive reason is refused", inactive.json.code === "INVALID_REASON_CODE", inactive.json)
    const notApplicable = await call("POST", L(mA.id, "suspend"), { reasonCode: rHideOnly.code })
    check("a reason not applicable to the action is refused", notApplicable.json.code === "REASON_NOT_APPLICABLE", notApplicable.json)
    const withText = await call("POST", L(mA.id, "hide"), { reasonCode: rAll.code, vendorMessage: "my own words for the vendor" })
    check("a predefined reason cannot carry the admin's own vendor text",
      withText.json.code === "VENDOR_MESSAGE_ONLY_FOR_OTHER", withText.json)
    check("…and none of those refusals changed anything",
      (await prisma.meal.findUniqueOrThrow({ where: { id: mA.id } })).adminHiddenAt === null)

    const hid = await call("POST", L(mA.id, "hide"), { reasonCode: rAll.code, expectedHidden: false, expectedStatus: "ACTIVE" })
    check("a CITY admin hides with a predefined reason, no note", hid.status === 200, hid.json)
    const hideAudit = await audit(mA.id, "meal.hidden")
    const meta = hideAudit?.metadata as Json
    check("the audit records a STRUCTURED snapshot: id, code, label, country wording",
      meta?.reason?.reasonId && meta.reason.code === rAll.code && meta.reason.label === `Label ${rAll.code}`
      && meta.reason.vendorMessage === "Country A wording for this reason." && meta.reason.isOther === false
      && !("internalNote" in meta), meta)

    // History is a snapshot: rewording the reason later changes nothing recorded.
    await prisma.adminActionReason.updateMany({ where: { code: rAll.code, countryId: countryA.id }, data: { description: "Reworded later." } })
    const detail = (await call("GET", `${M}/listings/${mA.id}`)).json.data as Json
    const h = (detail.controlHistory as Json[]).find((x) => x.action === "meal.hidden")
    check("history keeps the explanation as it was at the time",
      h?.reason?.vendorMessage === "Country A wording for this reason.", h)

    await reset()
    as(countryAdminA, COUNTRY)
    const sb = await call("POST", `${M}/${dishA.id}/send-back`, { reasonCode: rAll.code, internalNote: "spotted in QA" })
    const dishRow = await prisma.menuItem.findUniqueOrThrow({ where: { id: dishA.id } })
    const notice = await prisma.vendorNotification.findFirst({ where: { vendorId: vA.id, type: "MEAL_REJECTED" }, orderBy: { createdAt: "desc" } })
    check("a dish send-back tells the vendor the reason's CURRENT standard wording",
      sb.status === 200 && dishRow.rejectionReason === "Reworded later." && notice?.message === "Reworded later.", { sb: sb.json, dishRow, notice })
    const sbAudit = await audit(dishA.id, "menu_item.sent_back")
    check("…and the internal note is kept apart from it, never shown to the vendor",
      (sbAudit?.metadata as Json)?.internalNote === "spotted in QA" && !notice?.message.includes("spotted"), sbAudit?.metadata)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 2. Other\n")

    const otherText = "The dish photo shows a different meal from the one described."
    as(cityAdmin, CITY)
    const cityOther = await call("POST", L(mA.id, "hide"), { reasonCode: "OTHER", vendorMessage: otherText })
    check("CITY cannot use Other", cityOther.status === 403 && cityOther.json.code === "OTHER_REASON_NOT_ALLOWED", cityOther.json)
    as(countryAdminA, COUNTRY)
    const emptyOther = await call("POST", L(mA.id, "hide"), { reasonCode: "OTHER", vendorMessage: "   " })
    check("an empty Other is refused", emptyOther.json.code === "OTHER_NEEDS_EXPLANATION", emptyOther.json)
    const shortOther = await call("POST", L(mA.id, "hide"), { reasonCode: "OTHER", vendorMessage: "bad dish" })
    check("a token Other is refused", shortOther.json.code === "OTHER_NEEDS_EXPLANATION", shortOther.json)
    const countryOther = await call("POST", L(mA.id, "suspend"), { reasonCode: "OTHER", vendorMessage: otherText, internalNote: "photo mismatch" })
    check("COUNTRY can use Other with an explanation", countryOther.status === 200, countryOther.json)
    const oAudit = (await audit(mA.id, "meal.suspended"))?.metadata as Json
    check("…and the audit says plainly that Other was used, with its text",
      oAudit?.reason?.isOther === true && oAudit.reason.code === "OTHER" && oAudit.reason.vendorMessage === otherText
      && oAudit.reason.reasonId === null && oAudit.internalNote === "photo mismatch", oAudit)
    await reset()
    as(globalAdmin, GLOBAL)
    check("GLOBAL can use Other",
      (await call("POST", L(mB.id, "hide"), { reasonCode: "OTHER", vendorMessage: otherText })).status === 200)

    // Authorization is unchanged by reasons: a perfect reason does not make a
    // CITY admin dish-wide, nor reach another city/country.
    as(cityAdmin, CITY)
    const cityBan = await call("POST", `${M}/${dishA.id}/status`, { status: "BANNED", reasonCode: rAll.code, expectedStatus: "ACTIVE" })
    check("a valid reason does not make a CITY admin dish-wide", cityBan.json.code === "DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE", cityBan.json)
    check("…nor reach a listing in another country", (await call("POST", L(mB.id, "hide"), { reasonCode: rAll.code })).status === 404)

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 3. CITY → COUNTRY escalation\n")

    as(cityAdmin, CITY)
    const rec = await call("GET", `${M}/listings/${mA.id}/escalation-recipients`)
    const recIds = ((rec.json.data ?? []) as Json[]).map((r) => r.id)
    check("recipients: the active country admin of the same country with meals:moderate",
      recIds.includes(countryAdminA), recIds)
    check("…and nobody else: no other country, no global, no unpermitted, no suspended, no city peer",
      ![countryAdminB, globalAdmin, countryNoPerm, countrySusp, otherCityAdmin, cityAdmin].some((id) => recIds.includes(id)), recIds)
    check("…returning names only", Object.keys((rec.json.data as Json[])[0] ?? {}).sort().join() === "firstName,id,lastName")

    const esc = (body: Json, mealId = mA.id) => call("POST", `${M}/listings/${mealId}/escalate`, body)
    const note = "No reason fits: the vendor lists a dish that looks like it contains alcohol."
    check("an ineligible recipient (global admin) is refused",
      (await esc({ assignedToId: globalAdmin, note })).json.code === "INVALID_RECIPIENT")
    check("an ineligible recipient (another country's admin) is refused",
      (await esc({ assignedToId: countryAdminB, note })).json.code === "INVALID_RECIPIENT")
    check("an ineligible recipient (no meals permission) is refused",
      (await esc({ assignedToId: countryNoPerm, note })).json.code === "INVALID_RECIPIENT")
    check("escalating a listing in another country is a 404",
      (await esc({ assignedToId: countryAdminB, note }, mB.id)).status === 404)
    check("a reason-less escalation is refused", (await esc({ assignedToId: countryAdminA, note: "short" })).json.code === "ESCALATION_NOTE_REQUIRED")
    check("an unknown requested action is refused",
      (await esc({ assignedToId: countryAdminA, note, requestedAction: "nuke" })).json.code === "INVALID_REQUESTED_ACTION")

    const created = await esc({ assignedToId: countryAdminA, note, requestedAction: A.LISTING_SUSPEND })
    check("a CITY admin escalates to an eligible country admin", created.status === 201, created.json)
    const row = await prisma.mealEscalation.findUniqueOrThrow({ where: { id: created.json.data.id } })
    check("the record keeps target, action, origin and context",
      row.mealId === mA.id && row.menuItemId === dishA.id && row.outletId === oA.id && row.cityId === cityA1.id
      && row.countryId === countryA.id && row.requestedAction === A.LISTING_SUSPEND && row.note === note
      && row.createdById === cityAdmin && row.assignedToId === countryAdminA && row.status === "PENDING", row)
    check("…and is audited", !!(await audit(row.id, "meal_escalation.created")))
    check("a second open escalation for the same listing is refused",
      (await esc({ assignedToId: countryAdminA, note })).json.code === "ESCALATION_ALREADY_PENDING")

    as(countryAdminA, COUNTRY)
    check("a COUNTRY admin does not escalate (they can use Other)",
      (await call("GET", `${M}/listings/${mA.id}/escalation-recipients`)).json.code === "ESCALATION_CITY_ONLY")
    const listA = ((await call("GET", `${M}/escalations?status=PENDING`)).json.data as Json[]).map((e) => e.id)
    check("the country admin sees the pending escalation", listA.includes(row.id), listA)
    as(countryAdminB, COUNTRY_B)
    const listB = ((await call("GET", `${M}/escalations`)).json.data as Json[]).map((e) => e.id)
    check("another country's admin does not", !listB.includes(row.id))
    check("…nor can resolve it", (await call("POST", `${M}/escalations/${row.id}/resolve`, {})).status === 404)
    as(cityAdmin, CITY)
    check("the city admin cannot resolve it",
      (await call("POST", `${M}/escalations/${row.id}/resolve`, {})).json.code === "ESCALATION_RESOLVE_FORBIDDEN")
    // An escalation grants nothing: resolving needs the resolver's OWN current
    // permission and scope, whoever it was addressed to.
    as(countryAdminA, COUNTRY, [READ])
    check("an admin without meals:moderate cannot resolve, even as the recipient",
      (await call("POST", `${M}/escalations/${row.id}/resolve`, {})).status === 403)
    as(countryNoPerm, { ...COUNTRY }, [READ])
    check("…nor can another country admin without it", (await call("POST", `${M}/escalations/${row.id}/resolve`, {})).status === 403)
    as(countryAdminA, COUNTRY)
    const resolved = await call("POST", `${M}/escalations/${row.id}/resolve`, { note: "Suspended with Other." })
    check("the country admin resolves it", resolved.status === 200
      && (await prisma.mealEscalation.findUniqueOrThrow({ where: { id: row.id } })).status === "RESOLVED", resolved.json)
    check("…once", (await call("POST", `${M}/escalations/${row.id}/resolve`, {})).json.code === "ESCALATION_ALREADY_RESOLVED")

    // ════════════════════════════════════════════════════════════════════
    console.log("\n  ── 4. reason governance\n")

    // Codes are SYSTEM-generated from the name; a label of "ZZ_SMOKE_MR_x"
    // generates code ZZ_SMOKE_MR_x, which keeps every fixture sweepable.
    const create = (input: Json, actor: string, scope: AdminScopeContext) =>
      createActionReason({ description: "Vendor explanation.", appliesTo: [A.LISTING_HIDE], ...input } as never, actor, scope)

    check("a COUNTRY admin cannot create a platform-wide reason",
      await code(create({ label: "ZZ_SMOKE_MR_G1" }, countryAdminA, COUNTRY)) === "REASON_SCOPE_FORBIDDEN")
    const own = await create({ label: "ZZ_SMOKE_MR_C1", countryId: countryA.id }, countryAdminA, COUNTRY)
    check("a COUNTRY admin can create a reason for their own country, with a generated code",
      own.code === "ZZ_SMOKE_MR_C1" && own.countryId === countryA.id, own)
    check("…but not for another country",
      await code(create({ label: "ZZ_SMOKE_MR_C2", countryId: countryB.id }, countryAdminA, COUNTRY)) === "REASON_SCOPE_FORBIDDEN")
    check("a COUNTRY admin cannot edit a platform-wide reason",
      await code(updateActionReason(rAll.id, { isActive: false }, countryAdminA, COUNTRY)) === "REASON_SCOPE_FORBIDDEN")
    check("a CITY admin cannot author reasons at all",
      await code(create({ label: "ZZ_SMOKE_MR_C3", countryId: countryA.id }, cityAdmin, CITY)) === "REASON_SCOPE_FORBIDDEN")
    check("\"OTHER\" cannot be created as a reason",
      await code(create({ code: "other", label: "x" }, globalAdmin, GLOBAL)) === "RESERVED_REASON_CODE")

    const g2 = await create({ label: "ZZ smoke MR image does not represent" }, globalAdmin, GLOBAL)
    check("a GLOBAL admin creates a platform reason; its code is generated from the name",
      g2.code === "ZZ_SMOKE_MR_IMAGE_DOES_NOT_REPRESENT" && g2.countryId === null, g2)
    const g3 = await create({ label: "ZZ smoke MR image does not represent" }, globalAdmin, GLOBAL)
    check("…and a colliding name gets the next free code, never a duplicate",
      g3.code === "ZZ_SMOKE_MR_IMAGE_DOES_NOT_REPRESENT_2", g3.code)
    check("an admin cannot choose a code for a new reason",
      await code(create({ code: "ZZ_SMOKE_MR_CHOSEN", label: "x" }, globalAdmin, GLOBAL)) === "CODE_IS_SYSTEM_GENERATED")
    check("…nor invent one for a country reason that matches no platform reason",
      await code(create({ code: "ZZ_SMOKE_MR_NOPE", label: "x", countryId: countryA.id }, countryAdminA, COUNTRY)) === "CODE_IS_SYSTEM_GENERATED")
    const version = await create({ code: rHideOnly.code, label: "Kenya wording", countryId: countryA.id }, countryAdminA, COUNTRY)
    check("a country VERSION keeps the platform reason's code", version.code === rHideOnly.code && version.countryId === countryA.id)
    check("…once per country", await code(create({ code: rHideOnly.code, label: "again", countryId: countryA.id }, countryAdminA, COUNTRY))
      === "DUPLICATE_REASON")
    const renamed = await updateActionReason(g2.id, { label: "A completely new name" }, globalAdmin, GLOBAL)
    check("renaming a reason never changes its code", renamed.code === "ZZ_SMOKE_MR_IMAGE_DOES_NOT_REPRESENT" && renamed.label === "A completely new name")

    as(countryAdminA, COUNTRY, [READ, MOD, AdminPermissions.SETTINGS_ACTION_REASONS_WRITE])
    const lib = (await call("GET", `${M}/reasons/library?pageSize=50`)).json.data as Json
    const libAll  = (lib.reasons as Json[]).find((r) => r.code === rAll.code && r.countryId === null)
    const libHide = (lib.reasons as Json[]).find((r) => r.code === rHideOnly.code && r.countryId === null)
    const libOwn  = (lib.reasons as Json[]).find((r) => r.code === "ZZ_SMOKE_MR_C1")
    check("the library marks what this admin may manage (server-computed)",
      libAll?.canManage === false && libOwn?.canManage === true && lib.canCreateGlobal === false
      && lib.canCreateCountry?.id === countryA.id, { libAll, libOwn, g: lib.canCreateGlobal, c: lib.canCreateCountry })
    check("…and shows the inactive reason so it can be found again",
      (lib.reasons as Json[]).some((r) => r.code === "ZZ_SMOKE_MR_OFF" && r.isActive === false))
    check("a platform reason names the countries that replaced it, and offers no second version",
      (libHide?.countryVersions as Json[]).some((v) => v.countryName === countryA.name) && libHide?.canAddCountryVersion === false, libHide)
    const g2Row = (lib.reasons as Json[]).find((r) => r.id === g2.id)
    check("…while one without a version for this country offers to add it", g2Row?.canAddCountryVersion === true, g2Row)

    const page1 = (await call("GET", `${M}/reasons/library?page=1&pageSize=2`)).json.data as Json
    const page2 = (await call("GET", `${M}/reasons/library?page=2&pageSize=2`)).json.data as Json
    check("the library pages on the server, 2 per page here, with no row repeated",
      page1.reasons.length === 2 && page2.reasons.length >= 1 && page1.total === lib.total
      && !(page2.reasons as Json[]).some((r) => (page1.reasons as Json[]).some((q) => q.id === r.id)), { t: page1.total })
    const defaultPage = (await call("GET", `${M}/reasons/library`)).json.data as Json
    check("…10 per page by default", defaultPage.pageSize === 10 && defaultPage.reasons.length <= 10)

    const versionDetail = (await call("GET", `${M}/reasons/library/${version.id}`)).json.data as Json
    check("a country version's details name the platform reason it replaces, with its wording",
      versionDetail?.replacesPlatformId === rHideOnly.id && versionDetail.platform?.id === rHideOnly.id && versionDetail.countryName === countryA.name, versionDetail)
    as(countryAdminB, COUNTRY_B, [READ])
    check("another country's admin cannot open a country reason that is not theirs",
      (await call("GET", `${M}/reasons/library/${version.id}`)).status === 404)
    check("…but can open a platform reason", (await call("GET", `${M}/reasons/library/${rHideOnly.id}`)).status === 200)
    as(countryAdminA, COUNTRY)

    const ov = (await call("GET", `${M}/overview`)).json.data as Json
    check("the overview answers in scope", typeof ov?.listings?.current === "number" && ov.canActDishWide === true, ov)
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

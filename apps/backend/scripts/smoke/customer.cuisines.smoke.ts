/*
 * Smoke test — the customer cuisine reads behind /cuisines,
 * /city/[slug]/cuisines and /cuisines/[slug], against the DEV DATABASE.
 *
 *   - the list is PAGED with a TOTAL, pages never overlap, and a country
 *     narrows it to ACTIVE enablements only;
 *   - the detail read 404s a withdrawn cuisine and lists only countries OPEN
 *     TO CUSTOMERS (a country still onboarding vendors is never named);
 *   - page/pageSize/limit route through the REAL controller (bug class #1).
 *
 * Builds its own throwaway rows, cleans up, and sweeps strays first.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.cuisines.smoke.ts
 */
import { prisma } from "@repo/db"

import { handleGetCuisine, handleListCuisines } from "@/modules/customer/controllers/customer.catalog.controller"
import { getCustomerCuisine, listCustomerCuisines } from "@/modules/customer/services/customer.catalog.service"

const MARKER = "zz-smoke-cuisines"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`, detail ?? "") }
}

async function sweep() {
  await prisma.cuisineCountry.deleteMany({ where: { cuisine: { slug: { startsWith: MARKER } } } })
  await prisma.cuisine.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

/** Drive the real Express handler — never a copy of its mapper. */
async function viaController(
  handler: typeof handleListCuisines,
  req: { query?: Record<string, string>; params?: Record<string, string> },
): Promise<{ status: number; data: unknown; code?: string }> {
  let status = 200
  let data: unknown = null
  let error: { statusCode?: number; code?: string } | null = null
  const res = {
    status(code: number) { status = code; return this },
    json(payload: { data?: unknown }) { data = payload?.data ?? null; return this },
  } as never
  await handler({ query: {}, params: {}, ...req } as never, res, ((err: unknown) => { error = err as never }) as never)
  if (error) return { status: (error as { statusCode?: number }).statusCode ?? 500, data: null, code: (error as { code?: string }).code }
  return { status, data }
}

async function main() {
  console.log("\n── customer cuisines smoke ─────────────────────────────────\n")
  await sweep()

  const open = await prisma.country.create({
    data: {
      name: "ZZ Cuisine Open", code: "ZQ1", slug: `${MARKER}-open`, currency: "USD",
      phoneCode: "+9981", timezones: ["Pacific/Pitcairn"], status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const onboarding = await prisma.country.create({
    data: {
      name: "ZZ Cuisine Onboarding", code: "ZQ2", slug: `${MARKER}-onboarding`, currency: "USD",
      phoneCode: "+9982", timezones: ["Pacific/Pitcairn"], status: "ACTIVE", readyForCustomerOperations: false,
    },
  })

  const make = (n: number, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => prisma.cuisine.create({
    data: { code: `${MARKER}-${n}`, slug: `${MARKER}-${n}`, name: `ZZ Cuisine ${n}`, description: `Copy ${n}`, status },
  })
  const [a, b, c, withdrawn] = await Promise.all([make(1), make(2), make(3), make(4, "SUSPENDED")])

  await prisma.cuisineCountry.createMany({
    data: [
      { countryId: open.id, cuisineId: a!.id, status: "ACTIVE" },
      { countryId: open.id, cuisineId: b!.id, status: "INACTIVE" },
      { countryId: onboarding.id, cuisineId: a!.id, status: "ACTIVE" },
      { countryId: open.id, cuisineId: c!.id, status: "ACTIVE" },
    ],
  })

  try {
    // ── 1. Paging ─────────────────────────────────────────────────────────
    const first = await listCustomerCuisines({ page: 1, pageSize: 2 })
    const second = await listCustomerCuisines({ page: 2, pageSize: 2 })
    check("a page carries the TOTAL, not just its own length", first.total >= 3 && first.cuisines.length === 2, first.total)
    check(
      "pages never overlap",
      !second.cuisines.some((x) => first.cuisines.some((y) => y.id === x.id)),
    )
    const everything = await listCustomerCuisines({ pageSize: 60 })
    check("a withdrawn cuisine is never listed", !everything.cuisines.some((x) => x.id === withdrawn!.id))
    check("the description reaches the customer", everything.cuisines.find((x) => x.id === a!.id)?.description === "Copy 1")

    const inCountry = await listCustomerCuisines({ countryId: open.id, pageSize: 60 })
    const ids = inCountry.cuisines.map((x) => x.id)
    check("a country lists what is switched ON there", ids.includes(a!.id) && ids.includes(c!.id))
    check("and not an enablement that is INACTIVE", !ids.includes(b!.id))
    check("the country's total matches its list", inCountry.total === inCountry.cuisines.length, inCountry.total)

    // ── 2. Details ────────────────────────────────────────────────────────
    const detail = await getCustomerCuisine(a!.slug)
    check("a cuisine resolves by slug", detail?.cuisine.id === a!.id)
    check("it names the customer-open country it is on in", detail?.countryIds.includes(open.id) === true)
    check(
      "and NEVER a country still onboarding vendors",
      detail?.countryIds.includes(onboarding.id) === false,
      detail?.countryIds,
    )
    check("a withdrawn cuisine is a 404, not a page", (await getCustomerCuisine(withdrawn!.slug)) === null)

    // ── 3. Through the real controllers ──────────────────────────────────
    const paged = await viaController(handleListCuisines, { query: { page: "2", pageSize: "2" } })
    const pagedData = paged.data as { page: number; pageSize: number }
    check("page and pageSize reach the service", pagedData?.page === 2 && pagedData?.pageSize === 2, pagedData)
    const legacy = await viaController(handleListCuisines, { query: { limit: "3" } })
    check("the landing band's limit= still sets the page size", (legacy.data as { pageSize: number })?.pageSize === 3)
    const scoped = await viaController(handleListCuisines, { query: { countryId: open.id, pageSize: "60" } })
    check(
      "countryId reaches the service",
      (scoped.data as { cuisines: Array<{ id: string }> }).cuisines.every((x) => [a!.id, c!.id].includes(x.id)),
    )
    const found = await viaController(handleGetCuisine, { params: { slug: a!.slug } })
    check("GET /catalog/cuisines/:slug answers 200", found.status === 200)
    const missing = await viaController(handleGetCuisine, { params: { slug: `${MARKER}-nope` } })
    check("an unknown slug answers 404 CUISINE_NOT_FOUND", missing.status === 404 && missing.code === "CUISINE_NOT_FOUND", missing)
  } finally {
    await sweep()
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

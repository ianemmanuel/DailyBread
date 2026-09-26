/*
 * Smoke test — operating markets and point resolution, against the DEV DATABASE.
 *
 * Exercises every Prisma query this pass added or changed:
 *   - listOperatingMarkets()  — the country filter and the boundary filter
 *   - getOperatingCities()    — now selects `slug`
 *   - resolveCustomerLocation() — now returns citySlug and countryId
 *
 * Both filters in listOperatingMarkets are silent when wrong: a country that
 * is not ready for customers, or a city with no boundary, would be OFFERED in
 * the picker and then resolve to nothing. That is the truncated-list failure
 * of bug class #4, so each one is asserted in both directions — present when
 * it should be, absent when it should not.
 *
 * Builds its own throwaway country and city rather than leaning on seed data,
 * so it proves the rule rather than the current contents of the database.
 * Cleans up after itself, and sweeps strays from an aborted earlier run first.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.markets.smoke.ts
 */
import { prisma } from "@repo/db"

import {
  clearOperatingCityCache,
  getCityDetail,
  listOperatingMarkets,
  resolveCustomerLocation,
} from "@/modules/customer/services/customer.geo.service"

const MARKER = "zz-smoke-market"

/* A small square in the middle of the Pacific — far from any real city, so a
 * point inside it can only ever resolve to the city built here. */
const BOUNDARY = {
  type: "Polygon",
  coordinates: [[
    [-140.0, -30.0],
    [-139.0, -30.0],
    [-139.0, -29.0],
    [-140.0, -29.0],
    [-140.0, -30.0],
  ]],
}
const BOX = { north: -29.0, south: -30.0, east: -139.0, west: -140.0 }
const INSIDE = { latitude: -29.5, longitude: -139.5 }

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}`, detail ?? "")
  }
}

async function sweep() {
  const zones = await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  const cities = await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  const countries = await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
  if (cities.count || countries.count || zones.count) {
    console.log(`  swept ${countries.count} country / ${cities.count} city / ${zones.count} zone row(s) from an earlier run`)
  }
}

/** The markets list, with the cache dropped first so a write made a moment ago
 *  is actually visible. The 60s TTL is correct in production and useless in a
 *  test that mutates geometry. */
async function marketsNow() {
  clearOperatingCityCache()
  return listOperatingMarkets()
}

function findCity(markets: Awaited<ReturnType<typeof listOperatingMarkets>>, slug: string) {
  for (const market of markets) {
    const city = market.cities.find((c) => c.slug === slug)
    if (city) return { city, market }
  }
  return null
}

async function main() {
  console.log("\n── customer markets smoke ──────────────────────────────────\n")
  await sweep()

  const countrySlug = `${MARKER}-country`
  const citySlug = `${MARKER}-city`

  // ── Build a country that is NOT yet open to customers ───────────────────
  const country = await prisma.country.create({
    data: {
      name                      : "ZZ Smoke Country",
      code                      : "ZZS",
      slug                      : countrySlug,
      currency                  : "USD",
      phoneCode                 : "+999",
      timezones                 : ["Pacific/Pitcairn"],
      status                    : "ACTIVE",
      readyForCustomerOperations: false,
    },
  })

  const city = await prisma.city.create({
    data: {
      countryId  : country.id,
      name       : "ZZ Smoke City",
      slug       : citySlug,
      timezone   : "Pacific/Pitcairn",
      status     : "ACTIVE",
      boundary   : BOUNDARY,
      boundingBox: BOX,
      /* Stored centroid — a MAP VIEWPORT, never a delivery point. */
      latitude   : INSIDE.latitude,
      longitude  : INSIDE.longitude,
    },
  })

  try {
    // ── 1. The COUNTRY gate ──────────────────────────────────────────────
    check(
      "a country that is not readyForCustomerOperations is not offered",
      findCity(await marketsNow(), citySlug) === null,
    )

    await prisma.country.update({
      where: { id: country.id },
      data : { readyForCustomerOperations: true },
    })

    const opened = findCity(await marketsNow(), citySlug)
    check("once it is ready, its city IS offered", opened !== null)
    check("the city carries the slug the city pages are keyed on", opened?.city.slug === citySlug)
    check("and its name", opened?.city.name === "ZZ Smoke City")
    check("and its timezone", opened?.city.timezone === "Pacific/Pitcairn")
    check("the market carries the country it belongs to", opened?.market.countryId === country.id)
    check("and the country's name", opened?.market.countryName === "ZZ Smoke Country")
    check("and the country's slug", opened?.market.countrySlug === countrySlug)

    // ── 2. Point resolution now carries slug and country ─────────────────
    clearOperatingCityCache()
    const resolved = await resolveCustomerLocation(INSIDE)
    check("a point inside the boundary resolves to the city", resolved.city?.id === city.id)
    check("serviceability carries the city id", resolved.serviceability.cityId === city.id)
    check("serviceability carries the city SLUG", resolved.serviceability.citySlug === citySlug)
    check(
      "serviceability carries the COUNTRY id — country-scoped promotions need it",
      resolved.serviceability.countryId === country.id,
    )

    // ── 3. A point outside every city carries nulls, not stale values ────
    clearOperatingCityCache()
    const outside = await resolveCustomerLocation({ latitude: 0, longitude: 0 })
    check("a point in no city resolves to none", outside.city === null)
    check("its status says so", outside.serviceability.status === "OUTSIDE_COVERAGE")
    check("citySlug is null", outside.serviceability.citySlug === null)
    check("countryId is null", outside.serviceability.countryId === null)

    // ── 3b. Areas of operation ───────────────────────────────────────────
    /*
     * Which zones become a publicly named "area". The rule is the capability
     * flag, not the level — REGISTRATION_ONLY means vendors may sign up and
     * nobody may sell, so naming it would advertise coverage that does not
     * exist. Every other rung can be listed to a customer.
     */
    const zoneBase = {
      cityId    : city.id,
      boundaries: BOUNDARY,
      status    : "ACTIVE" as const,
    }

    await prisma.zone.createMany({
      data: [
        { ...zoneBase, name: "ZZ-OPS-REG-01",  publicName: "ZZ Registration Zone", level: "REGISTRATION_ONLY" },
        { ...zoneBase, name: "ZZ-OPS-MKT-01",  publicName: "ZZ Marketplace Zone",  level: "MARKETPLACE" },
        { ...zoneBase, name: "ZZ-OPS-PLAT-01", publicName: "ZZ Platform Zone",     level: "PLATFORM_DELIVERY" },
        { ...zoneBase, name: "ZZ-OPS-SUSP-01", publicName: "ZZ Suspended Zone",    level: "FULL_OPERATIONS", operationalStatus: "SUSPENDED" },
        { ...zoneBase, name: "ZZ-OPS-ARCH-01", publicName: "ZZ Archived Zone",     level: "FULL_OPERATIONS", status: "INACTIVE" },
      ],
    })

    clearOperatingCityCache()
    const detail = await getCityDetail(citySlug)
    const areas = detail?.areas ?? []

    check("the city resolves by slug", detail?.city.slug === citySlug)
    check("it carries the country", detail?.country.id === country.id)
    check(
      "a REGISTRATION_ONLY zone is NOT named — nobody may sell there",
      !areas.includes("ZZ Registration Zone"),
    )
    check("a MARKETPLACE zone IS named", areas.includes("ZZ Marketplace Zone"))
    check("a PLATFORM_DELIVERY zone IS named", areas.includes("ZZ Platform Zone"))
    check(
      "a SUSPENDED zone is still named — a suspension is temporary, coverage is not",
      areas.includes("ZZ Suspended Zone"),
    )
    check(
      "an INACTIVE zone record is not named",
      !areas.includes("ZZ Archived Zone"),
    )
    check("areas are sorted", [...areas].sort((a, b) => a.localeCompare(b)).join("|") === areas.join("|"))
    /* THE POINT OF publicName. `name` is written for ops and must never be
     * what a customer reads — every zone above deliberately has a different
     * value in each column so this cannot pass by accident. */
    check(
      "areas use publicName, never the operational name",
      areas.every((a) => !a.startsWith("ZZ-OPS-")),
      areas,
    )
    check(
      "areas are NAMES ONLY — no level, status or geometry leaks",
      areas.every((a) => typeof a === "string"),
      areas,
    )
    check(
      "a slug we do not serve resolves to nothing",
      (await getCityDetail("zz-no-such-city")) === null,
    )

    /* The map viewport. Presentation only — the location page opens looking at
     * the city, and what the customer pins is the only thing that becomes a
     * delivery point. Asserted here because a null centroid would silently
     * drop the map to the middle of the ocean. */
    check(
      "the city carries its stored centroid as a viewport",
      detail?.viewport.center?.latitude === INSIDE.latitude &&
      detail?.viewport.center?.longitude === INSIDE.longitude,
      detail?.viewport.center,
    )
    check(
      "and its bounding box, for fitting the initial view",
      detail?.viewport.bounds?.north === BOX.north && detail?.viewport.bounds?.south === BOX.south,
      detail?.viewport.bounds,
    )
    check(
      "the viewport carries no geometry — a box is a view, not the coverage footprint",
      Object.keys(detail?.viewport ?? {}).sort().join(",") === "bounds,center",
      detail?.viewport,
    )

    await prisma.zone.deleteMany({ where: { cityId: city.id } })

    // ── 4. The BOUNDARY gate ─────────────────────────────────────────────
    /* A city with no geometry can never match a point, so offering it in the
     * picker would be offering a choice that resolves to nothing. */
    await prisma.city.update({ where: { id: city.id }, data: { boundary: null } })
    check(
      "a city with no boundary is not offered",
      findCity(await marketsNow(), citySlug) === null,
    )

    /* The legacy `{}` an older clearCityBoundary wrote must read the same way
     * as null — normalizeBoundary is what makes that true. */
    await prisma.city.update({ where: { id: city.id }, data: { boundary: {} } })
    check(
      "a city whose boundary is the legacy empty object is not offered either",
      findCity(await marketsNow(), citySlug) === null,
    )

    // ── 5. An INACTIVE city is not offered ───────────────────────────────
    await prisma.city.update({
      where: { id: city.id },
      data : { boundary: BOUNDARY, status: "INACTIVE" },
    })
    check(
      "an inactive city is not offered even with a boundary",
      findCity(await marketsNow(), citySlug) === null,
    )

    // ── 6. Nothing here leaked into the real markets ─────────────────────
    await prisma.city.update({ where: { id: city.id }, data: { status: "ACTIVE" } })
    const markets = await marketsNow()
    check(
      "every offered city has a name and a slug",
      markets.every((m) => m.cities.every((c) => c.name.length > 0 && c.slug.length > 0)),
    )
    check(
      "no market is returned with an empty city list",
      markets.every((m) => m.cities.length > 0),
    )
  } finally {
    await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
    await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
    await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
    clearOperatingCityCache()
    console.log("  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

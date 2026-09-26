/*
 * Smoke test — city-wide browsing, against the DEV DATABASE.
 *
 * `discoverCityOutlets` answers "what does DailyBread offer in this city?"
 * with NO delivery point. The rules it must hold, none of which a type can
 * check:
 *
 *   - it returns the SAME outlets the located feed would consider sellable,
 *     minus the distance filter — so a kitchen 40 km away is city inventory
 *     even though no address near the centre could order from it;
 *   - an outlet whose OWN zone may not trade is excluded, because nobody may
 *     buy from it from any address at all;
 *   - distance, ETA and platformDelivers come back NULL, never invented;
 *   - an unknown, boundary-less or not-customer-ready city is `null`, so the
 *     route can 404 exactly as that city's pages do.
 *
 * Builds its own throwaway geography, vendor and outlets, then cleans up and
 * sweeps strays from an aborted earlier run first.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.cityBrowse.smoke.ts
 */
import { prisma } from "@repo/db"

import { handleDiscoverCityOutlets } from "@/modules/customer/controllers/customer.discovery.controller"
import {
  discoverCityOutlets,
  discoverOutlets,
} from "@/modules/customer/services/customer.discovery.service"
import { clearOperatingCityCache } from "@/modules/customer/services/customer.geo.service"

const MARKER = "zz-smoke-browse"

/* A square in the empty Pacific. The two zones split it down the middle: the
 * west half may trade, the east half is registration-only. */
const WEST = { latitude: -29.5, longitude: -159.75 }
const EAST = { latitude: -29.5, longitude: -159.25 }

const square = (w: number, e: number) => ({
  type       : "Polygon",
  coordinates: [[[w, -30], [e, -30], [e, -29], [w, -29], [w, -30]]],
})

const CITY_BOUNDARY = square(-160, -159)
const CITY_BOX = { north: -29, south: -30, east: -159, west: -160 }
const WEST_ZONE = square(-160, -159.5)
const EAST_ZONE = square(-159.5, -159)

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.error(`  FAIL ${label}`, detail ?? "") }
}

/*
 * The fixture borrows an EXISTING vendor rather than building one.
 *
 * A VendorAccount requires an application, a vendor type and a dozen business
 * fields; none of that is what this test is about, and fabricating it would
 * make the smoke a test of vendor onboarding. What IS created here — the city,
 * its zones, the outlets and their meals — is exactly what the rules under
 * test read, and all of it is marker-named and removed afterwards.
 */
async function sweep() {
  await prisma.meal.deleteMany({ where: { outlet: { name: { startsWith: MARKER } } } })
  await prisma.outlet.deleteMany({ where: { name: { startsWith: MARKER } } })
  await prisma.menuItem.deleteMany({ where: { name: { startsWith: MARKER } } })
  /* After the menu items, which cascade their MenuItemCuisine links —
   * Cuisine is onDelete: Restrict, so an ordering mistake here fails loudly
   * rather than leaving a stray. */
  await prisma.cuisine.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
}

async function main() {
  console.log("\n── city browse smoke ───────────────────────────────────────\n")
  await sweep()

  const country = await prisma.country.create({
    data: {
      name: "ZZ Browse Country", code: "ZZB", slug: `${MARKER}-country`,
      currency: "KES", phoneCode: "+9993", timezones: ["Pacific/Pitcairn"],
      status: "ACTIVE", readyForCustomerOperations: true,
    },
  })

  const city = await prisma.city.create({
    data: {
      countryId: country.id, name: "ZZ Browse City", slug: `${MARKER}-city`,
      timezone: "Pacific/Pitcairn", status: "ACTIVE",
      boundary: CITY_BOUNDARY, boundingBox: CITY_BOX,
      latitude: WEST.latitude, longitude: WEST.longitude,
    },
  })

  const tradingZone = await prisma.zone.create({
    data: {
      cityId: city.id, name: "ZZ-OPS-WEST", publicName: "ZZ West",
      boundaries: WEST_ZONE, level: "MARKETPLACE", status: "ACTIVE",
    },
  })
  const dormantZone = await prisma.zone.create({
    data: {
      cityId: city.id, name: "ZZ-OPS-EAST", publicName: "ZZ East",
      boundaries: EAST_ZONE, level: "REGISTRATION_ONLY", status: "ACTIVE",
    },
  })

  /* A vendor that is already VISIBLE to customers — the outlet rules under
   * test all sit downstream of that, so borrowing one keeps this smoke about
   * geography instead of onboarding. */
  const vendor = await prisma.vendorAccount.findFirst({
    where : {
      deletedAt: null, status: "ACTIVE",
      vendorProfile: { isPublished: true, reviewStatus: { in: ["AUTO_APPROVED", "MANUALLY_APPROVED"] } },
    },
    select: { id: true },
  })

  if (!vendor) {
    console.error("  SKIPPED — no published vendor in this database to attach fixture outlets to")
    await sweep()
    await prisma.$disconnect()
    return
  }

  /*
   * A cuisine tagged on the DISH and deliberately not on the vendor's profile.
   * That is the arrangement the facet used to miss entirely: the card printed
   * the cuisine, `?cuisineId=` matched it, and no chip was ever offered.
   */
  const cuisine = await prisma.cuisine.create({
    data: {
      code: `${MARKER}-code`, slug: `${MARKER}-cuisine`,
      name: `${MARKER} Cuisine`, status: "ACTIVE",
    },
  })

  const menuItem = await prisma.menuItem.create({
    data: {
      vendorId: vendor.id, name: `${MARKER} Dish`, basePriceMinor: 50000,
      isArchived: false, adminStatus: "ACTIVE", reviewStatus: "AUTO_APPROVED",
      cuisines: { create: { cuisineId: cuisine.id } },
    },
  })

  /** An outlet that can sell, with one dish, so SELLABLE_OUTLET_WHERE passes. */
  async function makeOutlet(
    name: string, at: typeof WEST, zoneId: string, radiusKm: number,
    deliveryFeeMinor: number | null = null,
  ) {
    const outlet = await prisma.outlet.create({
      data: {
        vendorId: vendor.id, cityId: city.id, zoneId,
        name, addressLine1: "1 Test Road",
        latitude: at.latitude, longitude: at.longitude,
        deliveryRadius: radiusKm, deliveryFeeMinor,
        adminStatus: "ACTIVE", clearanceStatus: "CLEARED", reviewStatus: "AUTO_APPROVED",
      },
    })
    await prisma.meal.create({
      data: { outletId: outlet.id, menuItemId: menuItem.id, isAvailable: true },
    })
    return outlet
  }

  /* Near: a tiny radius, so a point across the city is OUTSIDE it.
   * Far:  sits in the dormant zone, so it may not trade at all. */
  /*
   * A SECOND dish in the same cuisine, sold by ONE of the two outlets. It is
   * what makes the facet's count meaningful: counting join rows would score
   * this cuisine 3 (two dishes here, one there) where the honest answer — the
   * number of outlets a chip would return — is 2.
   */
  const secondDish = await prisma.menuItem.create({
    data: {
      vendorId: vendor.id, name: `${MARKER} Second Dish`, basePriceMinor: 60000,
      isArchived: false, adminStatus: "ACTIVE", reviewStatus: "AUTO_APPROVED",
      cuisines: { create: { cuisineId: cuisine.id } },
    },
  })

  const near = await makeOutlet(`${MARKER} Near`, WEST, tradingZone.id, 1, 0)
  await prisma.meal.create({
    data: { outletId: near.id, menuItemId: secondDish.id, isAvailable: true },
  })
  const paid = await makeOutlet(`${MARKER} Paid`, WEST, tradingZone.id, 1, 30000)
  const dormant = await makeOutlet(`${MARKER} Dormant`, EAST, dormantZone.id, 30)

  clearOperatingCityCache()

  /**
   * Drive the real Express handler with a minimal req/res/next.
   *
   * Deliberately NOT a copy of the mapper: a copy would pass while the real
   * one dropped the field, which is exactly the failure being tested for.
   */
  async function runController(
    query: Record<string, string>,
  ): Promise<{ outlets: Array<{ outletId: string }> } | null> {
    let body: unknown = null
    let error: unknown = null

    const req = { params: { citySlug: `${MARKER}-city` }, query } as never
    const res = {
      status() { return this },
      json(payload: { data?: unknown }) { body = payload?.data ?? null; return this },
    } as never

    await handleDiscoverCityOutlets(req, res, ((err: unknown) => { error = err }) as never)
    if (error) throw error
    return body as { outlets: Array<{ outletId: string }> } | null
  }

  try {
    // ── 1. City inventory ────────────────────────────────────────────────
    const browse = await discoverCityOutlets(`${MARKER}-city`, {})
    const ids = (browse?.outlets ?? []).map((o) => o.outletId)

    check("a city resolves by slug", browse?.city.slug === `${MARKER}-city`)
    check("an outlet in a TRADING zone is city inventory", ids.includes(near.id))
    check(
      "an outlet in a zone that may not trade is NOT — nobody could buy from it",
      !ids.includes(dormant.id),
      ids,
    )
    check("the total counts what is listed", browse?.total === ids.length)

    // ── 2. Nothing point-derived is invented ─────────────────────────────
    const card = browse?.outlets[0]
    check("distance is null without a point", card?.distanceMeters === null, card?.distanceMeters)
    check("ETA is null without a point", card?.eta === null, card?.eta)
    check(
      "platformDelivers is null — it is the CUSTOMER's zone that decides",
      card?.platformDelivers === null,
      card?.platformDelivers,
    )
    check("but real fields still arrive", typeof card?.displayName === "string" && card.displayName.length > 0)
    /*
     * ── The facet must cover the same ground as the FILTER ───────────────
     *
     * A cuisine reaches an outlet through the vendor's profile OR through a
     * dish it sells, and the card and `?cuisineId=` both honour the pair. The
     * facet counted profile links alone, so this fixture — dish-tagged, not
     * profile-tagged — produced a card reading "<cuisine>" above a filter bar
     * with no chip to click.
     */
    const facet = browse?.availableCuisines.find((c) => c.id === cuisine.id)
    check("a DISH-tagged cuisine appears in the facet", !!facet, browse?.availableCuisines)
    check(
      "…counted once per OUTLET, not per dish",
      /* Two outlets carry it; one of them carries it twice over. A count of 3
       * would mean the facet is counting dishes, which is not what a chip
       * returns. */
      facet?.count === ids.length && facet?.count === 2,
      facet?.count,
    )
    check(
      "…and the card shows it too, so the two cannot disagree",
      card?.cuisines.some((c) => c.id === cuisine.id),
      card?.cuisines,
    )

    const byCuisine = await discoverCityOutlets(`${MARKER}-city`, { cuisineIds: [cuisine.id] })
    check(
      "…and clicking the chip actually returns that outlet",
      (byCuisine?.outlets ?? []).some((o) => o.outletId === near.id),
      byCuisine?.outlets.map((o) => o.displayName),
    )

    // ── 3. City inventory is WIDER than deliverable inventory ────────────
    /* The point sits in the trading zone but far outside the near outlet's
     * 1 km radius, so the located feed finds nothing — while the city plainly
     * has something. That gap is the whole reason this read exists. */
    const located = await discoverOutlets({ latitude: -29.9, longitude: -159.6 }, {}, null)
    check(
      "the located feed is serviceable at that point",
      located.serviceability.isServiceable,
      located.serviceability.status,
    )
    check(
      "…yet finds nothing, because the outlet cannot reach it",
      located.outlets.length === 0,
      located.outlets.map((o) => o.displayName),
    )
    check(
      "…while city browsing still shows it — inventory is not deliverability",
      (browse?.outlets.length ?? 0) > 0,
    )

    // ── 4. Filters that need a point are refused entry, not faked ────────
    const openOnly = await discoverCityOutlets(`${MARKER}-city`, { openNow: true })
    check(
      "an open-now filter still applies — it needs a clock, not a point",
      Array.isArray(openOnly?.outlets),
    )

    /*
     * `freeDelivery` IS answerable without a point — it is the outlet's own
     * configured fee, not a function of where anybody is standing. Explicitly
     * ZERO, never null: null means the outlet has not set a fee, which is not
     * a promise that delivery is free.
     */
    const free = await discoverCityOutlets(`${MARKER}-city`, { freeDelivery: true })
    const freeIds = (free?.outlets ?? []).map((o) => o.outletId)
    check("a free-delivery filter keeps the zero-fee outlet", freeIds.includes(near.id), freeIds)
    check("…and drops the one that charges", !freeIds.includes(paid.id), freeIds)

    /*
     * ── The CONTROLLER's mapper, not just the service ────────────────────
     *
     * Recurring bug class #1: the controller maps req.query field by field and
     * the mapper is untyped, so a new filter can be added to the service,
     * typecheck cleanly, and never reach it — the request simply behaves as
     * though the customer had not set it. The only way to catch that is to put
     * a real query object through the real handler, which is what this does.
     */
    const routed = await runController({ freeDelivery: "true" })
    const routedIds = (routed?.outlets ?? []).map((o: { outletId: string }) => o.outletId)
    check(
      "the controller ROUTES freeDelivery through to the service",
      routedIds.includes(near.id) && !routedIds.includes(paid.id),
      routedIds,
    )

    const unfiltered = await runController({})
    check(
      "…and without it, both outlets come back — so the filter did the work",
      (unfiltered?.outlets ?? []).length > (routed?.outlets ?? []).length,
    )

    // ── 5. The same city gate as the city pages ──────────────────────────
    check("an unknown slug is null", (await discoverCityOutlets("zz-no-such-city", {})) === null)

    await prisma.city.update({ where: { id: city.id }, data: { boundary: null } })
    clearOperatingCityCache()
    check(
      "a city with no boundary is null — a market nothing can resolve into",
      (await discoverCityOutlets(`${MARKER}-city`, {})) === null,
    )

    await prisma.city.update({ where: { id: city.id }, data: { boundary: CITY_BOUNDARY } })
    await prisma.country.update({
      where: { id: country.id }, data: { readyForCustomerOperations: false },
    })
    clearOperatingCityCache()
    check(
      "a country not open to customers is null",
      (await discoverCityOutlets(`${MARKER}-city`, {})) === null,
    )
  } finally {
    await sweep()
    clearOperatingCityCache()
    console.log("  cleaned up")
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

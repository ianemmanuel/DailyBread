/*
 * Smoke test — the saved delivery address contract, against the DEV DATABASE.
 *
 * This pass made the address book the durable delivery-destination model, and
 * every rule it now rests on is one a type cannot catch:
 *
 *   - a pin is REQUIRED, and both halves of it together;
 *   - the CITY and COUNTRY are resolved from that pin, never taken from the
 *     request — the typed city is print copy and nothing more;
 *   - a supplied country that contradicts the pin is REFUSED, not corrected;
 *   - one customer may keep addresses in several cities and several countries,
 *     and ConsumerAccount.countryId restricts none of them;
 *   - a SELECTED address is authoritative: it beats any coordinates sent
 *     alongside it, and an address that cannot be used is an ERROR rather than
 *     a quiet fall back to a different location;
 *   - `isDefault` (durable preference) and the currently selected address
 *     (per-device) are separate things;
 *   - a country that is not readyForCustomerOperations resolves to no city;
 *   - customer-facing serviceability names a zone by its publicName.
 *
 * Builds its own throwaway geography and customers rather than leaning on seed
 * data. Cleans up after itself, and sweeps strays from an aborted earlier run
 * before it starts.
 *
 *   pnpm dlx tsx --env-file=.env scripts/smoke/customer.address.smoke.ts
 */
import { prisma } from "@repo/db"

import { ApiError } from "@/errors/ApiError"
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from "@/modules/customer/services/customer.address.service"
import { resolveDiscoveryLocation } from "@/modules/customer/services/customer.discovery.service"
import {
  clearOperatingCityCache,
  getCityDetail,
  resolveCustomerLocation,
} from "@/modules/customer/services/customer.geo.service"

const MARKER = "zz-smoke-address"

/* Three squares in the empty Pacific, far apart and far from any real city, so
 * a point inside one can only ever resolve to the city built for it. */
function square(west: number, south: number) {
  return {
    boundary: {
      type       : "Polygon",
      coordinates: [[
        [west, south],
        [west + 1, south],
        [west + 1, south + 1],
        [west, south + 1],
        [west, south],
      ]],
    },
    box   : { north: south + 1, south, east: west + 1, west },
    inside: { latitude: south + 0.5, longitude: west + 0.5 },
  }
}

const CITY_A = square(-150, -30) // country 1
const CITY_B = square(-148, -30) // country 1, a second market
const CITY_C = square(-146, -30) // country 2

/*
 * A city whose zone covers only its EASTERN half, and whose stored centroid
 * sits in the WESTERN half — outside every zone. That is not a contrived
 * shape: the dev database's Nairobi zones do not tile the city either, which
 * is exactly why the centroid is a map viewport and never a delivery point.
 *
 *   west half  → inside the city, in NO zone   → AREA_NOT_LAUNCHED
 *   east half  → inside the city, PAUSED zone  → AREA_PAUSED
 *
 * Both are Case B: geography we know, operations we cannot currently offer.
 */
const CITY_D = square(-144, -30)
const CITY_D_CENTROID = { latitude: -29.5, longitude: -143.75 } // west half, no zone
const CITY_D_PAUSED   = { latitude: -29.5, longitude: -143.25 } // east half, paused zone
const CITY_D_EAST_HALF = {
  type       : "Polygon",
  coordinates: [[
    [-143.5, -30.0],
    [-143.0, -30.0],
    [-143.0, -29.0],
    [-143.5, -29.0],
    [-143.5, -30.0],
  ]],
}

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

/** Assert on the REASON a call failed, never merely that it did — an unrelated
 *  error leaking through would otherwise pass as proof of the rule. */
async function rejects(label: string, code: string, run: () => Promise<unknown>) {
  try {
    await run()
    check(label, false, "call succeeded but should have been refused")
  } catch (err) {
    const actual = err instanceof ApiError ? err.code : `${(err as Error)?.name}: ${(err as Error)?.message}`
    check(label, actual === code, `expected ${code}, got ${actual}`)
  }
}

async function sweep() {
  const addresses = await prisma.consumerAddress.deleteMany({
    where: { consumer: { email: { startsWith: MARKER } } },
  })
  const accounts = await prisma.consumerAccount.deleteMany({ where: { email: { startsWith: MARKER } } })
  const zones = await prisma.zone.deleteMany({ where: { city: { slug: { startsWith: MARKER } } } })
  const cities = await prisma.city.deleteMany({ where: { slug: { startsWith: MARKER } } })
  const countries = await prisma.country.deleteMany({ where: { slug: { startsWith: MARKER } } })
  if (addresses.count || accounts.count || zones.count || cities.count || countries.count) {
    console.log(
      `  swept ${countries.count} country / ${cities.count} city / ${zones.count} zone / ` +
      `${accounts.count} customer / ${addresses.count} address row(s) from an earlier run`,
    )
  }
}

async function main() {
  console.log("\n── customer address smoke ──────────────────────────────────\n")
  await sweep()

  // ── Geography ───────────────────────────────────────────────────────────
  const countryOne = await prisma.country.create({
    data: {
      name: "ZZ Address Country One", code: "ZZ1", slug: `${MARKER}-country-one`,
      currency: "USD", phoneCode: "+9991", timezones: ["Pacific/Pitcairn"],
      status: "ACTIVE", readyForCustomerOperations: true,
    },
  })
  const countryTwo = await prisma.country.create({
    data: {
      name: "ZZ Address Country Two", code: "ZZ2", slug: `${MARKER}-country-two`,
      currency: "USD", phoneCode: "+9992", timezones: ["Pacific/Pitcairn"],
      status: "ACTIVE", readyForCustomerOperations: true,
    },
  })

  const cityA = await prisma.city.create({
    data: {
      countryId: countryOne.id, name: "ZZ Address City A", slug: `${MARKER}-city-a`,
      timezone: "Pacific/Pitcairn", status: "ACTIVE",
      boundary: CITY_A.boundary, boundingBox: CITY_A.box,
    },
  })
  const cityB = await prisma.city.create({
    data: {
      countryId: countryOne.id, name: "ZZ Address City B", slug: `${MARKER}-city-b`,
      timezone: "Pacific/Pitcairn", status: "ACTIVE",
      boundary: CITY_B.boundary, boundingBox: CITY_B.box,
    },
  })
  const cityC = await prisma.city.create({
    data: {
      countryId: countryTwo.id, name: "ZZ Address City C", slug: `${MARKER}-city-c`,
      timezone: "Pacific/Pitcairn", status: "ACTIVE",
      boundary: CITY_C.boundary, boundingBox: CITY_C.box,
    },
  })

  const cityD = await prisma.city.create({
    data: {
      countryId: countryOne.id, name: "ZZ Address City D", slug: `${MARKER}-city-d`,
      timezone: "Pacific/Pitcairn", status: "ACTIVE",
      boundary: CITY_D.boundary, boundingBox: CITY_D.box,
      /* The stored centroid, deliberately in the half no zone covers. */
      latitude: CITY_D_CENTROID.latitude, longitude: CITY_D_CENTROID.longitude,
    },
  })

  /* The two names differ on purpose: an assertion that reads the right one
   * must not be able to pass by accident. */
  await prisma.zone.create({
    data: {
      cityId: cityA.id, name: "ZZ-OPS-CITYA-CENTRAL-01", publicName: "ZZ City A Central",
      boundaries: CITY_A.boundary, level: "MARKETPLACE", status: "ACTIVE",
    },
  })

  await prisma.zone.create({
    data: {
      cityId: cityD.id, name: "ZZ-OPS-CITYD-EAST-01", publicName: "ZZ City D East",
      boundaries: CITY_D_EAST_HALF, level: "MARKETPLACE",
      status: "ACTIVE", operationalStatus: "SUSPENDED",
    },
  })

  const customer = await prisma.consumerAccount.create({
    data: { externalAuthId: `${MARKER}-auth-1`, email: `${MARKER}-one@example.test`, fullName: "ZZ Smoke One" },
  })
  const stranger = await prisma.consumerAccount.create({
    data: { externalAuthId: `${MARKER}-auth-2`, email: `${MARKER}-two@example.test`, fullName: "ZZ Smoke Two" },
  })

  clearOperatingCityCache()

  try {
    // ── 1. A pin is required, and required as a PAIR ──────────────────────
    await rejects(
      "an address with no pin is refused — it is not a delivery destination",
      "LOCATION_REQUIRED",
      () => createAddress(customer.id, {
        addressLine1: "1 Nowhere Road", city: "Somewhere",
      } as never),
    )

    await rejects(
      "half a pin is refused",
      "INCOMPLETE_LOCATION",
      () => createAddress(customer.id, {
        addressLine1: "1 Nowhere Road", city: "Somewhere",
        latitude: CITY_A.inside.latitude,
      } as never),
    )

    /* CASE C — outside every known city. Refused, and nothing is written:
     * there is no Country row to point at, so the row could not even be typed
     * honestly, and persistence of points outside our geography waits for the
     * account work. */
    const beforeOutside = await prisma.consumerAddress.count()
    await rejects(
      "a pin outside every operating city is refused",
      "OUTSIDE_COVERAGE",
      () => createAddress(customer.id, {
        addressLine1: "1 Ocean Road", city: "Atlantis",
        latitude: 0, longitude: 0,
      } as never),
    )
    check(
      "and nothing was persisted for it",
      (await prisma.consumerAddress.count()) === beforeOutside,
    )

    // ── 2. The PIN decides the geography, not the typed city ──────────────
    const home = await createAddress(customer.id, {
      label: "Home", addressLine1: "1 City A Street",
      /* Deliberately a lie. It must survive as print copy and decide nothing. */
      city: "Atlantis",
      latitude: CITY_A.inside.latitude, longitude: CITY_A.inside.longitude,
    } as never)

    check("the typed city is stored verbatim for printing", home.city === "Atlantis")
    check(
      "but the RESOLVED city comes from the coordinates",
      home.serviceability.cityName === "ZZ Address City A",
      home.serviceability,
    )
    check("the country is derived from the pin", home.countryId === countryOne.id)
    check("the address is serviceable in a MARKETPLACE zone", home.serviceability.isServiceable)

    // ── 3. Customer-facing zone label ─────────────────────────────────────
    check(
      "serviceability names the zone by publicName, never the operational name",
      home.serviceability.zoneName === "ZZ City A Central",
      home.serviceability.zoneName,
    )

    // ── 4. A contradicting country is REFUSED, not corrected ──────────────
    await rejects(
      "a supplied country that disagrees with the pin is rejected",
      "COUNTRY_MISMATCH",
      () => createAddress(customer.id, {
        addressLine1: "2 City A Street", city: "City A",
        countryId: countryTwo.id,
        latitude: CITY_A.inside.latitude, longitude: CITY_A.inside.longitude,
      } as never),
    )

    check(
      "a supplied country that AGREES with the pin is accepted",
      (await createAddress(customer.id, {
        label: "Agrees", addressLine1: "3 City A Street", city: "City A",
        countryId: countryOne.id,
        latitude: CITY_A.inside.latitude, longitude: CITY_A.inside.longitude,
      } as never)).countryId === countryOne.id,
    )

    // ── 5. Several cities, several countries, one customer ────────────────
    const work = await createAddress(customer.id, {
      label: "Work", addressLine1: "1 City B Street", city: "City B",
      latitude: CITY_B.inside.latitude, longitude: CITY_B.inside.longitude,
    } as never)
    check("a second address in ANOTHER CITY saves", work.serviceability.cityId === cityB.id)

    const abroad = await createAddress(customer.id, {
      label: "Mum's place", addressLine1: "1 City C Street", city: "City C",
      latitude: CITY_C.inside.latitude, longitude: CITY_C.inside.longitude,
    } as never)
    check("a third address in ANOTHER COUNTRY saves", abroad.countryId === countryTwo.id)
    check("and resolves to that country's city", abroad.serviceability.cityId === cityC.id)

    const account = await prisma.consumerAccount.findUnique({
      where : { id: customer.id },
      select: { countryId: true },
    })
    check(
      "the account adopted the FIRST address's country",
      account?.countryId === countryOne.id,
    )
    check(
      "and it did NOT follow the address abroad — it is a home-market hint, never delivery authority",
      account?.countryId !== countryTwo.id,
    )

    // ── 5b. CASE B — known geography, no operations. KEEP the coordinates ──
    /*
     * The distinction this whole block exists to hold:
     *
     *   "we know where this is and cannot serve it"  ≠  "we do not know where
     *                                                    this is"
     *
     * The first is a delivery address we can store, and a demand signal in a
     * place we might open next. The second has no country to belong to.
     */
    const viewport = (await getCityDetail(`${MARKER}-city-d`))?.viewport
    check(
      "a city exposes its stored centroid as a map VIEWPORT",
      viewport?.center?.latitude === CITY_D_CENTROID.latitude &&
      viewport?.center?.longitude === CITY_D_CENTROID.longitude,
      viewport?.center,
    )
    check(
      "and the boundary's box, for fitting the initial view",
      viewport?.bounds?.north === CITY_D.box.north && viewport?.bounds?.west === CITY_D.box.west,
      viewport?.bounds,
    )

    /* THE REASON THE CENTROID IS NEVER A DELIVERY POINT: this city's own
     * centroid is inside its boundary and inside no zone at all. Handing it to
     * a customer as their location would report a city we serve as unavailable
     * — or, worse, quote a fee measured from a place nobody lives. */
    const atCentroid = await resolveCustomerLocation(CITY_D_CENTROID)
    check("the city centroid resolves to its own city", atCentroid.city?.id === cityD.id)
    check(
      "but is NOT serviceable — it lies outside every zone",
      atCentroid.serviceability.isServiceable === false,
    )
    check(
      "and says so as AREA_NOT_LAUNCHED, not as unknown geography",
      atCentroid.serviceability.status === "AREA_NOT_LAUNCHED",
      atCentroid.serviceability.status,
    )

    const unlaunched = await createAddress(customer.id, {
      label: "Future home", addressLine1: "1 City D West", city: "City D",
      latitude: CITY_D_CENTROID.latitude, longitude: CITY_D_CENTROID.longitude,
    } as never)
    check(
      "an address inside a known city but in NO zone is still saved",
      unlaunched.serviceability.cityId === cityD.id,
    )
    check(
      "its coordinates are stored exactly as given — nothing snaps to a centroid or a zone",
      unlaunched.latitude === CITY_D_CENTROID.latitude &&
      unlaunched.longitude === CITY_D_CENTROID.longitude,
    )
    check(
      "and it is reported honestly as not currently serviceable",
      unlaunched.serviceability.isServiceable === false &&
      unlaunched.serviceability.status === "AREA_NOT_LAUNCHED",
      unlaunched.serviceability.status,
    )

    const paused = await createAddress(customer.id, {
      label: "Paused side", addressLine1: "1 City D East", city: "City D",
      latitude: CITY_D_PAUSED.latitude, longitude: CITY_D_PAUSED.longitude,
    } as never)
    check(
      "an address in a PAUSED zone is saved too — a pause is temporary, the address is not",
      paused.serviceability.cityId === cityD.id,
    )
    check(
      "and reports the pause rather than pretending to be deliverable",
      paused.serviceability.status === "AREA_PAUSED" &&
      paused.serviceability.isServiceable === false,
      paused.serviceability.status,
    )
    check(
      "a paused zone is still named by its publicName",
      paused.serviceability.zoneName === "ZZ City D East",
      paused.serviceability.zoneName,
    )

    // ── 6. isDefault is durable; the SELECTED address is not the same thing ─
    const book = await listAddresses(customer.id)
    check(
      "the book holds every address saved — four cities, two countries, serviceable or not",
      book.length === 6,
      book.length,
    )
    check("the first address saved became the default", book.find((a) => a.id === home.id)?.isDefault === true)
    check("a later address did not", book.find((a) => a.id === abroad.id)?.isDefault === false)

    /* A customer ordering to their Work address has NOT changed their default.
     * The selection is per-device state elsewhere; nothing here records it. */
    const selectedWork = await resolveDiscoveryLocation({ addressId: work.id }, customer.id)
    check(
      "a non-default address can be used as the delivery location",
      selectedWork.city?.id === cityB.id,
    )
    check(
      "and using it does not change which address is the default",
      (await listAddresses(customer.id)).find((a) => a.isDefault)?.id === home.id,
    )

    const promoted = await setDefaultAddress(customer.id, abroad.id)
    check("setting a default moves it", promoted.isDefault === true)
    check(
      "and only one address holds it",
      (await listAddresses(customer.id)).filter((a) => a.isDefault).length === 1,
    )
    await setDefaultAddress(customer.id, home.id)

    // ── 7. A SELECTED address is authoritative ────────────────────────────
    const conflicting = await resolveDiscoveryLocation(
      {
        addressId: home.id,
        /* Coordinates for an entirely different country, sent alongside. A
         * cookie is client-writable, so this is not a hypothetical. */
        latitude : CITY_C.inside.latitude,
        longitude: CITY_C.inside.longitude,
      },
      customer.id,
    )
    check(
      "the address wins over coordinates sent with it",
      conflicting.city?.id === cityA.id,
      conflicting.city?.name,
    )

    await rejects(
      "another customer's address cannot be used, and 404s rather than 403s",
      "ADDRESS_NOT_FOUND",
      () => resolveDiscoveryLocation({ addressId: home.id }, stranger.id),
    )

    await rejects(
      "an unknown address is an ERROR — never a silent fall back to the coordinates beside it",
      "ADDRESS_NOT_FOUND",
      () => resolveDiscoveryLocation(
        {
          addressId: "00000000-0000-4000-8000-000000000000",
          latitude : CITY_C.inside.latitude,
          longitude: CITY_C.inside.longitude,
        },
        customer.id,
      ),
    )

    await rejects(
      "an address id with no signed-in customer is refused",
      "AUTH_REQUIRED",
      () => resolveDiscoveryLocation({ addressId: home.id }, null),
    )

    // ── 8. With NO address, the anonymous point path is untouched ─────────
    const anonymous = await resolveDiscoveryLocation(
      { latitude: CITY_B.inside.latitude, longitude: CITY_B.inside.longitude },
      null,
    )
    check("a bare point still resolves for an anonymous visitor", anonymous.city?.id === cityB.id)
    /* City B has no zone at all, which is the "inside a city, covered by
     * nothing" floor. It is a real verdict and not an error — and note that an
     * address there SAVED perfectly well above: being inside a city we know is
     * what makes a destination storable, while whether we can cook for it today
     * is re-answered on every read. */
    check(
      "a point inside a city but in no zone is not serviceable",
      anonymous.serviceability.isServiceable === false,
    )
    check(
      "and says why — not launched here, rather than outside coverage",
      anonymous.serviceability.status === "AREA_NOT_LAUNCHED",
      anonymous.serviceability.status,
    )
    check(
      "a zoneless point names no zone",
      anonymous.serviceability.zoneName === null,
    )

    // ── 9. An edit re-resolves rather than trusting the old row ───────────
    const moved = await updateAddress(customer.id, work.id, {
      label: "Work", addressLine1: "1 City C Street", city: "City B",
      latitude: CITY_C.inside.latitude, longitude: CITY_C.inside.longitude,
    } as never)
    check("moving an address's pin moves its country too", moved.countryId === countryTwo.id)
    check("and its resolved city", moved.serviceability.cityId === cityC.id)
    check("while the typed city is left exactly as written", moved.city === "City B")

    // ── 10. Country readiness gates POINT RESOLUTION, not just the list ───
    await prisma.country.update({
      where: { id: countryOne.id },
      data : { readyForCustomerOperations: false },
    })
    clearOperatingCityCache()

    const closed = await resolveCustomerLocation(CITY_A.inside)
    check(
      "a point in a country not open to customers resolves to NO city",
      closed.city === null,
      closed.city?.name,
    )
    check("and is not serviceable", closed.serviceability.isServiceable === false)
    check("with the honest reason", closed.serviceability.status === "OUTSIDE_COVERAGE")
    check(
      "a city in a country that IS open still resolves",
      (await resolveCustomerLocation(CITY_C.inside)).city?.id === cityC.id,
    )

    await prisma.country.update({
      where: { id: countryOne.id },
      data : { readyForCustomerOperations: true },
    })
    clearOperatingCityCache()

    // ── 11. Deleting tidies the book without stranding the default ────────
    await deleteAddress(customer.id, home.id)
    const remaining = await listAddresses(customer.id)
    check("the deleted address is gone", !remaining.some((a) => a.id === home.id))
    check(
      "and the book still has exactly one default",
      remaining.filter((a) => a.isDefault).length === 1,
    )
  } finally {
    await prisma.consumerAddress.deleteMany({ where: { consumer: { email: { startsWith: MARKER } } } })
    await prisma.consumerAccount.deleteMany({ where: { email: { startsWith: MARKER } } })
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

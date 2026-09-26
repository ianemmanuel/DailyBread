import { prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { logger } from "@/lib/pino/logger"
import type {
  CustomerAddress, CustomerMarket, UpsertCustomerAddressRequest,
} from "@repo/types/backend"
import { getOperatingCities, resolveCustomerLocation } from "./customer.geo.service"
import { resolveCustomerMarkets } from "./customer.markets"

/*
 * The customer's address book.
 *
 * An address is the anchor for everything else: it decides which restaurants
 * exist for this person, what delivery costs and eventually where the food
 * goes. So each one is returned with its RESOLVED serviceability rather than as
 * bare text — a customer who saves an address we cannot deliver to should be
 * told at the moment they save it, not when they have filled a basket.
 *
 * Serviceability is resolved on READ, never stored. Coverage changes when an
 * admin edits a zone, and a stored answer would quietly go stale with nothing
 * to refresh it — the same derived-not-stored rule the go-live resolvers and
 * discount state follow.
 */

const addressLog = logger.child({ module: "customer-address-service" })

/** A person with more addresses than this is not using an address book. */
const MAX_ADDRESSES = 20

const ADDRESS_SELECT = {
  id: true, label: true, addressLine1: true, addressLine2: true,
  city: true, postalCode: true, countryId: true,
  latitude: true, longitude: true, createdAt: true,
} as const

type AddressRow = {
  id: string; label: string | null; addressLine1: string; addressLine2: string | null
  city: string; postalCode: string | null; countryId: string
  latitude: number; longitude: number; createdAt: Date
}

/** Resolved at the response boundary, on every read. Every saved address has a
 *  pin — that is what makes it a delivery destination — so there is always a
 *  real answer to give. `isDefault` is filled in by `loadAddressBook`, the only
 *  place that can know it: defaults are per CITY, and which city an address is
 *  in is only known once its pin is resolved. */
async function present(row: AddressRow): Promise<CustomerAddress> {
  const { serviceability } = await resolveCustomerLocation({
    latitude: row.latitude, longitude: row.longitude,
  })

  return {
    id          : row.id,
    label       : row.label,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city        : row.city,
    postalCode  : row.postalCode,
    countryId   : row.countryId,
    latitude    : row.latitude,
    longitude   : row.longitude,
    isDefault   : false,
    createdAt   : row.createdAt.toISOString(),
    serviceability,
  }
}

export interface AddressBook {
  addresses       : CustomerAddress[]
  markets         : CustomerMarket[]
  defaultCitySlug : string | null
  defaultAddressId: string | null
}

/**
 * The whole book: every address with its live serviceability, the customer's
 * cities, and the defaults — resolved together, once, by the pure rule in
 * customer.markets.ts.
 *
 * Everything that reports an address back goes through here, so a write can
 * never answer with a different default than the next read would.
 */
export async function loadAddressBook(customerId: string): Promise<AddressBook> {
  const [rows, marketRows, operating] = await Promise.all([
    prisma.consumerAddress.findMany({
      where  : { consumerAccountId: customerId },
      select : ADDRESS_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.consumerMarket.findMany({
      where : { consumerAccountId: customerId },
      select: { cityId: true, isDefault: true, defaultAddressId: true, lastSelectedAt: true },
    }),
    getOperatingCities(),
  ])

  const addresses = await Promise.all(rows.map(present))
  const cities = new Map(operating.map((c) => [c.id, {
    id: c.id, slug: c.slug, name: c.name, countryId: c.countryId,
  }]))

  const resolved = resolveCustomerMarkets({
    rows     : marketRows,
    addresses: addresses.map((a, i) => ({
      id: a.id, cityId: a.serviceability.cityId, createdAt: rows[i]!.createdAt,
    })),
    cities,
  })

  for (const address of addresses) {
    const cityId = address.serviceability.cityId
    address.isDefault = cityId !== null && resolved.defaultAddressByCity.get(cityId) === address.id
  }

  const defaultCity = resolved.markets.find((m) => m.cityId === resolved.defaultCityId) ?? null

  return {
    addresses,
    markets         : resolved.markets,
    defaultCitySlug : defaultCity?.citySlug ?? null,
    defaultAddressId: defaultCity?.defaultAddressId ?? null,
  }
}

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  return (await loadAddressBook(customerId)).addresses
}

/** One address as the book sees it — with its per-city default resolved. */
async function presentFromBook(customerId: string, addressId: string): Promise<CustomerAddress> {
  const found = (await loadAddressBook(customerId)).addresses.find((a) => a.id === addressId)
  if (!found) throw new ApiError(HttpStatus.NOT_FOUND, "Address not found.", "ADDRESS_NOT_FOUND")
  return found
}

export async function createAddress(
  customerId: string,
  input     : UpsertCustomerAddressRequest,
): Promise<CustomerAddress> {
  const { cityId, ...data } = await validate(input)

  const existing = await prisma.consumerAddress.count({ where: { consumerAccountId: customerId } })
  if (existing >= MAX_ADDRESSES) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "You have reached the maximum number of saved addresses. Remove one first.",
      "TOO_MANY_ADDRESSES",
    )
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.consumerAddress.create({
      data  : { ...data, consumerAccountId: customerId },
      select: ADDRESS_SELECT,
    })

    /*
     * Saving an address in a city makes that city one of theirs. The address
     * becomes the city's default only when asked, or when the city has none
     * yet — the first address in Mombasa is the Mombasa default without
     * displacing the Nairobi one.
     */
    const market = await tx.consumerMarket.upsert({
      where : { consumerAccountId_cityId: { consumerAccountId: customerId, cityId } },
      create: { consumerAccountId: customerId, cityId, defaultAddressId: row.id },
      update: { lastSelectedAt: new Date() },
      select: { id: true, defaultAddressId: true },
    })
    if (input.isDefault === true || market.defaultAddressId === null) {
      await tx.consumerMarket.update({ where: { id: market.id }, data: { defaultAddressId: row.id } })
    }

    /*
     * Adopt the country from the customer's first address when the account has
     * none. ConsumerAccount.countryId decides which market they are in, and
     * Clerk never tells us — an address is the first moment we actually know.
     * Never overwritten afterwards: a traveller saving an address abroad should
     * not silently change the market their account belongs to.
     */
    await tx.consumerAccount.updateMany({
      where: { id: customerId, countryId: null },
      data : { countryId: row.countryId },
    })

    return row
  })

  addressLog.info({ customerId, addressId: created.id }, "Address created")
  return presentFromBook(customerId, created.id)
}

export async function updateAddress(
  customerId: string,
  addressId : string,
  input     : UpsertCustomerAddressRequest,
): Promise<CustomerAddress> {
  await assertOwned(customerId, addressId)
  const { cityId, ...data } = await validate(input)

  await prisma.$transaction(async (tx) => {
    await tx.consumerAddress.update({ where: { id: addressId }, data, select: { id: true } })
    /* A moved pin may now be in another city; the old city's stored default
     * simply stops being honoured on the next read. Asking for default makes it
     * the default of the city it is in NOW. */
    if (input.isDefault === true) await makeCityDefault(tx, customerId, cityId, addressId)
  })

  return presentFromBook(customerId, addressId)
}

/**
 * Make this address the default FOR ITS CITY.
 *
 * Per city, not per account: choosing Kilimani as the Nairobi default leaves
 * the Mombasa default exactly where it was. The city is the one the pin
 * resolves into right now, never one the client names.
 */
export async function setDefaultAddress(customerId: string, addressId: string): Promise<CustomerAddress> {
  const row = await prisma.consumerAddress.findFirst({
    where : { id: addressId, consumerAccountId: customerId },
    select: { latitude: true, longitude: true },
  })
  if (!row) throw new ApiError(HttpStatus.NOT_FOUND, "Address not found.", "ADDRESS_NOT_FOUND")

  const { city } = await resolveCustomerLocation({ latitude: row.latitude, longitude: row.longitude })
  if (!city) {
    throw new ApiError(
      HttpStatus.CONFLICT,
      "That address is no longer inside a city we operate in, so it cannot be a default.",
      "ADDRESS_OUTSIDE_MARKETS",
    )
  }

  await prisma.$transaction((tx) => makeCityDefault(tx, customerId, city.id, addressId))
  return presentFromBook(customerId, addressId)
}

/**
 * Remove an address.
 *
 * A hard delete, unlike almost everything else in this codebase, and
 * deliberately: an address is the customer's own data with no downstream
 * references today, and "delete my address" should mean it is gone. When orders
 * exist they will SNAPSHOT the delivery address onto the order rather than
 * pointing at this row — an order has to remain readable after the customer
 * tidies their address book, and a foreign key would make that impossible.
 *
 * A market that named it as its default is cleared by the foreign key
 * (SetNull), and that city falls back to its newest remaining address — so a
 * city with addresses never ends up with no default.
 */
export async function deleteAddress(customerId: string, addressId: string): Promise<{ id: string }> {
  await assertOwned(customerId, addressId)
  await prisma.consumerAddress.delete({ where: { id: addressId } })
  addressLog.info({ customerId, addressId }, "Address deleted")
  return { id: addressId }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function makeCityDefault(tx: Tx, customerId: string, cityId: string, addressId: string) {
  await tx.consumerMarket.upsert({
    where : { consumerAccountId_cityId: { consumerAccountId: customerId, cityId } },
    create: { consumerAccountId: customerId, cityId, defaultAddressId: addressId },
    update: { defaultAddressId: addressId },
  })
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function assertOwned(customerId: string, addressId: string) {
  const row = await prisma.consumerAddress.findFirst({
    where : { id: addressId, consumerAccountId: customerId },
    select: { id: true },
  })
  // 404 rather than 403 for someone else's address: an opaque id must not be
  // probeable, the same rule the admin module applies for scope.
  if (!row) throw new ApiError(HttpStatus.NOT_FOUND, "Address not found.", "ADDRESS_NOT_FOUND")
  return row
}

/**
 * What the client may say, and what the server decides.
 *
 * The client supplies the human-readable lines, a label, and the COORDINATES
 * its location flow produced. Everything geographic is derived from those
 * coordinates by the one existing resolver:
 *
 *   • the city is resolved by point-in-polygon and never read from `city`,
 *     which is kept purely so the address prints the way its owner wrote it;
 *   • the country comes off the RESOLVED city, so an address in Mombasa is a
 *     Kenyan address whatever the caller claimed.
 *
 * A supplied `countryId` is treated as a cross-check and nothing more. When it
 * disagrees with the pin the request is REFUSED rather than quietly corrected:
 * the two statements cannot both be what the customer meant, and silently
 * keeping one would save an address they never entered (the same reasoning as
 * marketing's INVALID_SCOPE).
 */
async function validate(input: UpsertCustomerAddressRequest) {
  const addressLine1 = text(input.addressLine1, "addressLine1", 200, true)
  const city = text(input.city, "city", 100, true)

  const latitude  = coordinate(input.latitude, 90, "latitude")
  const longitude = coordinate(input.longitude, 180, "longitude")

  // Half a pin is not a pin. Accepting one coordinate would store a point on
  // the equator or the prime meridian and quietly treat it as real.
  if ((latitude === null) !== (longitude === null)) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "A map location needs both a latitude and a longitude.",
      "INCOMPLETE_LOCATION",
    )
  }

  // A delivery address without a point cannot take part in serviceability: it
  // cannot be checked for coverage, cannot anchor a feed and cannot receive
  // food. Saving one would leave the customer holding something that looks
  // like an address and is not a destination.
  if (latitude === null || longitude === null) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "Pick this address on the map so we know exactly where to deliver.",
      "LOCATION_REQUIRED",
    )
  }

  /* THE one geography resolver — the same call discovery and the serviceability
   * endpoint make, so an address can never disagree with the feed rendered from
   * it. */
  const resolved = await resolveCustomerLocation({ latitude, longitude })

  /* Outside every operating city there is no country to derive and no coverage
   * to describe, now or later. This is the only place a save is refused on
   * geography: a point INSIDE a city we know is saved whatever its zone says,
   * because "not launched here yet" and "paused right now" are temporary and
   * the address book reports them on every read. */
  if (!resolved.city) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "We do not deliver anywhere near that spot yet, so it cannot be saved as a delivery address.",
      "OUTSIDE_COVERAGE",
    )
  }

  const countryId = resolved.city.countryId

  const claimed = text(input.countryId, "countryId", 64, false)
  if (claimed && claimed !== countryId) {
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      "That map location is not in the country you chose.",
      "COUNTRY_MISMATCH",
    )
  }

  return {
    /** Not an address column — handed back so the caller can record the city
     *  as one of the customer's markets. */
    cityId      : resolved.city.id,
    label       : text(input.label, "label", 40, false),
    addressLine1,
    addressLine2: text(input.addressLine2, "addressLine2", 200, false),
    city,
    postalCode  : text(input.postalCode, "postalCode", 20, false),
    countryId,
    latitude,
    longitude,
  }
}

function text(value: unknown, field: string, max: number, required: true): string
function text(value: unknown, field: string, max: number, required: false): string | null
function text(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value == null || value === "") {
    if (required) throw new ApiError(HttpStatus.BAD_REQUEST, `${label(field)} is required.`, "FIELD_REQUIRED")
    return null
  }
  if (typeof value !== "string") {
    throw new ApiError(HttpStatus.BAD_REQUEST, `${label(field)} is not valid.`, "FIELD_INVALID")
  }
  const trimmed = value.trim()
  if (required && trimmed.length === 0) {
    throw new ApiError(HttpStatus.BAD_REQUEST, `${label(field)} is required.`, "FIELD_REQUIRED")
  }
  if (trimmed.length > max) {
    throw new ApiError(HttpStatus.BAD_REQUEST, `${label(field)} is too long.`, "FIELD_TOO_LONG")
  }
  return trimmed.length === 0 ? null : trimmed
}

function coordinate(value: unknown, limit: number, field: string): number | null {
  if (value == null) return null
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ApiError(HttpStatus.BAD_REQUEST, `That ${field} is not valid.`, "INVALID_LOCATION")
  }
  return value
}

function label(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s(\d)/, " $1")
}

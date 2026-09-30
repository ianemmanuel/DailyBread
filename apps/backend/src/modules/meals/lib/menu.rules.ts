import { ApiError } from "@/middleware/error"

/*
 * Menu rules. Pure — no I/O, no Prisma — so pricing, image ownership and
 * outlet selection are unit-testable on their own, the same convention as
 * the vendor module's profileMedia, payoutProof and placement rules.
 *
 * The two things worth not re-deriving later live here: money is only ever an
 * integer in minor units, and a storage key is only ever accepted after it has
 * been proven to belong to the caller.
 */

// ─── Caps ─────────────────────────────────────────────────────────────────────

export const MAX_MEAL_NAME_LENGTH        = 80
export const MAX_MEAL_DESCRIPTION_LENGTH = 500
export const MAX_PORTION_SIZE_LENGTH     = 60

/** Same catalogue caps the profile uses, for the same reason: a dish tagged
 *  with everything is tagged with nothing, and customer filters degrade. */
export const MAX_MEAL_CUISINES     = 3
export const MAX_MEAL_DIETARY_TAGS = 6

// ─── Money ────────────────────────────────────────────────────────────────────

/*
 * Prices cross the wire as MINOR UNITS, already an integer, and are never
 * parsed from a decimal string on this side.
 *
 * The form does the major-to-minor conversion because only it knows the
 * currency's scale, which comes from Currency.minorUnitDigits and is never
 * assumed to be 2 — KES and USD use 2, UGX and JPY use 0, KWD uses 3. Sending
 * "12.50" here and multiplying by 100 would silently produce 1250 minor units
 * of a currency that has none.
 */

/** A generous ceiling, not a business rule: it exists so a typo like a pasted
 *  phone number fails at the boundary rather than becoming a real price. */
export const MAX_PRICE_MINOR = 100_000_000

export function assertValidPriceMinor(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(
      400,
      `${field} must be a whole number of minor units (e.g. cents), not a decimal.`,
      "INVALID_PRICE",
    )
  }
  if (value <= 0) {
    throw new ApiError(400, "A meal needs a price above zero.", "INVALID_PRICE")
  }
  if (value > MAX_PRICE_MINOR) {
    throw new ApiError(400, "That price looks wrong — please check it.", "INVALID_PRICE")
  }
  return value
}

/** An outlet's optional local price. Null means "use the catalog price", which
 *  is a real answer and not a missing one. */
export function normalizePriceOverride(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  return assertValidPriceMinor(value, "priceOverride")
}

/**
 * What a dish is listed at, at one outlet, before any offer or tax: the
 * outlet's own price when it set one, otherwise the catalog price.
 *
 * The ONE implementation. Offers, tax and the cart all start from this figure,
 * so a second copy is exactly how two screens end up quoting the same dish at
 * two prices.
 */
export function effectiveListPriceMinor(
  basePriceMinor    : number,
  priceMinorOverride: number | null | undefined,
): number {
  return priceMinorOverride ?? basePriceMinor
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function assertMealName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "A meal needs a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > MAX_MEAL_NAME_LENGTH) {
    throw new ApiError(
      400,
      `The name is too long — keep it under ${MAX_MEAL_NAME_LENGTH} characters.`,
      "INVALID_NAME",
    )
  }
  return name
}

// Images: see images.rules.ts.

// ─── Outlet selection ─────────────────────────────────────────────────────────

/**
 * Which of the vendor's outlets sell this dish.
 *
 * An empty selection is refused rather than quietly meaning "all": a dish sold
 * nowhere is invisible to every customer, and a vendor who saved one would
 * reasonably think the save had failed. Callers pass the vendor's real outlet
 * ids, so an id belonging to someone else can never survive this.
 */
export function resolveSelectedOutlets(selected: unknown, ownedOutletIds: string[]): string[] {
  if (ownedOutletIds.length === 0) {
    throw new ApiError(
      400,
      "Create a location first — a meal has to be sold somewhere.",
      "NO_OUTLETS",
    )
  }

  // The common case by far is one outlet, and asking a single-location vendor
  // to pick it would be a control with one option and no decision behind it.
  if (selected === undefined || selected === null) {
    if (ownedOutletIds.length === 1) return [ownedOutletIds[0]!]
    throw new ApiError(400, "Choose which locations sell this meal.", "MISSING_FIELDS")
  }

  if (!Array.isArray(selected) || selected.length === 0) {
    throw new ApiError(400, "Choose at least one location for this meal.", "NO_OUTLET_SELECTED")
  }

  const owned = new Set(ownedOutletIds)
  const unique = [...new Set(selected.map(String))]

  const foreign = unique.filter((id) => !owned.has(id))
  if (foreign.length > 0) {
    throw new ApiError(404, "One of those locations doesn't exist", "OUTLET_NOT_FOUND")
  }

  return unique
}

/** Caps applied to a tag selection, so a bad request fails with the cap named
 *  rather than being silently truncated. */
export function assertTagSelection(ids: unknown, max: number, label: string): string[] {
  if (ids === undefined || ids === null) return []
  if (!Array.isArray(ids)) throw new ApiError(400, `${label} must be a list`, "INVALID_FIELD")
  const unique = [...new Set(ids.map(String))]
  if (unique.length > max) {
    throw new ApiError(400, `You can pick up to ${max} ${label}.`, "TOO_MANY_TAGS")
  }
  return unique
}

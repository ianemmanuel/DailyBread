import { ApiError } from "@/middleware/error"

/*
 * Menu rules. Pure — no I/O, no Prisma — so pricing, image ownership and
 * outlet selection are unit-testable on their own, the same convention as
 * vendor.profileMedia.ts, vendor.payoutProof.ts and vendor.placement.ts.
 *
 * The two things worth not re-deriving later live here: money is only ever an
 * integer in minor units, and a storage key is only ever accepted after it has
 * been proven to belong to the caller.
 */

// ─── Caps ─────────────────────────────────────────────────────────────────────

/** One hero shot plus a small gallery. Uber Eats and DoorDash both show a
 *  single dish photo in the list and allow a handful on the item page; more
 *  than this is an unmanaged photo dump rather than a curated set. */
export const MAX_MEAL_IMAGES = 6

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

export function normalizeOptionalText(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new ApiError(400, `${label} must be text.`, "INVALID_FIELD")
  const text = value.trim()
  if (!text) return null
  if (text.length > max) {
    throw new ApiError(400, `${label} is too long — keep it under ${max} characters.`, "INVALID_FIELD")
  }
  return text
}

// ─── Images ───────────────────────────────────────────────────────────────────

/**
 * Proves a storage key belongs to this vendor before anything is done with it.
 *
 * Same security model as assertOwnedProfileMediaKey, and load-bearing for the
 * same reason: without it, "discard this key" is a delete-anything primitive
 * and a vendor could pass another vendor's photo, a payout proof, or an
 * application document. The key must match exactly what generateMealImageKey
 * produces for THIS vendor — one path segment after the vendor id, no
 * traversal, and no prefix collision (`vendor-1` must not match
 * `vendor-1-extra`, which a startsWith check would allow).
 */
export function assertOwnedMealImageKey(storageKey: unknown, vendorId: string): string {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new ApiError(400, "storageKey is required", "MISSING_FIELDS")
  }
  if (storageKey.includes("..") || storageKey.includes("//")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  const [root, keyVendorId, filename, ...rest] = storageKey.split("/")

  if (root !== "meal-images" || keyVendorId !== vendorId || !filename || rest.length > 0) {
    throw new ApiError(403, "That image does not belong to you", "FORBIDDEN")
  }

  return storageKey
}

export interface NormalizedMealImages {
  /** The one shown in listings. Null only when the vendor uploaded nothing. */
  mainImageKey: string | null
  /** Every key the item references, main first. Stored whole so the row is the
   *  single source of truth for what to keep in the bucket. */
  imageKeys   : string[]
}

/**
 * Validates the submitted image set and settles which one is the hero.
 *
 * The main image is the FIRST key rather than a separate field the client
 * sends, so reordering in the form is the same gesture as choosing the hero —
 * which is how Uber Eats, Square and Toast all present it. Two fields would
 * let a client submit a main image that is not in the gallery, and then the
 * cleanup pass could orphan an object the row still renders.
 */
export function normalizeMealImages(keys: unknown, vendorId: string): NormalizedMealImages {
  if (keys === undefined || keys === null) return { mainImageKey: null, imageKeys: [] }
  if (!Array.isArray(keys)) {
    throw new ApiError(400, "images must be a list of storage keys", "INVALID_FIELD")
  }
  if (keys.length > MAX_MEAL_IMAGES) {
    throw new ApiError(
      400,
      `You can add up to ${MAX_MEAL_IMAGES} photos to a meal.`,
      "TOO_MANY_IMAGES",
    )
  }

  const owned = keys.map((k) => assertOwnedMealImageKey(k, vendorId))
  const unique = [...new Set(owned)]
  if (unique.length !== owned.length) {
    throw new ApiError(400, "The same photo was added twice.", "DUPLICATE_IMAGE")
  }

  return { mainImageKey: unique[0] ?? null, imageKeys: unique }
}

/**
 * Keys the previous save referenced that this one does not — the objects to
 * delete from the bucket. Removing a photo has to actually remove it, or every
 * replacement leaks a paid-for object nothing can ever reach again.
 */
export function orphanedImageKeys(before: string[], after: string[]): string[] {
  const kept = new Set(after)
  return before.filter((key) => !kept.has(key))
}

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

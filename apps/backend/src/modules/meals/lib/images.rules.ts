import { ApiError } from "@/middleware/error"

/*
 * Dish photographs — who owns a key, where each kind of object lives, and what
 * a save does to a dish's images. Pure: no I/O, no Prisma.
 *
 * THREE places a photo's bytes can be, and the split is the lifecycle:
 *
 *   meal-uploads/<vendorId>/<uuid>.<ext>   PRIVATE  staging — what the browser
 *                                                   PUTs to. Never attached as
 *                                                   is; an R2 lifecycle rule
 *                                                   expires anything left here.
 *   meal-images/<vendorId>/<uuid>.<ext>    PRIVATE  the permanent original,
 *                                                   copied from staging on save.
 *                                                   Never served.
 *   meals/<uuid>.webp                      PUBLIC   the master this server
 *                                                   produced — the only thing a
 *                                                   client is ever sent.
 *
 * The vendor segment on the two private prefixes is load-bearing: it is what
 * lets the backend prove a key belongs to the caller before it processes,
 * attaches or deletes anything. The public key carries no vendor — it is
 * handed to every customer, and nothing is authorised by it.
 */

/** One hero shot plus a small gallery. Uber Eats and DoorDash both show a
 *  single dish photo in the list and allow a handful on the item page; more
 *  than this is an unmanaged photo dump rather than a curated set. */
export const MAX_MEAL_IMAGES = 6

export const mealUploadPrefix   = (vendorId: string) => `meal-uploads/${vendorId}`
export const mealOriginalPrefix = (vendorId: string) => `meal-images/${vendorId}`
export const MEAL_PUBLIC_PREFIX = "meals"

/**
 * Proves a key is one of THIS vendor's staged uploads.
 *
 * Load-bearing for the same reason as every owned-key guard here: without it,
 * "process / discard this key" is a read- or delete-anything primitive and a
 * vendor could pass another vendor's upload, a payout proof or an application
 * document. The exact prefix, exactly one segment after it, no traversal, and
 * no prefix collision (`vendor-1` must not match `vendor-1-extra`).
 */
export function assertOwnedStagedKey(storageKey: unknown, vendorId: string): string {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new ApiError(400, "storageKey is required", "MISSING_FIELDS")
  }
  if (storageKey.includes("..") || storageKey.includes("//")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  const expected = `${mealUploadPrefix(vendorId)}/`
  const rest = storageKey.startsWith(expected) ? storageKey.slice(expected.length) : ""
  if (!rest || rest.includes("/")) {
    throw new ApiError(403, "That image does not belong to you", "FORBIDDEN")
  }
  return storageKey
}

/** Where a staged upload's original is kept once it is attached — same file
 *  name, permanent prefix. Only ever called on a key assertOwnedStagedKey has
 *  already accepted. */
export function originalKeyForStaged(stagedKey: string, vendorId: string): string {
  const fileName = stagedKey.slice(`${mealUploadPrefix(vendorId)}/`.length)
  return `${mealOriginalPrefix(vendorId)}/${fileName}`
}

/** One entry of a dish's submitted gallery, in order. */
export type ImageSlot =
  | { kind: "attached"; originalKey: string }
  | { kind: "staged"; stagedKey: string }

/**
 * Validates a submitted gallery and says what each entry IS.
 *
 * The form sends keys: a photo already on this dish is identified by its
 * original's key (what the dish's own read returned), a new one by its staging
 * key. Anything else — another dish's photo, another vendor's upload, any
 * other bucket path — is refused, never silently dropped.
 *
 * Order is the vendor's: the FIRST entry is the main image, so reordering in
 * the form is the same gesture as choosing the hero. Absent means no photos,
 * which a dish is allowed to have.
 */
export function planMealImages(
  submitted          : unknown,
  vendorId           : string,
  attachedOriginalKeys: readonly string[],
): ImageSlot[] {
  if (submitted === undefined || submitted === null) return []
  if (!Array.isArray(submitted)) {
    throw new ApiError(400, "images must be a list of storage keys", "INVALID_FIELD")
  }
  if (submitted.length > MAX_MEAL_IMAGES) {
    throw new ApiError(400, `You can add up to ${MAX_MEAL_IMAGES} photos to a meal.`, "TOO_MANY_IMAGES")
  }

  const attached = new Set(attachedOriginalKeys)
  const slots = submitted.map((key): ImageSlot =>
    typeof key === "string" && attached.has(key)
      ? { kind: "attached", originalKey: key }
      : { kind: "staged", stagedKey: assertOwnedStagedKey(key, vendorId) },
  )

  const keys = slots.map((s) => (s.kind === "attached" ? s.originalKey : s.stagedKey))
  if (new Set(keys).size !== keys.length) {
    throw new ApiError(400, "The same photo was added twice.", "DUPLICATE_IMAGE")
  }
  return slots
}

/**
 * What a save does to the dish's existing rows: which survive and at what
 * position, and which are gone. Kept rows are never reprocessed — a reorder is
 * a position change and nothing else.
 */
export function diffMealImages<Row extends { id: string; originalKey: string }>(
  current: readonly Row[],
  plan   : readonly ImageSlot[],
): { keep: Array<{ row: Row; position: number }>; removed: Row[]; staged: Array<{ stagedKey: string; position: number }> } {
  const byOriginal = new Map(current.map((row) => [row.originalKey, row]))
  const keep: Array<{ row: Row; position: number }> = []
  const staged: Array<{ stagedKey: string; position: number }> = []

  plan.forEach((slot, position) => {
    if (slot.kind === "attached") keep.push({ row: byOriginal.get(slot.originalKey)!, position })
    else staged.push({ stagedKey: slot.stagedKey, position })
  })

  const kept = new Set(keep.map((k) => k.row.id))
  return { keep, staged, removed: current.filter((row) => !kept.has(row.id)) }
}

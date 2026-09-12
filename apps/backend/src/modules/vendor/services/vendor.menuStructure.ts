import { ApiError } from "@/middleware/error"

/*
 * Menu structure rules — prep time, and reordering.
 *
 * Pure: no I/O, no Prisma. Same convention as vendor.menu.ts,
 * vendor.modifiers.ts and vendor.operatingHours.ts.
 */

// ─── Prep time ────────────────────────────────────────────────────────────────

/** Four hours. Not a claim that a four-hour dish is sensible — it is the point
 *  past which the number is a typo rather than a kitchen. */
export const MAX_PREP_TIME_MINUTES = 240

/**
 * Minutes from an order being accepted to the dish being ready.
 *
 * Null is a real answer and the default: a vendor who has not said is
 * genuinely different from one who said zero, and nothing consumes this yet
 * (there is no order model), so inventing a number would be a lie with a
 * figure attached. Zero itself is refused for the same reason — no dish is
 * instant, so a zero is someone clearing the field rather than meaning it.
 */
export function normalizePrepTime(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, "Prep time must be a whole number of minutes.", "INVALID_PREP_TIME")
  }
  if (value <= 0) {
    throw new ApiError(
      400,
      "Prep time has to be at least a minute — leave it empty if you'd rather not say.",
      "INVALID_PREP_TIME",
    )
  }
  if (value > MAX_PREP_TIME_MINUTES) {
    throw new ApiError(
      400,
      `Prep time can be at most ${MAX_PREP_TIME_MINUTES} minutes.`,
      "INVALID_PREP_TIME",
    )
  }
  return value
}

// ─── Reordering ───────────────────────────────────────────────────────────────

/**
 * Turns a submitted id order into positions.
 *
 * Deliberately requires the COMPLETE set rather than accepting a partial one.
 * A partial reorder has no correct answer — if the client sends three of eight
 * ids, where do the other five go? Two clients disagreeing about that is how a
 * menu silently rearranges itself. Sending the whole list means the submitted
 * order IS the order, which is also what the UI naturally has to hand.
 *
 * `expectedIds` comes from the caller's own scoped query, so an id belonging to
 * another vendor can never survive this.
 */
export function resolveOrdering(submitted: unknown, expectedIds: readonly string[]): string[] {
  if (!Array.isArray(submitted)) {
    throw new ApiError(400, "Send the new order as a list of ids.", "INVALID_FIELD")
  }

  const ids = submitted.map(String)
  const unique = new Set(ids)

  if (unique.size !== ids.length) {
    throw new ApiError(400, "The same item appears twice in that order.", "DUPLICATE_IN_ORDER")
  }

  const expected = new Set(expectedIds)
  const foreign = ids.filter((id) => !expected.has(id))
  if (foreign.length > 0) {
    throw new ApiError(404, "One of those items doesn't exist", "NOT_FOUND")
  }

  if (ids.length !== expectedIds.length) {
    throw new ApiError(
      400,
      "Send the whole list in its new order, not just the parts that moved.",
      "INCOMPLETE_ORDER",
    )
  }

  return ids
}

/** A new row goes to the END of its list. A vendor adding their fortieth dish
 *  did not ask for it to lead the menu, and promoting it would quietly demote
 *  something they had deliberately placed. */
export function nextPosition(highestExisting: number | null | undefined): number {
  return (highestExisting ?? -1) + 1
}

// ─── Section names ────────────────────────────────────────────────────────────

export const MAX_SECTION_NAME_LENGTH = 60

export function assertSectionName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "A section needs a name.", "MISSING_FIELDS")
  }
  const name = value.trim()
  if (name.length > MAX_SECTION_NAME_LENGTH) {
    throw new ApiError(
      400,
      `That name is too long — keep it under ${MAX_SECTION_NAME_LENGTH} characters.`,
      "INVALID_NAME",
    )
  }
  return name
}

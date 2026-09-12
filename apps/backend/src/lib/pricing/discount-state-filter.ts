import type { DiscountLifecycleInput, DiscountState } from "./discount"

/*
 * The derived discount state, expressed as conditions a query can filter on.
 *
 * deriveDiscountState() is the authority and this is a TRANSCRIPTION of it, so
 * the pair can drift — which is the whole risk of filtering a derived value in
 * SQL. Two things hold them together:
 *
 *   1. `matchesState()` below is the same conditions written against an
 *      in-memory row, and the test asserts it agrees with deriveDiscountState
 *      for every state across a spread of rows. A drift fails the suite.
 *   2. The Prisma where-clause in the admin service is built from this file's
 *      documented shape, in the same precedence order, and is exercised
 *      against the real database by the smoke test.
 *
 * Precedence matters and is identical to the pure function: suspended beats
 * paused beats expired beats exhausted beats scheduled beats awaiting-go-live.
 * Each state's condition therefore has to EXCLUDE the ones above it, which is
 * why these read as compound rather than as one check each.
 */

export interface StateMatchInput extends DiscountLifecycleInput {
  /** Whether the owning vendor's storefront is published. */
  vendorIsLive: boolean
}

/**
 * Whether one row is in one state, using exactly the conditions the SQL filter
 * uses. Kept beside the filter rather than in the service so the test can hold
 * it against deriveDiscountState directly.
 */
export function matchesState(row: StateMatchInput, state: DiscountState, now: Date): boolean {
  const suspended = row.suspendedAt !== null
  const paused = row.isPaused
  const expired = row.endsAt !== null && row.endsAt.getTime() <= now.getTime()
  const exhausted =
    (row.budgetMinor !== null && row.spentMinor >= row.budgetMinor) ||
    (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions)
  const notStarted = row.startsAt.getTime() > now.getTime()

  switch (state) {
    case "SUSPENDED":
      return suspended
    case "PAUSED":
      return !suspended && paused
    case "EXPIRED":
      return !suspended && !paused && expired
    case "EXHAUSTED":
      return !suspended && !paused && !expired && exhausted
    case "SCHEDULED":
      return !suspended && !paused && !expired && !exhausted && notStarted
    case "AWAITING_GO_LIVE":
      return !suspended && !paused && !expired && !exhausted && !notStarted && !row.vendorIsLive
    case "RUNNING":
      return !suspended && !paused && !expired && !exhausted && !notStarted && row.vendorIsLive
  }
}

/** The states this module can filter, so a caller can validate input against
 *  one list rather than a string literal scattered about. */
export const FILTERABLE_STATES: DiscountState[] = [
  "SUSPENDED", "PAUSED", "EXPIRED", "EXHAUSTED", "SCHEDULED", "AWAITING_GO_LIVE", "RUNNING",
]

export function isFilterableState(value: unknown): value is DiscountState {
  return typeof value === "string" && (FILTERABLE_STATES as string[]).includes(value)
}

import { describe, it, expect } from "vitest"
import { deriveDiscountState, type DiscountState } from "./discount"
import { matchesState, FILTERABLE_STATES, isFilterableState } from "./discount-state-filter"

/*
 * The test that keeps the SQL filter honest.
 *
 * Filtering a DERIVED value in the database means transcribing a pure function
 * into query conditions, and a transcription can drift. This asserts the two
 * agree for every state across a spread of rows: if someone changes the
 * precedence in deriveDiscountState and forgets the filter, this fails.
 */

const NOW = new Date("2026-06-01T12:00:00Z")
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const BASE = {
  isPaused       : false,
  suspendedAt    : null as Date | null,
  startsAt       : day(-1),
  endsAt         : null as Date | null,
  budgetMinor    : null as number | null,
  spentMinor     : 0,
  maxRedemptions : null as number | null,
  redemptionCount: 0,
  vendorIsLive   : true,
}

/* Every interesting shape, including ones that satisfy several conditions at
 * once — those are exactly where a precedence mistake shows up. */
const ROWS = [
  { label: "plain running",          row: BASE },
  { label: "not live",               row: { ...BASE, vendorIsLive: false } },
  { label: "not started",            row: { ...BASE, startsAt: day(5) } },
  { label: "not started, not live",  row: { ...BASE, startsAt: day(5), vendorIsLive: false } },
  { label: "ended",                  row: { ...BASE, endsAt: day(-1) } },
  { label: "ends exactly now",       row: { ...BASE, endsAt: NOW } },
  { label: "budget spent",           row: { ...BASE, budgetMinor: 100, spentMinor: 100 } },
  { label: "budget nearly spent",    row: { ...BASE, budgetMinor: 100, spentMinor: 99 } },
  { label: "uses exhausted",         row: { ...BASE, maxRedemptions: 5, redemptionCount: 5 } },
  { label: "paused",                 row: { ...BASE, isPaused: true } },
  { label: "paused AND ended",       row: { ...BASE, isPaused: true, endsAt: day(-1) } },
  { label: "suspended",              row: { ...BASE, suspendedAt: NOW } },
  { label: "suspended AND paused",   row: { ...BASE, suspendedAt: NOW, isPaused: true } },
  { label: "suspended AND ended",    row: { ...BASE, suspendedAt: NOW, endsAt: day(-1) } },
  { label: "exhausted AND not live", row: { ...BASE, budgetMinor: 1, spentMinor: 1, vendorIsLive: false } },
  { label: "ended AND exhausted",    row: { ...BASE, endsAt: day(-1), budgetMinor: 1, spentMinor: 1 } },
]

describe("matchesState agrees with deriveDiscountState", () => {
  for (const { label, row } of ROWS) {
    it(label, () => {
      const truth = deriveDiscountState(row, NOW, row.vendorIsLive)

      for (const state of FILTERABLE_STATES) {
        expect(
          matchesState(row, state, NOW),
          `${label}: expected matchesState(${state}) to be ${state === truth}`,
        ).toBe(state === truth)
      }
    })
  }

  it("puts every row in exactly one state", () => {
    // A row matching two states would make a filtered count wrong in a way
    // nobody notices until the numbers stop adding up.
    for (const { label, row } of ROWS) {
      const hits = FILTERABLE_STATES.filter((s) => matchesState(row, s, NOW))
      expect(hits, label).toHaveLength(1)
    }
  })

  it("covers every state the pure function can return", () => {
    const reachable = new Set<DiscountState>(ROWS.map((r) => deriveDiscountState(r.row, NOW, r.row.vendorIsLive)))
    for (const state of FILTERABLE_STATES) {
      expect(reachable.has(state), `no sample row produces ${state}`).toBe(true)
    }
  })
})

describe("isFilterableState", () => {
  it("accepts a real state and rejects anything else", () => {
    expect(isFilterableState("RUNNING")).toBe(true)
    expect(isFilterableState("all")).toBe(false)
    expect(isFilterableState("")).toBe(false)
    expect(isFilterableState(undefined)).toBe(false)
  })
})

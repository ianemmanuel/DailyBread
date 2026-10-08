import { describe, it, expect } from "vitest"
import { ProfileReviewStatus as R, MealStatus as S } from "@repo/db"
import { ApiError } from "@/middleware/error"
import {
  MODIFIER_CONTENT_FLAG as MOD,
  groupBlocksDish,
  nextDishReview,
  assertDishApprovable,
  mealStatusTransition,
  REASON_REQUIRED_ACTIONS,
  dishReadScopeWhere, dishInReadScope, canActDishWide, assertDishWideAuthority,
} from "./moderation.rules"
import type { AdminScopeContext } from "@repo/types/backend"

const blocked    = { blocked: true,  groupRescreened: false }
const cleared    = { blocked: false, groupRescreened: false }
const reEditedBad = { blocked: true,  groupRescreened: true }

describe("groupBlocksDish", () => {
  it("blocks while a group waits on an admin or on the vendor", () => {
    expect(groupBlocksDish(R.FLAGGED)).toBe(true)
    expect(groupBlocksDish(R.MANUALLY_REJECTED)).toBe(true)
  })
  it("does not block a cleared group", () => {
    expect(groupBlocksDish(R.AUTO_APPROVED)).toBe(false)
    expect(groupBlocksDish(R.MANUALLY_APPROVED)).toBe(false)
  })
})

describe("nextDishReview — automatic statuses follow the reasons", () => {
  it("flags a clean dish when a group blocks it", () => {
    expect(nextDishReview({ reviewStatus: R.AUTO_APPROVED, flagReasons: [], rejectionReason: null }, blocked))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [MOD], newlyFlagged: true })
  })
  it("auto-approves once the only reason was the group and it cleared", () => {
    expect(nextDishReview({ reviewStatus: R.FLAGGED, flagReasons: [MOD], rejectionReason: null }, cleared))
      .toEqual({ reviewStatus: R.AUTO_APPROVED, flagReasons: [], newlyFlagged: false })
  })
  it("stays flagged on the dish's own words after the group clears", () => {
    expect(nextDishReview({ reviewStatus: R.FLAGGED, flagReasons: ["INAPPROPRIATE_NAME", MOD], rejectionReason: null }, cleared))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: ["INAPPROPRIATE_NAME"], newlyFlagged: false })
  })
  it("is a no-op when nothing changes", () => {
    expect(nextDishReview({ reviewStatus: R.FLAGGED, flagReasons: [MOD], rejectionReason: null }, blocked)).toBeNull()
    expect(nextDishReview({ reviewStatus: R.AUTO_APPROVED, flagReasons: [], rejectionReason: null }, cleared)).toBeNull()
  })
})

describe("nextDishReview — an approval is moved only by new blocking content", () => {
  it("re-flags an approved dish when one of its groups now blocks", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_APPROVED, flagReasons: [], rejectionReason: null }, blocked))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [MOD], newlyFlagged: true })
  })
  it("keeps the approval when a group clears", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_APPROVED, flagReasons: [MOD], rejectionReason: null }, cleared))
      .toEqual({ reviewStatus: R.MANUALLY_APPROVED, flagReasons: [], newlyFlagged: false })
  })
})

describe("nextDishReview — a send-back returns to the queue when the group is the fix", () => {
  it("re-queues a dish sent back while carrying the group flag once the group clears", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [MOD], rejectionReason: "Fix the options." }, cleared))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [], newlyFlagged: true })
  })
  /* Back to the QUEUE, never to approved — the admin's send-back may also have
   * been about the dish, and only an admin can say it is fine now. */
  it("never jumps a rejected dish straight to approved", () => {
    const next = nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [MOD], rejectionReason: "Fix the options." }, cleared)
    expect(next?.reviewStatus).toBe(R.FLAGGED)
  })
  it("re-queues when the vendor re-edits the group, even if it is flagged again", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [MOD], rejectionReason: "Fix the options." }, reEditedBad))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [MOD], newlyFlagged: true })
  })
  it("leaves a send-back about the dish's own words alone when an unrelated group changes", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: ["INAPPROPRIATE_NAME"], rejectionReason: "Fix the options." }, cleared))
      .toBeNull()
  })
  it("records a newly blocking group on a rejected dish without lifting the rejection", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [], rejectionReason: "Fix the options." }, blocked))
      .toEqual({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [MOD], newlyFlagged: false })
  })
  it("a merely re-attached blocking group is not a vendor fix", () => {
    expect(nextDishReview({ reviewStatus: R.MANUALLY_REJECTED, flagReasons: [MOD], rejectionReason: "Fix the options." }, blocked)).toBeNull()
  })
})

describe("nextDishReview — a re-queued dish waits for an ADMIN", () => {
  /* Re-queued after a send-back: FLAGGED, nothing left in its reasons, and the
   * admin's message still on it. Nothing but an admin may clear it. */
  const requeued = { reviewStatus: R.FLAGGED, flagReasons: [] as string[], rejectionReason: "Fix the options." }

  it("is not auto-approved by an unrelated re-evaluation", () => {
    expect(nextDishReview(requeued, cleared)).toBeNull()
    expect(nextDishReview(requeued, { blocked: false, groupRescreened: true })).toBeNull()
  })
  it("is not auto-approved when a group it shares is approved (modifier reason clears)", () => {
    expect(nextDishReview({ ...requeued, flagReasons: [MOD] }, cleared))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [], newlyFlagged: false })
  })
  it("records a newly blocking group without leaving the queue", () => {
    expect(nextDishReview(requeued, blocked))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [MOD], newlyFlagged: false })
  })
  it("…whereas a screening-only flag still clears on its own", () => {
    expect(nextDishReview({ reviewStatus: R.FLAGGED, flagReasons: [MOD], rejectionReason: null }, cleared))
      .toEqual({ reviewStatus: R.AUTO_APPROVED, flagReasons: [], newlyFlagged: false })
  })
  it("an inconsistent automatic row corrects itself (visible while carrying a blocking group)", () => {
    expect(nextDishReview({ reviewStatus: R.AUTO_APPROVED, flagReasons: [MOD], rejectionReason: null }, blocked))
      .toEqual({ reviewStatus: R.FLAGGED, flagReasons: [MOD], newlyFlagged: true })
  })
})

describe("assertDishApprovable", () => {
  it("passes when no group blocks", () => {
    expect(() => assertDishApprovable([])).not.toThrow()
  })
  it("refuses, naming the groups, while one blocks", () => {
    try {
      assertDishApprovable(["Sauces"])
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe("MODIFIER_GROUP_UNRESOLVED")
      expect((err as ApiError).message).toContain('"Sauces"')
    }
  })
})

describe("mealStatusTransition", () => {
  it("names every allowed transition", () => {
    expect(mealStatusTransition(S.ACTIVE, S.SUSPENDED)).toBe("suspend")
    expect(mealStatusTransition(S.SUSPENDED, S.ACTIVE)).toBe("reinstate")
    expect(mealStatusTransition(S.ACTIVE, S.BANNED)).toBe("ban")
    expect(mealStatusTransition(S.SUSPENDED, S.BANNED)).toBe("ban")
    expect(mealStatusTransition(S.BANNED, S.ACTIVE)).toBe("unban")
  })

  it("refuses BANNED → SUSPENDED", () => {
    expect(() => mealStatusTransition(S.BANNED, S.SUSPENDED)).toThrow(
      expect.objectContaining({ code: "INVALID_STATUS_TRANSITION" }),
    )
  })

  it("refuses a move to the current state", () => {
    for (const s of [S.ACTIVE, S.SUSPENDED, S.BANNED]) {
      expect(() => mealStatusTransition(s, s)).toThrow(expect.objectContaining({ code: "ALREADY_IN_STATE" }))
    }
  })

  it("covers every pair — exactly five allowed", () => {
    const all = [S.ACTIVE, S.SUSPENDED, S.BANNED]
    let allowed = 0
    for (const from of all) for (const to of all) {
      try { mealStatusTransition(from, to); allowed++ } catch { /* refused */ }
    }
    expect(allowed).toBe(5)
  })

  it("requires a reason only for taking a meal off the marketplace", () => {
    expect([...REASON_REQUIRED_ACTIONS].sort()).toEqual(["ban", "suspend"])
  })
})

// ─── Dish-wide authority ──────────────────────────────────────────────────────


describe("dish scope — reading follows where the dish is sold; acting needs country tier", () => {
  const GLOBAL : AdminScopeContext = { isGlobal: true,  countryIds: [], cityIds: [], tier: "GLOBAL" }
  const KENYA  : AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: [], tier: "COUNTRY" }
  const NAIROBI: AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: ["nbo"], tier: "CITY" }
  const soldIn = (...cities: string[]) => ({ countryId: "ke", outletCityIds: cities })

  it("a city admin reads a dish only when it is sold in their city", () => {
    expect(dishInReadScope(NAIROBI, soldIn("nbo", "mba"))).toBe(true)
    expect(dishInReadScope(NAIROBI, soldIn("mba"))).toBe(false)
    expect(dishInReadScope(NAIROBI, soldIn())).toBe(false)
  })
  it("a country admin reads every dish of their country's vendors; others none", () => {
    expect(dishInReadScope(KENYA, soldIn("mba"))).toBe(true)
    expect(dishInReadScope(KENYA, soldIn())).toBe(true)
    expect(dishInReadScope(KENYA, { countryId: "ug", outletCityIds: ["kla"] })).toBe(false)
    expect(dishInReadScope(GLOBAL, { countryId: "ug", outletCityIds: [] })).toBe(true)
  })
  it("the SQL clause narrows a city admin through the dish's outlets", () => {
    expect(dishReadScopeWhere(GLOBAL)).toEqual({})
    expect(dishReadScopeWhere(KENYA)).toEqual({ vendor: { countryId: { in: ["ke"] } } })
    expect(dishReadScopeWhere(NAIROBI)).toEqual({
      vendor     : { countryId: { in: ["ke"] } },
      outletMeals: { some: { outlet: { cityId: { in: ["nbo"] } } } },
    })
  })
  it("only GLOBAL and COUNTRY tiers act dish-wide; a city admin is refused with 403", () => {
    expect(canActDishWide(GLOBAL)).toBe(true)
    expect(canActDishWide(KENYA)).toBe(true)
    expect(canActDishWide(NAIROBI)).toBe(false)
    try { assertDishWideAuthority(NAIROBI); expect.unreachable() } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).statusCode).toBe(403)
      expect((e as ApiError).code).toBe("DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE")
    }
  })
})

import { describe, it, expect } from "vitest"
import {
  bestOfferForItem, bestOrderOffer, bestPercentageOffer, compareOfferCandidates,
  effectivePercentBps, offerAppliesAtAnyOutlet, offerAppliesNow, offerLabel, priceAtOutlet,
  sortOffersStable, toDiscountOffer, type OfferRow,
} from "./offers"

const UGX = { code: "UGX", symbol: "USh", minorUnitDigits: 0 }
const KES = { code: "KES", symbol: "KSh", minorUnitDigits: 2 }
const NOW = new Date("2026-09-30T12:00:00Z")
const PAST = new Date("2026-09-01T00:00:00Z")

function offer(over: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "o-1", name: "vendor internal label", type: "PERCENTAGE_OFF_ITEMS",
    percentBps: 1000, amountMinor: null, minSubtotalMinor: null,
    appliesToAllOutlets: true, appliesToAllItems: true,
    startsAt: PAST, endsAt: null, daysOfWeek: [], startTime: null, endTime: null,
    isPaused: false, suspendedAt: null,
    budgetMinor: null, spentMinor: 0, maxRedemptions: null, redemptionCount: 0,
    outlets: [], items: [],
    ...over,
  }
}

describe("offerAppliesNow", () => {
  it("applies a running, untargeted offer anywhere", () => {
    expect(offerAppliesNow(offer(), "out-a", true, NOW, "UTC")).toBe(true)
  })

  it("respects outlet targeting", () => {
    const targeted = offer({ appliesToAllOutlets: false, outlets: [{ outletId: "out-a" }] })
    expect(offerAppliesNow(targeted, "out-a", true, NOW, "UTC")).toBe(true)
    expect(offerAppliesNow(targeted, "out-b", true, NOW, "UTC")).toBe(false)
  })

  it("never applies for a storefront that is not live, paused or suspended", () => {
    expect(offerAppliesNow(offer(), "out-a", false, NOW, "UTC")).toBe(false)
    expect(offerAppliesNow(offer({ isPaused: true }), "out-a", true, NOW, "UTC")).toBe(false)
    expect(offerAppliesNow(offer({ suspendedAt: PAST }), "out-a", true, NOW, "UTC")).toBe(false)
  })

  /* 12:00 UTC is 02:00 the next day in Pacific/Kiritimati (UTC+14). A 01:00–03:00
   * window is open THERE and shut on a UTC clock — the offset the old vendor
   * preview got wrong. */
  it("reads the daily window on the OUTLET's clock, not UTC", () => {
    const happyHour = offer({ startTime: "01:00", endTime: "03:00" })
    expect(offerAppliesNow(happyHour, "out-a", true, NOW, "Pacific/Kiritimati")).toBe(true)
    expect(offerAppliesNow(happyHour, "out-a", true, NOW, "UTC")).toBe(false)
  })

  it("an offer can apply at one targeted outlet and not another, each on its own clock", () => {
    const happyHour = offer({ startTime: "01:00", endTime: "03:00" })
    expect(offerAppliesAtAnyOutlet(happyHour, [{ id: "a", timeZone: "UTC" }], true, NOW)).toBe(false)
    expect(offerAppliesAtAnyOutlet(happyHour, [
      { id: "a", timeZone: "UTC" }, { id: "b", timeZone: "Pacific/Kiritimati" },
    ], true, NOW)).toBe(true)
  })
})

describe("the 50% ceiling", () => {
  it("re-clamps a stored row above it — for the saving AND the label", () => {
    const greedy = offer({ percentBps: 6000 })
    expect(effectivePercentBps(greedy)).toBe(5000)
    expect(bestPercentageOffer([greedy], "dish", 4000)?.savingMinor).toBe(2000)
    expect(offerLabel(greedy, UGX)).toBe("50% off")
    expect(toDiscountOffer(greedy, UGX).percentBps).toBe(5000)
  })
})

describe("choosing the winner", () => {
  it("the larger saving wins", () => {
    const small = offer({ id: "small", percentBps: 1000 })
    const big   = offer({ id: "big", percentBps: 2500 })
    expect(bestPercentageOffer([small, big], "dish", 10000)?.offer.id).toBe("big")
  })

  it("on equal savings, the EARLIER start wins, whatever the input order", () => {
    const later   = offer({ id: "a-later",   startsAt: new Date("2026-09-10T00:00:00Z") })
    const earlier = offer({ id: "z-earlier", startsAt: new Date("2026-09-05T00:00:00Z") })
    expect(bestPercentageOffer([later, earlier], "dish", 10000)?.offer.id).toBe("z-earlier")
    expect(bestPercentageOffer([earlier, later], "dish", 10000)?.offer.id).toBe("z-earlier")
  })

  it("on equal savings AND start, the lower id wins", () => {
    const b = offer({ id: "b" })
    const a = offer({ id: "a" })
    expect(bestPercentageOffer([b, a], "dish", 10000)?.offer.id).toBe("a")
    expect(compareOfferCandidates({ offer: a, savingMinor: 5 }, { offer: b, savingMinor: 5 })).toBeLessThan(0)
  })

  it("two different percentages that round to the same saving tie deterministically", () => {
    // 3 minor units: 20% and 25% both round to 1 (0.6 → 1, 0.75 → 1).
    const p20 = offer({ id: "p20", percentBps: 2000, startsAt: new Date("2026-09-09T00:00:00Z") })
    const p25 = offer({ id: "p25", percentBps: 2500, startsAt: new Date("2026-09-02T00:00:00Z") })
    expect(bestPercentageOffer([p20, p25], "dish", 3)?.offer.id).toBe("p25")
  })

  it("only covers the dishes it names", () => {
    const named = offer({ appliesToAllItems: false, items: [{ menuItemId: "dish" }] })
    expect(bestPercentageOffer([named], "dish", 10000)).not.toBeNull()
    expect(bestPercentageOffer([named], "other", 10000)).toBeNull()
  })

  it("the best order offer never exceeds the basket and respects its minimum", () => {
    const tenOff = offer({ id: "ten", type: "AMOUNT_OFF_ORDER", percentBps: null, amountMinor: 1000, minSubtotalMinor: 5000 })
    expect(bestOrderOffer([tenOff], 4999)).toBeNull()
    expect(bestOrderOffer([tenOff], 5000)?.savingMinor).toBe(1000)
    const huge = offer({ id: "huge", type: "AMOUNT_OFF_ORDER", percentBps: null, amountMinor: 99999 })
    expect(bestOrderOffer([huge], 300)?.savingMinor).toBe(300)
  })

  it("an unpriced list is stable too", () => {
    const later = offer({ id: "a", startsAt: new Date("2026-09-10T00:00:00Z") })
    const earlier = offer({ id: "b", startsAt: new Date("2026-09-05T00:00:00Z") })
    expect(sortOffersStable([later, earlier]).map((o) => o.id)).toEqual(["b", "a"])
  })
})

describe("labels", () => {
  it("never uses the vendor's internal name", () => {
    expect(offerLabel(offer(), UGX)).toBe("10% off")
    expect(offerLabel(offer(), UGX)).not.toContain("internal")
  })

  it("formats an amount in the currency's own scale — UGX has none", () => {
    const amount = offer({ type: "AMOUNT_OFF_ORDER", percentBps: null, amountMinor: 5000, minSubtotalMinor: 20000 })
    expect(offerLabel(amount, UGX)).toBe("USh 5000 off over USh 20000")
    expect(offerLabel(amount, KES)).toBe("KSh 50.00 off over KSh 200.00")
  })
})

describe("priceAtOutlet", () => {
  const base = { menuItemId: "dish", basePriceMinor: 10000, vendorIsLive: true, now: NOW, currency: UGX }

  it("uses the base price where the outlet set none", () => {
    const p = priceAtOutlet({ ...base, priceMinorOverride: null, outlet: { id: "a", timeZone: "UTC" }, offers: [] })
    expect(p).toEqual({ listPriceMinor: 10000, priceMinor: 10000, wasPriceMinor: null, offer: null })
  })

  it("prices an offer off the OUTLET's price, not the base", () => {
    const p = priceAtOutlet({ ...base, priceMinorOverride: 12000, outlet: { id: "a", timeZone: "UTC" }, offers: [offer()] })
    expect(p).toMatchObject({ listPriceMinor: 12000, priceMinor: 10800, wasPriceMinor: 12000 })
    expect(p.offer?.label).toBe("10% off")
  })

  it("an offer targeted elsewhere leaves this outlet's price alone", () => {
    const elsewhere = offer({ appliesToAllOutlets: false, outlets: [{ outletId: "b" }] })
    const p = priceAtOutlet({ ...base, priceMinorOverride: null, outlet: { id: "a", timeZone: "UTC" }, offers: [elsewhere] })
    expect(p.wasPriceMinor).toBeNull()
    expect(p.priceMinor).toBe(10000)
  })

  it("matches bestOfferForItem exactly — one composition", () => {
    const offers = [offer({ id: "x", percentBps: 1500 }), offer({ id: "y", percentBps: 1500 })]
    const p = priceAtOutlet({ ...base, priceMinorOverride: null, outlet: { id: "a", timeZone: "UTC" }, offers })
    const direct = bestOfferForItem(offers, "dish", 10000, UGX)
    expect(p.priceMinor).toBe(direct?.discountedMinor)
    expect(p.offer?.id).toBe(direct?.offer.id)
  })
})

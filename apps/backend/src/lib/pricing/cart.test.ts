import { describe, it, expect } from "vitest"
import { priceCart, type CartPricingContext, type CartLineInput } from "./cart"
import { apportionOrderDiscount, percentageOffLine, amountOffOrder } from "./discount"

/* Pure — every input supplied here, no DB. */

const line = (menuItemId: string, quantity = 1, selectedOptionIds: string[] = []): CartLineInput =>
  ({ menuItemId, quantity, selectedOptionIds })

const item = (
  menuItemId: string,
  unitPriceMinor: number,
  options: { id: string; name: string; priceDeltaMinor: number }[] = [],
  taxCategoryId: string | null = null,
) => ({ menuItemId, name: menuItemId, unitPriceMinor, taxCategoryId, options })

const noDiscount = (n: number) => Array.from({ length: n }, () => ({ amountMinor: 0, discountId: null }))

/** Kenya-shaped: 16% inclusive, 15% commission. */
const KE = (items: CartPricingContext["items"]): CartPricingContext => ({
  items,
  pricesIncludeTax : true,
  rateBpsForLine   : () => 1_600,
  commissionRateBps: 1_500,
})

describe("priceCart", () => {
  it("prices one plain dish", () => {
    const totals = priceCart([line("pizza")], KE([item("pizza", 130_000)]), noDiscount(1))

    expect(totals.subtotalMinor).toBe(130_000)
    expect(totals.totalMinor).toBe(130_000)
    // 16% inclusive: the tax is inside the price, not added to it.
    expect(totals.taxMinor).toBe(17_931)
    expect(totals.vendorNetMinor).toBe(112_069)
    expect(totals.vendorNetMinor + totals.taxMinor).toBe(totals.totalMinor)
  })

  it("includes option deltas in the line", () => {
    const totals = priceCart(
      [line("pizza", 1, ["large"])],
      KE([item("pizza", 130_000, [{ id: "large", name: "Large", priceDeltaMinor: 20_000 }])]),
      noDiscount(1),
    )
    expect(totals.lines[0]!.unitMinor).toBe(150_000)
    expect(totals.subtotalMinor).toBe(150_000)
  })

  it("multiplies a resolved unit price rather than summing roundings", () => {
    const one = priceCart([line("x", 1)], KE([item("x", 13_333)]), noDiscount(1))
    const seven = priceCart([line("x", 7)], KE([item("x", 13_333)]), noDiscount(1))
    expect(seven.subtotalMinor).toBe(one.lines[0]!.unitMinor * 7)
  })

  it("taxes the DISCOUNTED amount, not the menu price", () => {
    // The rule the whole composition order exists for.
    const items = KE([item("pizza", 150_000)])
    const plain = priceCart([line("pizza")], items, noDiscount(1))
    const cut = priceCart([line("pizza")], items, [{ amountMinor: 30_000, discountId: "d1" }])

    expect(cut.discountMinor).toBe(30_000)
    expect(cut.totalMinor).toBe(120_000)
    expect(cut.taxMinor).toBeLessThan(plain.taxMinor)
    expect(cut.lines[0]!.taxableMinor).toBe(120_000)
  })

  it("charges commission on the DISCOUNTED amount", () => {
    // The recorded product decision, following Uber Eats: the platform takes no
    // cut of a discount the vendor funded.
    const items = KE([item("pizza", 150_000)])
    const plain = priceCart([line("pizza")], items, noDiscount(1))
    const cut = priceCart([line("pizza")], items, [{ amountMinor: 30_000, discountId: "d1" }])

    expect(cut.commissionMinor!).toBeLessThan(plain.commissionMinor!)
    // 15% of the discounted net.
    expect(cut.commissionMinor).toBe(Math.round((cut.vendorNetMinor * 1_500) / 10_000))
  })

  it("names the offer on a line it actually reduced, and nowhere else", () => {
    const totals = priceCart(
      [line("a"), line("b")],
      KE([item("a", 100_000), item("b", 100_000)]),
      [{ amountMinor: 10_000, discountId: "d1" }, { amountMinor: 0, discountId: "d1" }],
    )
    expect(totals.lines[0]!.appliedDiscountId).toBe("d1")
    expect(totals.lines[1]!.appliedDiscountId).toBeNull()
  })

  it("adds tax on top in an exclusive market", () => {
    const totals = priceCart([line("x")], { ...KE([item("x", 100_000)]), pricesIncludeTax: false }, noDiscount(1))
    expect(totals.totalMinor).toBe(116_000)
    expect(totals.vendorNetMinor).toBe(100_000)
    expect(totals.taxMinor).toBe(16_000)
  })

  it("says so honestly when the market has no rate configured", () => {
    const totals = priceCart(
      [line("x")],
      { ...KE([item("x", 100_000)]), rateBpsForLine: () => null },
      noDiscount(1),
    )
    expect(totals.taxConfigured).toBe(false)
    expect(totals.taxMinor).toBe(0)
    // The vendor keeps the whole thing rather than an invented split.
    expect(totals.vendorNetMinor).toBe(100_000)
    expect(totals.lines[0]!.tax).toBeNull()
  })

  it("handles a mixed-rate basket per line", () => {
    // Exactly why a basket discount must be apportioned before tax: a standard
    // dish and a zero-rated one cannot share one rate.
    const totals = priceCart(
      [line("food"), line("zero")],
      {
        items: [item("food", 100_000, [], "std"), item("zero", 100_000, [], "zero")],
        pricesIncludeTax : true,
        rateBpsForLine   : (id) => (id === "zero" ? 0 : 1_600),
        commissionRateBps: 1_500,
      },
      noDiscount(2),
    )
    expect(totals.lines[0]!.tax!.taxMinor).toBeGreaterThan(0)
    expect(totals.lines[1]!.tax!.taxMinor).toBe(0)
    expect(totals.taxMinor).toBe(totals.lines[0]!.tax!.taxMinor)
  })

  it("leaves commission null when the vendor has no rate", () => {
    const totals = priceCart([line("x")], { ...KE([item("x", 100_000)]), commissionRateBps: null }, noDiscount(1))
    expect(totals.commissionMinor).toBeNull()
  })

  it("never lets a discount exceed the line", () => {
    const totals = priceCart([line("x")], KE([item("x", 10_000)]), [{ amountMinor: 99_999, discountId: "d" }])
    expect(totals.discountMinor).toBe(10_000)
    expect(totals.totalMinor).toBe(0)
  })

  it("refuses a zero quantity and mismatched inputs", () => {
    expect(() => priceCart([line("x", 0)], KE([item("x", 100)]), noDiscount(1))).toThrow()
    expect(() => priceCart([line("x")], KE([item("x", 100)]), noDiscount(2))).toThrow()
  })
})

describe("end to end: a realistic basket", () => {
  it("composes options, a percentage offer, tax and commission together", () => {
    /*
     * Two large pizzas at 130000 + 20000, one side at 40000.
     * A 20% offer covers pizzas only. Kenya: 16% inclusive, 15% commission.
     */
    const items = [
      item("pizza", 130_000, [{ id: "large", name: "Large", priceDeltaMinor: 20_000 }]),
      item("side", 40_000),
    ]
    const lines = [line("pizza", 2, ["large"]), line("side")]

    const pizzaSubtotal = 150_000 * 2
    const pizzaOff = percentageOffLine(pizzaSubtotal, 2_000)
    expect(pizzaOff).toBe(60_000) // includes the Large upcharge

    const totals = priceCart(lines, KE(items), [
      { amountMinor: pizzaOff, discountId: "d1" },
      { amountMinor: 0, discountId: "d1" },
    ])

    expect(totals.subtotalMinor).toBe(340_000)
    expect(totals.discountMinor).toBe(60_000)
    expect(totals.totalMinor).toBe(280_000)
    expect(totals.vendorNetMinor + totals.taxMinor).toBe(totals.totalMinor)
    expect(totals.commissionMinor).toBe(Math.round((totals.vendorNetMinor * 1_500) / 10_000))
    // The side was never touched.
    expect(totals.lines[1]!.discountMinor).toBe(0)
  })

  it("apportions a basket-level offer across lines before tax", () => {
    const items = [item("a", 150_000), item("b", 50_000)]
    const subtotals = [150_000, 50_000]

    const off = amountOffOrder(200_000, 40_000, 150_000)
    const shares = apportionOrderDiscount(subtotals, off)
    expect(shares).toEqual([30_000, 10_000])

    const totals = priceCart(
      [line("a"), line("b")],
      KE(items),
      shares.map((amountMinor) => ({ amountMinor, discountId: "d2" })),
    )

    expect(totals.discountMinor).toBe(40_000)
    expect(totals.totalMinor).toBe(160_000)
    expect(totals.vendorNetMinor + totals.taxMinor).toBe(totals.totalMinor)
  })
})

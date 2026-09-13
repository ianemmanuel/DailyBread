import { prisma, DiscountType } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { HttpStatus } from "@/constants/httpStatus"
import { priceCart, type CartLineInput, type ResolvedMenuItem } from "@/lib/pricing/cart"
import { validateSelection, isGroupRequired, type GroupRule, type SelectedOption } from "@/lib/pricing/line"
import { amountOffOrder, apportionOrderDiscount, percentageOffLine, MAX_DISCOUNT_BPS } from "@/lib/pricing/discount"
import type {
  PriceCartRequest, PricedCart, PricedCartLine, CartProblem,
} from "@repo/types/backend"
import { isOpenAt, type TradingDay } from "./customer.discovery"
import { SELLABLE_MEAL_WHERE, SELLABLE_MENU_ITEM_WHERE } from "./customer.visibility"
import { assertSellableOutlet } from "./customer.storefront.service"
import {
  OFFER_SELECT, getCountryTaxProfile, getCurrencyForCountry, offerAppliesNow,
  offerCoversItem, resolveRateBps, signKey, type OfferRow,
} from "./customer.presentation"

/*
 * Pricing a basket.
 *
 * THE first caller of lib/pricing/cart.ts, which was written ahead of this
 * deliberately so the arithmetic could be proven without a database. This file
 * is the other half: resolving ids into what they actually cost, and deciding
 * which offer applies. Neither half guesses at the other's job.
 *
 * ─── Stateless, on purpose ───────────────────────────────────────────────────
 *
 * There is no Cart table. The client holds the lines and posts them whenever
 * they change; the server prices them from scratch every time and returns the
 * result. That is the standing rule taken literally — the client sends ids and
 * quantities and NEVER prices, so nothing it holds can affect what anything
 * costs.
 *
 * A persisted, cross-device cart is a real feature both reference platforms
 * have, and it is storage layered on top of exactly this endpoint rather than a
 * different design. It belongs with the order model, because that is when a
 * basket stops being a live calculation and becomes a record.
 *
 * ─── Problems, not exceptions ────────────────────────────────────────────────
 *
 * Everything a customer can fix — a sold-out dish, a missing required choice, a
 * basket under the minimum — comes back as an entry in `problems` alongside a
 * fully priced cart, never as a thrown error. Returning one problem at a time
 * is how a basket gets abandoned, and returning no prices alongside them leaves
 * the customer staring at a blank total while they fix things.
 */

const MAX_LINES        = 50
const MAX_LINE_QUANTITY = 50

export async function priceCustomerCart(
  request: PriceCartRequest,
  now    : Date = new Date(),
): Promise<PricedCart> {
  const { outlet, city } = await assertSellableOutlet(request.outletId)

  const [currency, taxProfile, vendor] = await Promise.all([
    getCurrencyForCountry(outlet.countryId),
    getCountryTaxProfile(outlet.countryId),
    prisma.vendorAccount.findUnique({
      where : { id: outlet.vendorId },
      select: { commissionRateBps: true },
    }),
  ])

  const problems: CartProblem[] = []
  const lines = request.lines ?? []

  if (lines.length === 0) {
    problems.push({ code: "EMPTY_CART", message: "Your basket is empty." })
    return emptyCart(outlet, currency, taxProfile, problems)
  }
  if (lines.length > MAX_LINES) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "That is too many different items for one order.", "CART_TOO_LARGE")
  }

  const hours = await prisma.outletOperatingHours.findMany({
    where : { outletId: outlet.id, isActive: true, validFrom: null },
    select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
  })
  const isOpenNow = isOpenAt(hours as TradingDay[], now, city.timezone)
  if (!isOpenNow) {
    problems.push({
      code   : "OUTLET_CLOSED",
      message: "This restaurant is closed right now.",
    })
  }

  // One query for every dish in the basket, never one per line.
  const items = await loadCartItems(outlet.vendorId, outlet.id, lines.map((l) => l.menuItemId))
  const itemsById = new Map(items.map((item) => [item.id, item]))

  const offers = await loadOffers(outlet.vendorId)
  const liveOffers = offers.filter((o) => offerAppliesNow(o, outlet.id, true, now, city.timezone))

  // ─── Resolve every line ─────────────────────────────────────────────────────

  const resolvedInputs : CartLineInput[]    = []
  const resolvedItems  : ResolvedMenuItem[] = []
  const optionMeta     : Array<Array<SelectedOption & { groupId: string }>> = []
  const keptIndexes    : number[] = []

  lines.forEach((line, index) => {
    const item = itemsById.get(line.menuItemId)

    if (!item) {
      problems.push({
        code: "ITEM_UNAVAILABLE", message: "One of your items is no longer on the menu.",
        lineIndex: index, menuItemId: line.menuItemId,
      })
      return
    }

    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      throw new ApiError(HttpStatus.BAD_REQUEST, "That is not a valid quantity.", "INVALID_QUANTITY")
    }

    const meal = item.outletMeals[0]
    if (!meal || meal.isAvailable === false) {
      problems.push({
        code: "ITEM_UNAVAILABLE", message: `${item.name} is sold out right now.`,
        lineIndex: index, menuItemId: item.id,
      })
      return
    }

    /*
     * Options arrive FLAT and are grouped here, from the menu — never from the
     * client. Accepting the client's grouping would let it claim an option
     * belongs to a group it does not, which is exactly how a "pick one" rule
     * gets bypassed.
     */
    const groups = item.modifierGroups
      .filter((link) => link.group.deletedAt === null)
      .map((link) => link.group)

    const optionIndex = new Map<string, { option: typeof groups[number]["options"][number]; groupId: string }>()
    for (const group of groups) {
      for (const option of group.options) optionIndex.set(option.id, { option, groupId: group.id })
    }

    const selection: Record<string, string[]> = {}
    const chosen   : Array<SelectedOption & { groupId: string }> = []
    let lineBroken = false

    // Duplicates count once — picking the same sauce twice is one sauce.
    for (const optionId of new Set(line.selectedOptionIds ?? [])) {
      const found = optionIndex.get(optionId)

      if (!found) {
        problems.push({
          code: "OPTION_NOT_ON_ITEM", message: `A choice on ${item.name} is no longer available.`,
          lineIndex: index, menuItemId: item.id, optionId,
        })
        lineBroken = true
        continue
      }
      if (!found.option.isAvailable) {
        problems.push({
          code: "OPTION_UNAVAILABLE", message: `${found.option.name} is sold out.`,
          lineIndex: index, menuItemId: item.id, optionId,
        })
        lineBroken = true
        continue
      }

      ;(selection[found.groupId] ??= []).push(optionId)
      chosen.push({
        id             : found.option.id,
        name           : found.option.name,
        priceDeltaMinor: found.option.priceDeltaMinor,
        groupId        : found.groupId,
      })
    }

    // The same rule the vendor dashboard validates against, so a dish that can
    // be saved is a dish that can be ordered.
    const rules: GroupRule[] = groups.map((group) => ({
      id       : group.id,
      name     : group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      availableOptionIds: group.options.filter((o) => o.isAvailable).map((o) => o.id),
    }))

    for (const error of validateSelection(rules, selection)) {
      lineBroken = true
      if (error.code === "TOO_FEW") {
        problems.push({
          code: "REQUIRED_CHOICE_MISSING",
          message: isGroupRequired({ minSelect: error.minSelect })
            ? `Choose ${error.minSelect === 1 ? "an option" : `${error.minSelect} options`} for ${error.groupName}.`
            : `Not enough options chosen for ${error.groupName}.`,
          lineIndex: index, menuItemId: item.id, groupId: error.groupId,
        })
      } else if (error.code === "TOO_MANY") {
        problems.push({
          code: "TOO_MANY_CHOICES",
          message: `Choose at most ${error.maxSelect} for ${error.groupName}.`,
          lineIndex: index, menuItemId: item.id, groupId: error.groupId,
        })
      }
    }

    if (lineBroken) return

    resolvedInputs.push({
      menuItemId: item.id,
      quantity  : line.quantity,
      selectedOptionIds: chosen.map((o) => o.id),
    })
    resolvedItems.push({
      menuItemId    : item.id,
      name          : item.name,
      // The outlet's own price where it has one, otherwise the catalog price.
      unitPriceMinor: meal.priceMinorOverride ?? item.basePriceMinor,
      taxCategoryId : item.taxCategoryId,
      options       : chosen.map(({ groupId: _groupId, ...option }) => option),
    })
    optionMeta.push(chosen)
    keptIndexes.push(index)
  })

  if (resolvedItems.length === 0) {
    return emptyCart(outlet, currency, taxProfile, problems)
  }

  // ─── Offers ─────────────────────────────────────────────────────────────────

  const lineSubtotals = resolvedItems.map((item, i) => {
    const optionsMinor = item.options.reduce((sum, o) => sum + o.priceDeltaMinor, 0)
    return Math.max(0, item.unitPriceMinor + optionsMinor) * resolvedInputs[i]!.quantity
  })

  const lineDiscounts = resolveDiscounts(resolvedItems, lineSubtotals, liveOffers)

  // ─── Price it ───────────────────────────────────────────────────────────────

  const totals = priceCart(resolvedInputs, {
    items           : resolvedItems,
    pricesIncludeTax: taxProfile.pricesIncludeTax,
    rateBpsForLine  : (taxCategoryId) => resolveRateBps(taxProfile, taxCategoryId),
    /*
     * Commission is computed but NEVER returned to a customer — what the
     * platform takes from the vendor is none of the customer's business. It is
     * passed because priceCart is the one composition function and the order
     * model will need the figure; dropping it here would mean recomputing it
     * somewhere else later, which is how two answers appear.
     */
    commissionRateBps: vendor?.commissionRateBps ?? null,
  }, lineDiscounts)

  const foodTotalMinor = totals.totalMinor

  if (outlet.minimumOrderMinor != null && foodTotalMinor < outlet.minimumOrderMinor) {
    problems.push({
      code   : "BELOW_MINIMUM_ORDER",
      message: "Your basket is below this restaurant's minimum order.",
    })
  }

  const images = await Promise.all(
    resolvedItems.map((item) => signKey(itemsById.get(item.menuItemId)?.mainImageKey)),
  )

  const pricedLines: PricedCartLine[] = totals.lines.map((line, i) => ({
    lineIndex    : keptIndexes[i]!,
    menuItemId   : line.menuItemId,
    name         : line.name,
    imageUrl     : images[i] ?? null,
    quantity     : line.quantity,
    options      : optionMeta[i]!,
    unitMinor    : line.unitMinor,
    subtotalMinor: line.subtotalMinor,
    discountMinor: line.discountMinor,
    totalMinor   : line.tax?.grossMinor ?? line.taxableMinor,
    appliedOfferId  : line.appliedDiscountId,
    appliedOfferName: line.appliedDiscountId
      ? liveOffers.find((o) => o.id === line.appliedDiscountId)?.name ?? null
      : null,
  }))

  return {
    outletId     : outlet.id,
    currency,
    lines        : pricedLines,
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxMinor     : totals.taxMinor,
    taxLabel     : totals.taxConfigured ? taxProfile.taxName ?? "Tax" : null,
    taxInclusive : taxProfile.pricesIncludeTax,
    deliveryFeeMinor : outlet.deliveryFeeMinor,
    minimumOrderMinor: outlet.minimumOrderMinor,
    foodTotalMinor,
    // Delivery is added on top and is deliberately NOT discounted by a
    // merchant-funded offer — it is not the vendor's revenue to give away.
    // Free-delivery promotions are a platform-funded product and are deferred.
    orderTotalMinor  : foodTotalMinor + (outlet.deliveryFeeMinor ?? 0),
    problems,
    canCheckout      : problems.length === 0,
  }
}

// ─── Offers ──────────────────────────────────────────────────────────────────

/**
 * Which offer comes off, and by how much, per line.
 *
 * OFFERS NEVER STACK, and this is where that is enforced for a whole basket.
 * Two shapes compete:
 *
 *   - PERCENTAGE_OFF_ITEMS discounts individual dishes. Each line takes the
 *     single best percentage offer covering it, which is the rule already shown
 *     on the vendor's own meal page.
 *   - AMOUNT_OFF_ORDER discounts the basket once it reaches a minimum.
 *
 * Applying both would be stacking. So the two are costed against each other and
 * the CUSTOMER GETS WHICHEVER IS WORTH MORE — never both, never the smaller.
 * That is the rule every marketplace lands on, and it is the only one that is
 * defensible to a customer who can see the arithmetic.
 *
 * The ceiling is re-applied here as well as at save time: a stored row that
 * predates the cap, or any future path that skips validation, must still not be
 * able to give away more than the platform allows. A ceiling only enforced on
 * the way in is not a ceiling.
 */
function resolveDiscounts(
  items        : readonly ResolvedMenuItem[],
  lineSubtotals: readonly number[],
  liveOffers   : readonly OfferRow[],
): Array<{ amountMinor: number; discountId: string | null }> {
  const perItem = items.map((item, i) => {
    let best: { amountMinor: number; discountId: string } | null = null

    for (const offer of liveOffers) {
      if (offer.type !== DiscountType.PERCENTAGE_OFF_ITEMS) continue
      if (!offerCoversItem(offer, item.menuItemId)) continue

      const bps = Math.min(offer.percentBps ?? 0, MAX_DISCOUNT_BPS)
      if (bps <= 0) continue

      const amountMinor = percentageOffLine(lineSubtotals[i]!, bps)
      if (amountMinor > 0 && (!best || amountMinor > best.amountMinor)) {
        best = { amountMinor, discountId: offer.id }
      }
    }
    return best ?? { amountMinor: 0, discountId: null as string | null }
  })

  const itemTotal = perItem.reduce((sum, d) => sum + d.amountMinor, 0)
  const basketSubtotal = lineSubtotals.reduce((sum, value) => sum + value, 0)

  let bestOrderOffer: { amountMinor: number; discountId: string } | null = null
  for (const offer of liveOffers) {
    if (offer.type !== DiscountType.AMOUNT_OFF_ORDER) continue
    const amountMinor = amountOffOrder(basketSubtotal, offer.amountMinor ?? 0, offer.minSubtotalMinor)
    if (amountMinor > 0 && (!bestOrderOffer || amountMinor > bestOrderOffer.amountMinor)) {
      bestOrderOffer = { amountMinor, discountId: offer.id }
    }
  }

  if (!bestOrderOffer || bestOrderOffer.amountMinor <= itemTotal) return perItem

  /*
   * The basket offer wins, so it replaces the per-item ones entirely and is
   * apportioned back across the lines BEFORE tax — necessary because tax rates
   * differ per dish, so a basket mixing a standard-rated meal with a zero-rated
   * one would otherwise be taxed wrongly.
   */
  const shares = apportionOrderDiscount(lineSubtotals, bestOrderOffer.amountMinor)
  return shares.map((amountMinor) => ({
    amountMinor,
    discountId: amountMinor > 0 ? bestOrderOffer!.discountId : null,
  }))
}

async function loadOffers(vendorId: string): Promise<OfferRow[]> {
  const rows = await prisma.discount.findMany({
    where : { vendorId, deletedAt: null, isPaused: false, suspendedAt: null },
    select: OFFER_SELECT,
  })
  return rows as unknown as OfferRow[]
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function loadCartItems(vendorId: string, outletId: string, menuItemIds: readonly string[]) {
  return prisma.menuItem.findMany({
    where: {
      id      : { in: [...new Set(menuItemIds)] },
      vendorId,
      ...SELLABLE_MENU_ITEM_WHERE,
      outletMeals: { some: { ...SELLABLE_MEAL_WHERE, outletId } },
    },
    select: {
      id: true, name: true, basePriceMinor: true, taxCategoryId: true, mainImageKey: true,
      outletMeals: {
        where : { outletId, deletedAt: null },
        select: { isAvailable: true, priceMinorOverride: true },
      },
      modifierGroups: {
        orderBy: { position: "asc" },
        select : {
          group: {
            select: {
              id: true, name: true, minSelect: true, maxSelect: true, deletedAt: true,
              options: {
                where : { deletedAt: null },
                select: { id: true, name: true, priceDeltaMinor: true, isAvailable: true },
              },
            },
          },
        },
      },
    },
  })
}

function emptyCart(
  outlet    : { id: string; deliveryFeeMinor: number | null; minimumOrderMinor: number | null },
  currency  : Awaited<ReturnType<typeof getCurrencyForCountry>>,
  taxProfile: Awaited<ReturnType<typeof getCountryTaxProfile>>,
  problems  : CartProblem[],
): PricedCart {
  return {
    outletId     : outlet.id,
    currency,
    lines        : [],
    subtotalMinor: 0,
    discountMinor: 0,
    taxMinor     : 0,
    taxLabel     : null,
    taxInclusive : taxProfile.pricesIncludeTax,
    deliveryFeeMinor : outlet.deliveryFeeMinor,
    minimumOrderMinor: outlet.minimumOrderMinor,
    foodTotalMinor : 0,
    orderTotalMinor: 0,
    problems,
    canCheckout    : false,
  }
}

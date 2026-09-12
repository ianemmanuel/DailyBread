/*
 * What one line of an order actually costs.
 *
 * Pure — no I/O, no Prisma. Lives beside tax.ts in lib/pricing for the same
 * reason: the vendor form previewing a dish, the admin moderating one, and
 * eventually the customer cart charging one all have to reach the identical
 * number, and a second implementation is a second set of rounding bugs.
 *
 * The composition order is the whole contract, and it is the order every
 * marketplace uses:
 *
 *     base price
 *   + the sum of the selected options' deltas      = the line subtotal
 *   - any discount (a later phase)                 = the taxable amount
 *   ± tax                                          = what the customer pays
 *
 * Tax comes LAST and applies to the discounted line, not to the menu price.
 * A percentage discount likewise applies to the subtotal AFTER options, because
 * that is what the customer is actually paying for this dish — twenty percent
 * off a pizza discounts the large upcharge and the extra cheese too.
 */

/** A dish sold at a stupid price is a typo, not a business decision. Mirrors
 *  MAX_PRICE_MINOR on the vendor side; a line can legitimately exceed a single
 *  dish's cap once options stack, so this is deliberately looser. */
export const MAX_LINE_MINOR = 1_000_000_000

export interface SelectedOption {
  id             : string
  name           : string
  priceDeltaMinor: number
}

export interface LineSubtotal {
  basePriceMinor: number
  /** Sum of every selected option's delta. Can be negative. */
  optionsMinor  : number
  /** base + options, floored at zero. */
  subtotalMinor : number
}

/**
 * Base plus the selected deltas.
 *
 * Floored at zero rather than allowed to go negative: a stack of discounting
 * options should make a dish free, never make the platform pay the customer.
 * The floor is defence in depth — validation already refuses a group whose
 * deltas could take a dish below zero — because a floor that never fires costs
 * nothing and one that is missing costs money.
 */
export function computeLineSubtotal(
  basePriceMinor: number,
  options       : readonly SelectedOption[],
): LineSubtotal {
  assertWholeMinor(basePriceMinor, "basePriceMinor")

  let optionsMinor = 0
  for (const option of options) {
    assertWholeMinor(option.priceDeltaMinor, "priceDeltaMinor")
    optionsMinor += option.priceDeltaMinor
  }

  const raw = basePriceMinor + optionsMinor
  if (raw > MAX_LINE_MINOR) {
    throw new Error("Line total is implausibly large")
  }

  return { basePriceMinor, optionsMinor, subtotalMinor: Math.max(0, raw) }
}

/**
 * What ONE unit of a dish costs, before tax and before any discount.
 *
 * Quantity is applied to the resolved unit price rather than folded in here,
 * so a per-unit figure stays available for the receipt line. Ordering three of
 * something must cost exactly three times one of them, which multiplying an
 * already-rounded unit price guarantees and summing three roundings does not.
 */
export function computeLineTotal(
  basePriceMinor: number,
  options       : readonly SelectedOption[],
  quantity      : number,
): { unitMinor: number; totalMinor: number } {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a whole number of at least one")
  }
  const { subtotalMinor } = computeLineSubtotal(basePriceMinor, options)
  return { unitMinor: subtotalMinor, totalMinor: subtotalMinor * quantity }
}

function assertWholeMinor(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be a whole number of minor units`)
  }
}

// ─── Selection rules ─────────────────────────────────────────────────────────

export interface GroupRule {
  id       : string
  name     : string
  minSelect: number
  maxSelect: number
  /** Ids of the options currently sellable in this group. An option that is
   *  86'd cannot satisfy a required group, which is the whole point of
   *  checking against availability rather than against the full option list. */
  availableOptionIds: readonly string[]
}

export type SelectionError =
  | { code: "TOO_FEW";       groupId: string; groupName: string; minSelect: number }
  | { code: "TOO_MANY";      groupId: string; groupName: string; maxSelect: number }
  | { code: "UNKNOWN_OPTION"; groupId: string; groupName: string; optionId: string }

/**
 * Whether a customer's selection satisfies a dish's groups.
 *
 * Not used by any checkout yet — there is no order model — but it is the rule
 * the vendor-facing validation is written against, so the two cannot drift.
 * Returns every problem rather than the first: a cart telling you about one
 * missing choice at a time is how a customer abandons it.
 */
export function validateSelection(
  groups   : readonly GroupRule[],
  selection: Readonly<Record<string, readonly string[]>>,
): SelectionError[] {
  const errors: SelectionError[] = []

  for (const group of groups) {
    const chosen = selection[group.id] ?? []
    const available = new Set(group.availableOptionIds)

    for (const optionId of chosen) {
      if (!available.has(optionId)) {
        errors.push({
          code: "UNKNOWN_OPTION", groupId: group.id, groupName: group.name, optionId,
        })
      }
    }

    // Duplicates count once: picking the same sauce twice is one sauce, not a
    // reason to fail a max-of-three rule.
    const distinct = new Set(chosen.filter((id) => available.has(id))).size

    if (distinct < group.minSelect) {
      errors.push({
        code: "TOO_FEW", groupId: group.id, groupName: group.name, minSelect: group.minSelect,
      })
    }
    if (distinct > group.maxSelect) {
      errors.push({
        code: "TOO_MANY", groupId: group.id, groupName: group.name, maxSelect: group.maxSelect,
      })
    }
  }

  return errors
}

/** A group is required exactly when it demands at least one choice. Derived,
 *  never stored — a separate column could disagree with minSelect. */
export function isGroupRequired(group: { minSelect: number }): boolean {
  return group.minSelect >= 1
}

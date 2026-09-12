/*
 * Shapes the offer screens read.
 *
 * `state` and `appliesNow` arrive computed. Nothing here re-derives whether an
 * offer is running — the backend is the authority, and the same answer will
 * later decide what a customer is charged.
 */

export type AdminDiscountState =
  | "SUSPENDED" | "PAUSED" | "EXPIRED" | "EXHAUSTED"
  | "SCHEDULED" | "AWAITING_GO_LIVE" | "RUNNING"

export type AdminDiscountType = "PERCENTAGE_OFF_ITEMS" | "AMOUNT_OFF_ORDER"

export interface AdminDiscountVendor {
  id          : string
  businessName: string
  countryName : string | null
  currencyCode: string | null
  isLive      : boolean
}

export interface AdminDiscountRow {
  id              : string
  name            : string
  type            : AdminDiscountType
  fundingSource   : "VENDOR" | "PLATFORM" | "SPLIT"
  percentBps      : number | null
  amountMinor     : number | null
  minSubtotalMinor: number | null
  startsAt        : string
  endsAt          : string | null
  daysOfWeek      : string[]
  startTime       : string | null
  endTime         : string | null
  budgetMinor     : number | null
  spentMinor      : number
  maxRedemptions  : number | null
  redemptionCount : number
  isPaused        : boolean
  suspendedAt     : string | null
  suspensionReason: string | null
  appliesToAllOutlets: boolean
  appliesToAllItems  : boolean
  outletCount     : number
  itemCount       : number
  state           : AdminDiscountState
  appliesNow      : boolean
  capsEnforced    : boolean
  createdAt       : string
  vendor          : AdminDiscountVendor
}

export interface AdminDiscountDetail extends AdminDiscountRow {
  description: string | null
  outlets: { id: string; name: string; addressLine1: string }[]
  items  : { id: string; name: string; basePriceMinor: number }[]
  /** Who stopped it, resolved to a name so the question is answerable without
   *  reading the audit log. */
  suspendedBy: { name: string; email: string } | null
}

export interface AdminDiscountListResult {
  discounts : AdminDiscountRow[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

/** The one place a state becomes words, so the list and the detail page can
 *  never describe the same offer differently. */
export const DISCOUNT_STATE_LABEL: Record<AdminDiscountState, string> = {
  RUNNING         : "Running",
  SCHEDULED       : "Scheduled",
  AWAITING_GO_LIVE: "Waiting on go-live",
  PAUSED          : "Paused by vendor",
  SUSPENDED       : "Stopped by us",
  EXPIRED         : "Finished",
  EXHAUSTED       : "Budget used up",
}

export function formatDiscountValue(
  discount: Pick<AdminDiscountRow, "type" | "percentBps" | "amountMinor" | "minSubtotalMinor">,
  currencyCode: string | null,
): string {
  if (discount.type === "PERCENTAGE_OFF_ITEMS") {
    return `${Number(((discount.percentBps ?? 0) / 100).toFixed(2))}% off`
  }
  const money = (minor: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency", currency: currencyCode ?? "USD", maximumFractionDigits: 2,
    }).format(minor / 100)

  const base = `${money(discount.amountMinor ?? 0)} off`
  return discount.minSubtotalMinor
    ? `${base} over ${money(discount.minSubtotalMinor)}`
    : base
}

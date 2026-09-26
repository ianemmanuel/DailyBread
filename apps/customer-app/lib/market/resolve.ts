import type { CustomerAddress } from "@repo/types/customer-app"
import type { MarketChoice } from "@/lib/location/cookie"

/*
 * What one market should do for this customer: deliver somewhere, or browse.
 *
 * PURE. The market bar, every market page and the account's address book all
 * answer "which address is this city using?" through here, so the bar can
 * never say one thing while the page below it does another — the defect the
 * old client-side copy of this rule produced.
 *
 * ── The order, and why ─────────────────────────────────────────────────────
 *
 *   1. what this DEVICE chose for this market (the cookie) — the most recent,
 *      most specific statement, including "browse";
 *   2. otherwise this CITY's default address (durable, per city, resolved by
 *      the backend);
 *   3. otherwise browse — there is nowhere to deliver to.
 *
 * A remembered address is honoured only while it is still in the customer's
 * book AND still resolves into this city. When it is not (deleted, pin moved,
 * signed out, another person on this browser) the choice falls through to the
 * default rather than failing: the page then states the address it actually
 * used, so nothing is presented as something it is not.
 *
 * Browsing keeps a target — the one the customer would return to — so the
 * picker can offer "Deliver to Westlands" back in a single click.
 */

export type ResolvedTarget =
  | { kind: "address"; address: CustomerAddress; source: "selected" | "default" }
  | { kind: "pin"; latitude: number; longitude: number; label: string }

export type ResolvedChoice =
  | { mode: "delivery"; target: ResolvedTarget }
  | {
      mode  : "browse"
      /** chosen — the customer asked to browse; nothing — no address here. */
      reason: "chosen" | "nothing"
      /** What "deliver" would return to. */
      target: ResolvedTarget | null
    }

export function resolveMarketChoice(
  choice              : MarketChoice | undefined,
  addressesInCity     : readonly CustomerAddress[],
  cityDefaultAddressId: string | null,
): ResolvedChoice {
  let remembered: ResolvedTarget | null = null
  if (choice?.target?.kind === "address") {
    const { addressId } = choice.target
    const address = addressesInCity.find((a) => a.id === addressId)
    if (address) remembered = { kind: "address", address, source: "selected" }
  } else if (choice?.target?.kind === "pin") {
    remembered = choice.target
  }

  const fallbackAddress = addressesInCity.find((a) => a.id === cityDefaultAddressId)
  const fallback: ResolvedTarget | null = fallbackAddress
    ? { kind: "address", address: fallbackAddress, source: "default" }
    : null

  const target = remembered ?? fallback

  if (choice?.mode === "browse") return { mode: "browse", reason: "chosen", target }
  if (target) return { mode: "delivery", target }
  return { mode: "browse", reason: "nothing", target: null }
}

/** The label a customer reads for a delivery target. */
export function targetLabel(target: ResolvedTarget): string {
  if (target.kind === "pin") return target.label
  return target.address.label ?? target.address.addressLine1
}

/** The quieter second line — the area, never an operational zone name. */
export function targetDetail(target: ResolvedTarget): string | null {
  if (target.kind === "pin") return "Pinned on the map"
  const { address } = target
  return address.serviceability.zoneName
    ?? (address.label ? address.addressLine1 : null)
}

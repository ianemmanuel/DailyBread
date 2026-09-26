import Link from "next/link"

import { DeliveryPicker, type DeliveryPickerProps } from "@/components/city/DeliveryPicker"
import { MarketTabs } from "@/components/city/MarketTabs"
import { RememberMarket } from "@/components/city/RememberMarket"
import type { MarketScope } from "@/lib/market/context"
import { targetDetail, targetLabel } from "@/lib/market/resolve"

/*
 * The market bar: WHERE you are browsing, and — inside that city — WHERE you
 * are delivering. Two questions, two controls, and the split is the scope
 * rule: the global navbar changes city, this bar never does.
 *
 *   desktop   [Nairobi · Kenya] [Overview Discover Meals …]   [Delivering to Home ▾]
 *   phone     [Nairobi · Kenya]                [Delivering to Home ▾]
 *             [Overview Discover Meals Meal plans …  → swipe]
 *
 * On a phone the delivery control shares the city's row rather than hiding in
 * the menu sheet: a Radix popover inside the sheet would open in a portal the
 * sheet blocks clicks to, and "where am I delivering" is exactly what must
 * stay visible.
 *
 * A Server Component: every prop is from the one per-request market scope, so
 * this bar and the page below it cannot disagree.
 */
export function MarketNav({ scope }: { scope: MarketScope }) {
  const { market, account, addresses, choice } = scope.context
  const { city, country } = market

  const target = choice.target
  const picker: Omit<DeliveryPickerProps, "className"> = {
    citySlug   : city.slug,
    cityName   : city.name,
    account,
    mode       : choice.mode,
    unavailable: scope.mode === "unavailable",
    target     : target
      ? {
          kind     : target.kind,
          addressId: target.kind === "address" ? target.address.id : null,
          label    : targetLabel(target),
          detail   : targetDetail(target),
        }
      : null,
    addresses  : addresses.map((address) => ({
      id           : address.id,
      label        : address.label ?? address.addressLine1,
      detail       : address.serviceability.zoneName ?? (address.label ? address.addressLine1 : null),
      isCityDefault: address.id === scope.context.cityDefaultAddressId,
    })),
  }

  return (
    <div className="full-bleed border-b border-border bg-surface-subtle">
      <RememberMarket citySlug={city.slug} />
      <nav aria-label={`${city.name} marketplace`} className="shell">
        <div className="flex min-h-16 items-center gap-4 py-2">
          <Link
            href={`/city/${city.slug}`}
            className="flex min-w-0 shrink-0 flex-col rounded-sm leading-tight"
          >
            <span className="truncate font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {city.name}
            </span>
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {country.name}
            </span>
          </Link>

          <div className="hidden min-w-0 flex-1 lg:flex">
            <MarketTabs citySlug={city.slug} />
          </div>

          <DeliveryPicker {...picker} className="ml-auto" />
        </div>

        <div className="-mt-1 flex pb-2 lg:hidden">
          <MarketTabs citySlug={city.slug} />
        </div>
      </nav>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, MapPin } from "lucide-react"

import { AccountError, AccountPending, AccountSuspended } from "@/components/account/AccountStates"
import { AddressBook, type AddressGroup } from "@/components/account/AddressBook"
import { Button } from "@/components/ui/button"
import { getAccount } from "@/lib/data/account"
import { getDeliveryCookie } from "@/lib/location/server"
import { resolveMarketChoice } from "@/lib/market/resolve"

/*
 * `/account/addresses` — the durable address manager, grouped by city.
 *
 * The market bar's picker SELECTS; this page MANAGES: per-city defaults,
 * removal, and a way into each city's map to add another. Which address this
 * device is delivering to in each city is resolved by the same rule the market
 * pages use (`resolveMarketChoice`), so "Delivering here" on this page always
 * matches what that city's pages are actually showing.
 */

export const metadata: Metadata = {
  title : "Delivery addresses",
  robots: { index: false, follow: false },
}

export default async function AddressesPage() {
  const [state, cookie] = await Promise.all([getAccount(), getDeliveryCookie()])

  if (state.kind === "pending")   return <div className="band-tight"><AccountPending /></div>
  if (state.kind === "suspended") return <div className="band-tight"><AccountSuspended message={state.message} /></div>
  if (state.kind === "error")     return <div className="band-tight"><AccountError message={state.message} /></div>

  const { addresses, markets } = state.session

  /* One group per city the customer has an address in, in the backend's
   * order (default city first); then anything whose pin has fallen outside
   * every operating city, so it can still be removed. */
  const groups: AddressGroup[] = markets
    .filter((market) => market.addressCount > 0)
    .map((market) => {
      const here = addresses.filter((a) => a.serviceability.citySlug === market.citySlug)
      const choice = resolveMarketChoice(cookie.markets[market.citySlug], here, market.defaultAddressId)
      return {
        citySlug         : market.citySlug,
        cityName         : market.cityName,
        addresses        : here,
        selectedAddressId: choice.mode === "delivery" && choice.target.kind === "address"
          ? choice.target.address.id
          : null,
      }
    })
  const known = new Set(markets.map((m) => m.citySlug))
  const elsewhere = addresses.filter((a) => !a.serviceability.citySlug || !known.has(a.serviceability.citySlug))
  if (elsewhere.length > 0) {
    groups.push({ citySlug: null, cityName: "Outside our cities", addresses: elsewhere, selectedAddressId: null })
  }

  return (
    <div className="band-tight space-y-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/account" className="rounded-sm hover:text-foreground hover:underline">
          Account
        </Link>
        <ChevronRight aria-hidden className="size-3.5" />
        <span className="text-foreground">Delivery addresses</span>
      </nav>

      <header className="max-w-2xl space-y-2">
        <h1 className="heading-xl text-balance">Delivery addresses</h1>
        <p className="lede">
          Each city keeps its own default. Choose where this device delivers,
          and see what we can actually reach at each address today.
        </p>
      </header>

      {addresses.length === 0 ? (
        <div className="surface flex flex-col gap-4 p-6 sm:p-8">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <MapPin aria-hidden className="size-4 text-primary-text" />
              No addresses yet
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              An address is a point on a map, so it is added from the city you
              are ordering in. Pick your city, drop a pin where you want the food,
              and save it from there.
            </p>
          </div>
          <div>
            <Button asChild className="h-11 rounded-full px-6">
              <Link href="/city">Choose your city</Link>
            </Button>
          </div>
        </div>
      ) : (
        <AddressBook groups={groups} />
      )}
    </div>
  )
}

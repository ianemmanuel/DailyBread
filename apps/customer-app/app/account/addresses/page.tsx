import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, MapPin } from "lucide-react"

import { AccountError, AccountPending, AccountSuspended } from "@/components/account/AccountStates"
import { AddressBook } from "@/components/account/AddressBook"
import { Button } from "@/components/ui/button"
import { getAccount } from "@/lib/data/account"
import { getStoredLocation } from "@/lib/location/server"

/*
 * `/account/addresses` — the address book.
 *
 * ── It manages; it does not create ─────────────────────────────────────────
 *
 * There is no "add address" form here, and that is deliberate. An address is a
 * PIN, so creating one needs a map, a coverage verdict and a market — which is
 * exactly `/city/[slug]/location`, already built. A second map on this page
 * would be a second location experience, the thing we just finished removing.
 * "Add an address" therefore sends you to a market to drop a pin, and saving
 * happens there while the customer is looking at the spot.
 *
 * Protected in `proxy.ts`; dynamic, because it reads both a token and the
 * location cookie.
 */

export const metadata: Metadata = {
  title : "Delivery addresses",
  robots: { index: false, follow: false },
}

export default async function AddressesPage() {
  /* Both reads are per-request and neither is cached. The cookie tells us
   * which address this DEVICE is currently delivering to — a different
   * question from which one is the default. */
  const [state, location] = await Promise.all([getAccount(), getStoredLocation()])

  if (state.kind === "pending")   return <div className="band-tight"><AccountPending /></div>
  if (state.kind === "suspended") return <div className="band-tight"><AccountSuspended message={state.message} /></div>
  if (state.kind === "error")     return <div className="band-tight"><AccountError message={state.message} /></div>

  const { addresses, defaultAddressId } = state.session

  return (
    <div className="band-tight space-y-6">
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
          Choose where this order goes, set the one you use most as your
          default, and see what we can actually deliver to each of them today.
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
              An address is a point on a map, so it is added from the market you
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
        <>
          <AddressBook
            addresses={addresses}
            defaultAddressId={defaultAddressId}
            selectedAddressId={location?.addressId ?? null}
          />

          <div className="pt-2">
            <Button asChild variant="brand" className="h-11 rounded-full px-5">
              <Link href={location?.citySlug ? `/city/${location.citySlug}/location` : "/city"}>
                <MapPin aria-hidden className="size-4" />
                Add an address
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

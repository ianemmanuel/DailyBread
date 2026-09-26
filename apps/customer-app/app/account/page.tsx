import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, MapPin } from "lucide-react"

import { AccountError, AccountPending, AccountSuspended } from "@/components/account/AccountStates"
import { AddressSummary } from "@/components/account/AddressSummary"
import { Button } from "@/components/ui/button"
import { getAccount } from "@/lib/data/account"

/*
 * `/account` — the first authenticated screen in the storefront.
 *
 * Protected in `proxy.ts`, so an anonymous visitor is redirected to sign in
 * and returned here afterwards; this page never renders a signed-out state and
 * does not need to.
 *
 * It is deliberately thin. Editing a name and phone number is not what an
 * account page is FOR at this stage — a customer comes here to check where
 * their food goes, which is the address book. Profile editing exists on the
 * backend (`PATCH /me`) and can be added when there is a reason.
 *
 * Dynamic by nature: it reads a token, so it is `ƒ` and `no-store`. That is
 * contained to this subtree — nothing here touches the root layout, so the
 * marketing and market pages stay static.
 */

export const metadata: Metadata = {
  title      : "Your account",
  /* Personal by definition. */
  robots     : { index: false, follow: false },
}

export default async function AccountPage() {
  const state = await getAccount()

  if (state.kind === "pending")   return <div className="band-tight"><AccountPending /></div>
  if (state.kind === "suspended") return <div className="band-tight"><AccountSuspended message={state.message} /></div>
  if (state.kind === "error")     return <div className="band-tight"><AccountError message={state.message} /></div>

  const { customer, addresses, defaultAddressId } = state.session

  return (
    <div className="band-tight space-y-8">
      <header className="space-y-2">
        <h1 className="heading-xl text-balance">
          {customer.fullName ? `Hello, ${customer.fullName.split(" ")[0]}` : "Your account"}
        </h1>
        <p className="lede">{customer.email}</p>
      </header>

      <section aria-labelledby="account-addresses-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="account-addresses-title" className="heading-lg">
              Delivery addresses
            </h2>
            <p className="text-sm text-muted-foreground">
              Where we bring your food. Coverage is checked fresh every time, so
              this always reflects what we can do today.
            </p>
          </div>

          <Button asChild variant="brand" className="h-11 shrink-0 rounded-full px-5">
            <Link href="/account/addresses">
              Manage addresses
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>

        <AddressSummary addresses={addresses} defaultAddressId={defaultAddressId} />
      </section>

      {addresses.length === 0 && (
        <section className="surface flex flex-col gap-4 p-6 sm:p-8">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <MapPin aria-hidden className="size-4 text-primary-text" />
              No addresses saved yet
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              An address is a point on a map, so it is added from the market you
              are ordering in — pick your city, drop a pin, and save it from
              there.
            </p>
          </div>
          <div>
            <Button asChild className="h-11 rounded-full px-6">
              <Link href="/city">Choose your city</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

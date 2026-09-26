"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, Star } from "lucide-react"
import type { CustomerMarket } from "@repo/types/customer-app"

import { Button } from "@/components/ui/button"
import { customerErrorMessage } from "@/lib/api/error-copy"
import { selectMarket } from "@/lib/market/actions"

/*
 * "Your cities" on the account page — and the one place the DEFAULT CITY is
 * chosen explicitly. It is where signing in lands.
 *
 * Without an explicit choice the backend falls back to the city selected most
 * recently, so this is a preference, not a setup step; the list says which
 * city is the default either way.
 */
export function YourCities({ markets }: { markets: CustomerMarket[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function makeDefault(slug: string) {
    setBusy(slug)
    setError(null)
    try {
      await selectMarket(slug, true)
      router.refresh()
    } catch (err) {
      setError(customerErrorMessage(err, "We couldn't change your default city."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {markets.map((market) => (
          <li key={market.cityId} className="surface flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold text-foreground">{market.cityName}</p>
                <p className="text-xs text-muted-foreground">
                  {market.addressCount === 0
                    ? "No saved address yet"
                    : `${market.addressCount} saved ${market.addressCount === 1 ? "address" : "addresses"}`}
                </p>
              </div>
              {market.isDefault && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary-subtle-fg">
                  <Star aria-hidden className="size-3" />
                  Default city
                </span>
              )}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button asChild size="sm" className="rounded-full">
                <Link href={`/city/${market.citySlug}`}>
                  Open
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </Button>
              {!market.isDefault && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => makeDefault(market.citySlug)}
                  className="rounded-full"
                >
                  {busy === market.citySlug
                    ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                    : <Star aria-hidden className="size-3.5" />}
                  Make default city
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

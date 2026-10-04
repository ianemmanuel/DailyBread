"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Star } from "lucide-react"

import type { HomeMarketResponse } from "@/app/api/markets/home/route"
import { Button } from "@/components/ui/button"
import { fetchHomeMarket } from "@/lib/market/home-client"

/*
 * The landing hero's way into a market.
 *
 *   first visit      [Choose your city →]
 *   returning        [★ Continue to Nairobi →]  [Explore other cities]
 *
 * "Returning" is whatever `/api/markets/home` names — the account's default
 * city when signed in, else the last city this device was in (the same answer
 * the navbar chip and `/continue` use, through one memoised request).
 *
 * The server and the first client pass render the first-visit row, so `/`
 * stays STATIC and hydration always matches; the returning row swaps in after
 * mount. Only plain links change — no Radix, no useId — so the swap cannot
 * shift generated ids (recurring bug class #12).
 */
export function HeroCityActions() {
  const [home, setHome] = React.useState<HomeMarketResponse>(null)

  React.useEffect(() => {
    let cancelled = false
    fetchHomeMarket()
      .then((answer) => { if (!cancelled) setHome(answer) })
      .catch(() => { /* Keep the first-visit row. */ })
    return () => { cancelled = true }
  }, [])

  if (!home) {
    return (
      <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
        <Link href="/city">
          Choose your city
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Button>
    )
  }

  return (
    <>
      <Button asChild size="lg" className="h-12 rounded-full px-7 text-base animate-in fade-in duration-300">
        <Link href={`/city/${home.slug}`}>
          {home.isDefault && <Star aria-hidden className="size-4 fill-current" />}
          Continue to {home.name}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Button>
      <Button asChild variant="brand" size="lg" className="h-12 rounded-full px-6 text-base">
        <Link href="/city">Explore other cities</Link>
      </Button>
    </>
  )
}

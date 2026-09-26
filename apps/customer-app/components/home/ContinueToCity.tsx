"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Star } from "lucide-react"

import type { HomeMarketResponse } from "@/app/api/markets/home/route"
import { fetchHomeMarket } from "@/lib/market/home-client"

/*
 * "Continue to Nairobi" — the landing page's way back into a returning
 * customer's own market.
 *
 * `/` stays the global page for everyone (and stays STATIC — this is a client
 * leaf, so nothing in the page's render reads a cookie or a session). A
 * visitor we know nothing about sees nothing here: the card appears only once
 * `/api/markets/home` names a city — their default city when signed in, the
 * last city this device was in otherwise.
 *
 * Deliberately compact: one short photographic strip under the hero, not a
 * second hero. The city's picture sits behind a left-to-right scrim so the
 * copy stays legible on any photograph; per-city imagery replaces the
 * placeholder in `lib/data/city-image.ts` without touching this.
 *
 * It renders nothing on the server and on the first client pass, then fades
 * in — so hydration always matches, and a first-time visitor never sees an
 * empty slot. The shift it causes is below the hero's actions.
 */
export function ContinueToCity() {
  const [home, setHome] = React.useState<HomeMarketResponse>(null)

  React.useEffect(() => {
    let cancelled = false
    fetchHomeMarket()
      .then((answer) => { if (!cancelled) setHome(answer) })
      .catch(() => { /* No card is the honest fallback. */ })
    return () => { cancelled = true }
  }, [])

  if (!home) return null

  return (
    <section aria-label={`Continue to ${home.name}`} className="pb-8 sm:pb-12">
      <Link
        href={`/city/${home.slug}`}
        className="group relative isolate flex h-28 items-center overflow-hidden rounded-3xl shadow-sm ring-1 ring-border/60 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:h-32"
      >
        <Image
          src={home.image.url}
          alt={home.image.isPlaceholder ? "" : home.image.alt}
          fill
          sizes="(max-width: 1280px) 100vw, 1280px"
          quality={70}
          className="-z-20 object-cover object-[center_65%] transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        {/* Scrim: solid behind the copy, clear over the skyline. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-deep/90 via-deep/60 to-deep/5" />

        <div className="flex w-full items-center justify-between gap-4 px-5 text-deep-foreground sm:px-8">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-deep-foreground/75 uppercase">
              {home.isDefault && <Star aria-hidden className="size-3 fill-primary text-primary" />}
              {home.isDefault ? "Your city" : "Welcome back"}
            </p>
            <p className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Continue to {home.name}
            </p>
            <p className="hidden text-sm text-deep-foreground/75 sm:block">
              {home.isDefault
                ? "Your default city — places, meals and plans that reach you."
                : "Pick up where you left off."}
            </p>
          </div>

          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-300 group-hover:translate-x-1 sm:size-12"
          >
            <ArrowRight className="size-5" />
          </span>
        </div>
      </Link>
    </section>
  )
}

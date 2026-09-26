"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRight, Check, ChevronDown, ChevronsUpDown, Loader2, MapPin, Star } from "lucide-react"
import type { Market } from "@repo/types/customer-app"

import { MARKET_CHANGED_EVENT } from "@/components/city/RememberMarket"
import { Button } from "@/components/ui/button"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { clientFetch } from "@/lib/api/client"
import { fetchHomeMarket } from "@/lib/market/home-client"
import { citySlugFromPath } from "@/constants/links/nav-links"
import { LAST_MARKET_COOKIE, parseLastMarket } from "@/lib/location/cookie"
import { cn } from "@/lib/utils"

/*
 * The global city picker — the ONE control that changes market.
 *
 * ── Outside a market it is also the way HOME ───────────────────────────────
 *
 * On `/`, `/city`, `/about` and `/account` the chip splits in two:
 *
 *   [ ★ Nairobi → ][ ▾ ]
 *
 * The left half is a plain link into the customer's home market — their
 * default city when signed in, else the last city this device was in
 * (`/api/markets/home`, the same answer `/continue` lands on). The right half
 * opens the full list. So a returning customer on the global homepage is ONE
 * click from their city, and `/` itself stays the global page.
 *
 * The chip first shows the device's last market from the cookie (instant) and
 * then the server's answer, which may name the default city instead. Nothing
 * cookie- or account-dependent renders on the server OR on the first client
 * pass — both draw the plain "Choose a city" chip — so hydration always
 * matches (recurring bug class #12); the split appears after mount. The Radix
 * ids live on the Popover, which never moves, so the inserted link cannot
 * shift them.
 *
 * ── Inside a market it names the market ────────────────────────────────────
 *
 * One chip, "Nairobi ▾", opening the list — the market bar below already says
 * everything else about the city.
 *
 * ── The list ───────────────────────────────────────────────────────────────
 *
 *   Your cities   the customer's cities in the backend's order — the default
 *                 city first — each saying in words whether it is the default,
 *                 where you are now, or both
 *   All cities    every other operating market
 *
 * A signed-out visitor has no "your cities", so the city this device was last
 * in is offered as "Recently visited" instead.
 *
 * Choosing a city only NAVIGATES; it carries no delivery point (each market
 * keeps its own choice). The list loads when the picker OPENS.
 */

const SEARCH_THRESHOLD = 8

interface PickerData {
  markets        : Market[]
  yours          : string[]
  defaultCitySlug: string | null
}

interface Home {
  slug     : string
  name     : string
  isDefault: boolean
}

type State =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "ready"; data: PickerData }
  | { step: "error" }

function readLastMarket(): Home | null {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LAST_MARKET_COOKIE}=`))
    ?.slice(LAST_MARKET_COOKIE.length + 1)
  const last = parseLastMarket(raw)
  return last ? { ...last, isDefault: false } : null
}

export function CityPicker({ className }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const currentSlug = citySlugFromPath(pathname)

  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<State>({ step: "idle" })
  /* Device's last market — names the current market, and is the instant
   * first guess at "home". */
  const [last, setLast] = React.useState<Home | null>(null)
  /* The server's answer to "home": the default city when signed in. */
  const [home, setHome] = React.useState<Home | null>(null)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const fromCookie = readLastMarket()
    setLast(fromCookie)
    setMounted(true)
    const refresh = () => setLast(readLastMarket())
    window.addEventListener(MARKET_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(MARKET_CHANGED_EVENT, refresh)
  }, [pathname])

  /* Only outside a market is "take me home" missing; inside one, the city is
   * already on screen. */
  React.useEffect(() => {
    if (currentSlug) return
    let cancelled = false
    fetchHomeMarket()
      .then((answer) => {
        if (!cancelled) setHome(answer && { slug: answer.slug, name: answer.name, isDefault: answer.isDefault })
      })
      .catch(() => { /* The cookie's guess stands. */ })
    return () => { cancelled = true }
  }, [currentSlug, pathname])

  async function load() {
    setState((previous) => previous.step === "ready" ? previous : { step: "loading" })
    try {
      setState({ step: "ready", data: await clientFetch<PickerData>("/api/markets") })
    } catch {
      setState((previous) => previous.step === "ready" ? previous : { step: "error" })
    }
  }

  function choose(slug: string) {
    setOpen(false)
    if (slug !== currentSlug) router.push(`/city/${slug}`)
  }

  const destination = currentSlug ? null : home ?? last
  const currentName = currentSlug && last?.slug === currentSlug ? last.name : null

  const cities = state.step === "ready"
    ? state.data.markets.flatMap((market) =>
        market.cities.map((city) => ({ ...city, countryName: market.countryName })))
    : []
  const bySlug = new Map(cities.map((city) => [city.slug, city]))
  const signedInYours = state.step === "ready" ? state.data.yours : []
  /* Signed out, the one city we know this device cares about. */
  const yoursSlugs = signedInYours.length > 0 ? signedInYours : last ? [last.slug] : []
  const yours = yoursSlugs
    .map((slug) => bySlug.get(slug))
    .filter((city): city is NonNullable<typeof city> => Boolean(city))
  const mine = new Set(yours.map((city) => city.slug))
  const others = cities.filter((city) => !mine.has(city.slug))
  const defaultSlug = state.step === "ready" ? state.data.defaultCitySlug : null

  const trigger = destination ? (
    /* Split: the chevron half alone opens the list. */
    <Button
      variant="ghost"
      aria-label="All cities"
      aria-expanded={open}
      className="h-10 rounded-l-none rounded-r-full border-l border-border/70 px-2.5"
    >
      <ChevronDown aria-hidden className="size-4 opacity-60" />
    </Button>
  ) : (
    <Button
      variant="ghost"
      role="combobox"
      aria-expanded={open}
      aria-label={currentName ? `City: ${currentName}. Change city` : "Choose a city"}
      className="h-10 min-w-0 gap-1.5 rounded-full px-3 font-medium"
    >
      <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
      <span className={cn("max-w-[7.5rem] truncate sm:max-w-[10rem]", !mounted && "opacity-0")}>
        {currentSlug ? currentName ?? "Switch city" : "Choose a city"}
      </span>
      <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 opacity-50" />
    </Button>
  )

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void load() }}>
      <div
        className={cn(
          "inline-flex min-w-0 items-center rounded-full border border-border/70 bg-card/60",
          className,
        )}
      >
        {destination && (
          <Link
            href={`/city/${destination.slug}`}
            aria-label={destination.isDefault
              ? `Go to ${destination.name}, your default city`
              : `Go back to ${destination.name}`}
            className="group inline-flex h-10 min-w-0 items-center gap-1.5 rounded-l-full pr-2.5 pl-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {destination.isDefault
              ? <Star aria-hidden className="size-3.5 shrink-0 fill-primary text-primary" />
              : <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />}
            <span className="max-w-[6.5rem] truncate sm:max-w-[10rem]">{destination.name}</span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </div>

      <PopoverContent align="start" className="w-[min(19rem,calc(100vw-2rem))] p-0">
        <Command>
          {cities.length >= SEARCH_THRESHOLD && <CommandInput placeholder="Search cities…" />}
          <CommandList className="max-h-[min(28rem,70vh)]">
            {state.step === "loading" && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Loading cities…
              </div>
            )}
            {state.step === "error" && (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                We couldn&apos;t load our cities just now. Please try again shortly.
              </div>
            )}
            {state.step === "ready" && cities.length === 0 && (
              <div className="px-3 py-6 text-sm text-muted-foreground">No cities are open for orders yet.</div>
            )}
            {state.step === "ready" && cities.length > 0 && (
              <>
                <CommandEmpty>No city matches that.</CommandEmpty>
                {yours.length > 0 && (
                  <CommandGroup heading={signedInYours.length > 0 ? "Your cities" : "Recently visited"}>
                    {yours.map((city) => (
                      <CityRow
                        key={city.id}
                        name={city.name}
                        countryName={city.countryName}
                        isCurrent={city.slug === currentSlug}
                        isDefault={city.slug === defaultSlug}
                        onSelect={() => choose(city.slug)}
                      />
                    ))}
                  </CommandGroup>
                )}
                {others.length > 0 && (
                  <CommandGroup heading={yours.length > 0 ? "All cities" : "Our cities"}>
                    {others.map((city) => (
                      <CityRow
                        key={city.id}
                        name={city.name}
                        countryName={city.countryName}
                        isCurrent={city.slug === currentSlug}
                        isDefault={false}
                        onSelect={() => choose(city.slug)}
                      />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One city. Default and current are said in WORDS as well as icons, and when
 * they are the same city it says so once — "Default city · you're here" —
 * rather than leaving two icons to be decoded.
 */
function CityRow({
  name, countryName, isCurrent, isDefault, onSelect,
}: {
  name       : string
  countryName: string
  isCurrent  : boolean
  isDefault  : boolean
  onSelect   : () => void
}) {
  const status = isDefault && isCurrent ? "Default city · you're here"
    : isDefault ? "Default city"
    : isCurrent ? "You're here"
    : null

  return (
    <CommandItem
      value={`${name} ${countryName}`}
      onSelect={onSelect}
      aria-current={isCurrent ? "page" : undefined}
      className={cn("cursor-pointer gap-2.5 py-2", isCurrent && "bg-primary-subtle/40")}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isDefault ? "bg-primary-subtle text-primary-subtle-fg" : "bg-muted text-muted-foreground",
        )}
      >
        {isDefault
          ? <Star aria-hidden className="size-3.5 fill-current" />
          : <MapPin aria-hidden className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {countryName}
          {status && <span className="font-medium text-primary-text"> · {status}</span>}
        </span>
      </span>
      {isCurrent && <Check aria-hidden className="size-4 shrink-0 text-primary-text" />}
    </CommandItem>
  )
}

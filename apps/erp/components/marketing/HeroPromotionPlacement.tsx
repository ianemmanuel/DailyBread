"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import type { HeroPromotionScope } from "@repo/types/admin-app"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/shared/SearchableSelect"
import type { ScopeTier } from "@/lib/auth/scope-tier"

/*
 * WHERE A HERO PROMOTION APPLIES — reach, then place.
 *
 * ── What a promotion IS ─────────────────────────────────────────────────────
 *
 * Always the PLATFORM talking, at every scope: a seasonal message, a
 * new-market announcement, an anniversary. Never a vendor, a meal or a meal
 * plan — that is a separate system and is not modelled anywhere. So the only
 * question this component asks is WHERE, never WHAT ABOUT.
 *
 * ── The reaches this admin may choose ───────────────────────────────────────
 *
 * Offered by TIER, not by permission: :manage says you may author promotions,
 * the tier says how far yours may reach. A country lead publishing globally
 * would be speaking for every market, so the option is simply absent rather
 * than present-and-rejected. The server enforces the same rule in
 * assertPromotionScope — this only stops an admin filling in a form that was
 * always going to 403.
 *
 * Whether an EXISTING promotion may be edited is a different question, and the
 * server answers that one: `HeroPromotion.canManage`. It is not re-derived
 * here, because two implementations of one authorization rule always drift.
 *
 * ── Picking a place ─────────────────────────────────────────────────────────
 *
 * A city is chosen through its COUNTRY, always: a flat list mixing Nairobi and
 * Sydney has nothing in it to tell an admin which market they are about to
 * merchandise, and it costs a request per country to build. When the admin's
 * scope contains exactly one country there is nothing to choose, so it is
 * shown as a fact instead of a dropdown and its cities load immediately.
 */

export interface PlaceOption {
  id: string
  name: string
  slug: string
}

/** The reaches a tier may author, widest first. */
function reachesFor(tier: ScopeTier): HeroPromotionScope[] {
  if (tier === "GLOBAL") return ["GLOBAL", "COUNTRY", "CITY"]
  if (tier === "COUNTRY") return ["COUNTRY", "CITY"]
  return ["CITY"]
}

const REACH_LABEL: Record<HeroPromotionScope, string> = {
  GLOBAL : "Global — the platform itself, everywhere",
  COUNTRY: "Country — every city in one country",
  CITY   : "City — one city only",
}

/** The reach a new promotion starts on: the widest this admin may author. */
export function defaultReachFor(tier: ScopeTier): HeroPromotionScope {
  return reachesFor(tier)[0]!
}

type CityState = "idle" | "loading" | "ready" | "error"

export function HeroPromotionPlacement({
  tier,
  countries,
  scope,
  onScopeChange,
  countryRef,
  onCountryChange,
  cityRef,
  onCityChange,
}: {
  tier     : ScopeTier
  countries: PlaceOption[]
  scope    : HeroPromotionScope
  onScopeChange: (scope: HeroPromotionScope) => void
  /** Slug. Carries the chosen country for a COUNTRY reach, and the city's
   *  parent country for a CITY one — the form only submits the former. */
  countryRef     : string
  onCountryChange: (slug: string) => void
  cityRef        : string
  onCityChange   : (slug: string) => void
}) {
  const reaches      = reachesFor(tier)
  const onlyCountry  = countries.length === 1 ? countries[0]! : null
  const needsCountry = scope === "COUNTRY" || scope === "CITY"

  const [cities, setCities]       = useState<PlaceOption[]>([])
  const [cityState, setCityState] = useState<CityState>("idle")

  /* Which country the in-flight request is for. A slow response for a country
   * the admin has already moved away from must not land in the list. */
  const inFlight = useRef<string | null>(null)

  const loadCities = useCallback(async (slug: string) => {
    inFlight.current = slug
    setCityState("loading")
    try {
      /* pageSize is explicit: the backend defaults to 10, and a picker that
       * silently omits a country's eleventh city is worse than one that fails. */
      const res = await fetch(
        `/api/countries/${encodeURIComponent(slug)}/cities?pageSize=500&status=ACTIVE`,
      )
      const body = await res.json()
      if (inFlight.current !== slug) return
      if (!res.ok) throw new Error(body?.message ?? "Could not load cities")
      setCities(body.data?.cities ?? [])
      setCityState("ready")
    } catch {
      if (inFlight.current !== slug) return
      /* Distinguished from "this country has no cities" on purpose — an empty
       * dropdown is how a failed load gets mistaken for an empty market. */
      setCities([])
      setCityState("error")
    }
  }, [])

  /* One country in scope means there is nothing to choose: adopt it and, for a
   * city promotion, start loading its cities without waiting for a click. */
  useEffect(() => {
    if (onlyCountry && needsCountry && countryRef !== onlyCountry.slug) {
      onCountryChange(onlyCountry.slug)
    }
  }, [onlyCountry, needsCountry, countryRef, onCountryChange])

  useEffect(() => {
    if (scope !== "CITY" || !countryRef) return
    void loadCities(countryRef)
  }, [scope, countryRef, loadCities])

  return (
    <section className="admin-card space-y-4">
      <h2 className="text-sm font-semibold">Where it applies</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="scope">Reach</Label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => {
              const next = e.target.value as HeroPromotionScope
              onScopeChange(next)
              /* The city never survives a reach change — carrying one into a
               * country promotion is how a promotion ends up aimed somewhere
               * nobody chose. The COUNTRY does survive a city→country switch,
               * because "this city" and "all of this country" are the same
               * market and re-picking it would be busywork; only GLOBAL, which
               * may name nowhere at all, clears it. */
              onCityChange("")
              if (next === "GLOBAL") onCountryChange("")
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {reaches.map((reach) => (
              <option key={reach} value={reach}>
                {REACH_LABEL[reach]}
              </option>
            ))}
          </select>
          {reaches.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Your scope covers one city, so city promotions are the only ones
              you can author.
            </p>
          )}
        </div>

        {/* Country — for a country promotion it IS the target; for a city one
            it is how the city list gets narrowed. */}
        {needsCountry && (
          <div className="space-y-1.5">
            <Label htmlFor="countryRef">Country</Label>
            {onlyCountry ? (
              <p className="flex h-9 items-center rounded-md border border-border/60 bg-muted/40 px-3 text-sm">
                {onlyCountry.name}
                <span className="ml-2 text-xs text-muted-foreground">your scope</span>
              </p>
            ) : (
              <SearchableSelect
                id="countryRef"
                options={countries.map((c) => ({ value: c.slug, label: c.name }))}
                value={countryRef}
                onChange={(slug) => {
                  onCountryChange(slug)
                  onCityChange("")
                }}
                placeholder="Choose a country…"
                searchPlaceholder="Search countries…"
                emptyLabel="No country found."
                aria-label="Country"
              />
            )}
          </div>
        )}
      </div>

      {/* City — only once a country is settled, so the list is always one
          market's worth of names. */}
      {scope === "CITY" && (
        <div className="space-y-1.5 sm:max-w-sm">
          <Label htmlFor="cityRef">City</Label>

          {!countryRef ? (
            <p className="text-sm text-muted-foreground">Choose a country first.</p>
          ) : cityState === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading cities…
            </p>
          ) : cityState === "error" ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>Could not load cities.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void loadCities(countryRef)}
              >
                Retry
              </Button>
            </div>
          ) : cities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This country has no active cities yet.
            </p>
          ) : (
            <SearchableSelect
              id="cityRef"
              options={cities.map((c) => ({ value: c.slug, label: c.name }))}
              value={cityRef}
              onChange={onCityChange}
              placeholder="Choose a city…"
              searchPlaceholder="Search cities…"
              emptyLabel="No city found."
              aria-label="City"
            />
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A visitor sees the most specific promotion that applies to them: their
        city first, then their country, then the global default — so a global
        promotion is what someone sees before they have told us where they are.
      </p>
    </section>
  )
}

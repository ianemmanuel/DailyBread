"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AlertCircle, Check, ChevronDown, Loader2, LocateFixed, MapPin } from "lucide-react"
import type { CityMarket, Market, Serviceability } from "@repo/types/customer-app"

import { AreasOfOperation } from "@/components/city/AreasOfOperation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { clientFetch } from "@/lib/api/client"
import { LOCATION_COOKIE, parseLocation, type StoredLocation } from "@/lib/location/cookie"
import { SERVICEABILITY_COPY } from "@/lib/location/serviceability-copy"

/*
 * "Where should we deliver?" — the one interactive thing on the landing page.
 *
 * ── Why this is its own component ──────────────────────────────────────────
 *
 * It is the only part of the hero that needs the client, and the only part
 * that can be slow. Keeping it a leaf means the hero's copy and photograph are
 * still a pure server render: the LCP image never waits on this file.
 *
 * ── Two answers to two different questions ─────────────────────────────────
 *
 *   MARKET  — "which city am I in?"  Coarse, and all a marketing page needs.
 *             Picking one navigates to that city's page. It sets NO cookie,
 *             because a city is not a point and pretending otherwise would put
 *             a made-up location into every later delivery estimate.
 *
 *   POINT   — "exactly where am I?"  Precise, and the only thing that can
 *             drive a feed, a fee or an order. Comes from the browser, on a
 *             CLICK — never on load, which browsers penalise and visitors
 *             resent — and is checked for coverage before anything is stored.
 *
 * ── A refusal always comes with somewhere to go ────────────────────────────
 *
 * "We do not deliver to your address" on its own leaves someone guessing. When
 * the point landed INSIDE a city we know (paused, or not launched yet) the
 * picker fetches that city's areas and shows them, so the answer is "not
 * there, but here, here and here". When it landed outside every city there is
 * no city to describe, so the city list opens instead.
 *
 * Both fetches go through this app's own /api/** handlers; the browser never
 * sees a backend URL or a token.
 */

type Phase =
  | { step: "idle" }
  | { step: "locating" }
  | { step: "checking" }
  | { step: "answered"; serviceability: Serviceability }
  | { step: "error"; message: string }

type MarketsState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "ready"; markets: Market[] }
  | { step: "error" }

export function LocationPicker({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const [phase, setPhase] = React.useState<Phase>({ step: "idle" })
  const [markets, setMarkets] = React.useState<MarketsState>({ step: "idle" })
  const [cityOpen, setCityOpen] = React.useState(false)
  const [current, setCurrent] = React.useState<StoredLocation | null>(null)
  /** The city a failed verdict landed in, with its areas. Null until asked for. */
  const [nearby, setNearby] = React.useState<CityMarket | null>(null)

  /*
   * The saved location is read AFTER mount, never during render.
   *
   * Reading it during render would make the server and the client produce
   * different trees and shift every generated id downstream — the ERP sidebar
   * shipped exactly that bug. In an effect, the first client render matches
   * the server's and the chip appears on the next paint.
   */
  React.useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${LOCATION_COOKIE}=`))
      ?.slice(LOCATION_COOKIE.length + 1)

    setCurrent(parseLocation(raw))
  }, [])

  /* Latest-wins. Someone can press "use my location" and then pick a city
   * before the first answer returns; without this the slower response would
   * overwrite the newer one and show a verdict for a place they are no longer
   * asking about. */
  const sequence = React.useRef(0)

  async function loadMarkets() {
    if (markets.step !== "idle") return

    setMarkets({ step: "loading" })
    try {
      const data = await clientFetch<{ markets: Market[] }>("/api/markets")
      setMarkets({ step: "ready", markets: data.markets })
    } catch {
      setMarkets({ step: "error" })
    }
  }

  function toggleCityList() {
    setCityOpen((open) => !open)
    void loadMarkets()
  }

  /** Open the list and load it, for the paths that fall back to picking a city. */
  function offerCityList() {
    setCityOpen(true)
    void loadMarkets()
  }

  function useMyLocation() {
    setNearby(null)

    if (!("geolocation" in navigator)) {
      setPhase({
        step   : "error",
        message: "This browser cannot share your location. Choose your city instead.",
      })
      offerCityList()
      return
    }

    const ticket = ++sequence.current
    setPhase({ step: "locating" })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (ticket !== sequence.current) return
        void submitPoint(position.coords.latitude, position.coords.longitude, ticket)
      },
      (error) => {
        if (ticket !== sequence.current) return
        setPhase({
          step   : "error",
          message: error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Choose your city instead."
            : "We could not get your location. Choose your city instead.",
        })
        offerCityList()
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  async function submitPoint(latitude: number, longitude: number, ticket: number) {
    setPhase({ step: "checking" })

    try {
      const { serviceability } = await clientFetch<{ serviceability: Serviceability }>(
        "/api/location",
        { method: "POST", body: JSON.stringify({ latitude, longitude }) },
      )
      if (ticket !== sequence.current) return

      /* Serviceable: go to the FEED. A point is a delivery location, and the
       * feed is the page a delivery location is for — the city page is where a
       * MARKET pick lands. (This used to push to /city/<slug>, which on the
       * city page itself meant pressing the button reloaded the page you were
       * already on.) The cookie is already written, so the feed renders for
       * this point with no further round trip. */
      if (serviceability.isServiceable) {
        if (pathname === "/discover") router.refresh()
        else router.push("/discover")
        return
      }

      setPhase({ step: "answered", serviceability })

      if (serviceability.citySlug) {
        /* Inside a city we know, but not somewhere we can serve. Show that
         * city's areas rather than making them guess where we are. */
        void loadNearby(serviceability.citySlug, ticket)
      } else {
        /* Outside every city — there is nothing to describe, so offer the
         * places we do operate. */
        offerCityList()
      }
    } catch {
      if (ticket !== sequence.current) return
      setPhase({
        step   : "error",
        message: "We could not check that location. Choose your city instead.",
      })
      offerCityList()
    }
  }

  async function loadNearby(citySlug: string, ticket: number) {
    try {
      const detail = await clientFetch<CityMarket>(`/api/cities/${citySlug}`)
      if (ticket !== sequence.current) return
      setNearby(detail)
    } catch {
      /* Silent on purpose. The verdict above already told them what they
       * needed; failing to load a helpful extra must not turn into a second
       * error message about something they did not ask for. */
      if (ticket !== sequence.current) return
      offerCityList()
    }
  }

  const busy = phase.step === "locating" || phase.step === "checking"
  const answered = phase.step === "answered" ? phase.serviceability : null
  const copy = answered ? SERVICEABILITY_COPY[answered.status] : null

  return (
    <div className="w-full max-w-md space-y-3">
      {/* ── What we already know ──────────────────────────────────────────── */}
      {current && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin aria-hidden className="size-3.5 shrink-0 text-primary-text" />
          <span className="truncate">
            Delivering to <span className="font-medium text-foreground">{current.label}</span>
          </span>
          {/* A saved POINT means the feed can render — so that is where
              "Continue" goes, not the city's marketing page. */}
          {pathname !== "/discover" && (
            <Link
              href="/discover"
              className="shrink-0 rounded-sm font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Continue
            </Link>
          )}
        </p>
      )}

      {/* ── The point ─────────────────────────────────────────────────────── */}
      <div className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
        <MapPin aria-hidden className="ml-2 size-5 shrink-0 text-primary-text" />
        <span className="min-w-0 flex-1 truncate text-base text-muted-foreground sm:text-sm">
          {placeholder}
        </span>
        <Button
          type="button"
          onClick={useMyLocation}
          disabled={busy}
          className="shrink-0 gap-2 rounded-xl"
        >
          {busy
            ? <Loader2 aria-hidden className="size-4 animate-spin" />
            : <LocateFixed aria-hidden className="size-4" />}
          {phase.step === "locating" ? "Locating…" : phase.step === "checking" ? "Checking…" : "Find food near me"}
        </Button>
      </div>

      {/* ── The market ────────────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={toggleCityList}
          aria-expanded={cityOpen}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          or choose your city
          <ChevronDown
            aria-hidden
            className={`size-3.5 transition-transform ${cityOpen ? "rotate-180" : ""}`}
          />
        </button>

        {cityOpen && (
          <div className="mt-2">
            {markets.step === "loading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Loading cities…
              </p>
            )}

            {markets.step === "error" && (
              <p className="text-sm text-muted-foreground">
                We could not load the city list just now. Please try again shortly.
              </p>
            )}

            {markets.step === "ready" && markets.markets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                We have not opened any cities for orders yet.
              </p>
            )}

            {markets.step === "ready" && markets.markets.length > 0 && (
              <Select onValueChange={(slug) => router.push(`/city/${slug}`)}>
                <SelectTrigger
                  aria-label="Choose your city"
                  className="h-11 w-full rounded-xl bg-card text-base sm:text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />
                    <SelectValue placeholder="Select a city" />
                  </span>
                </SelectTrigger>

                <SelectContent className="rounded-xl">
                  {/* Grouped by country, which is also how the backend returns
                      them. With one market the label is quiet context; with
                      several it is the thing that stops "Springfield" being
                      ambiguous. */}
                  {markets.markets.map((market) => (
                    <SelectGroup key={market.countryId}>
                      <SelectLabel>{market.countryName}</SelectLabel>
                      {market.cities.map((city) => (
                        <SelectItem key={city.id} value={city.slug} className="rounded-lg">
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* ── What we found out ─────────────────────────────────────────────── */}
      {phase.step === "error" && (
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {phase.message}
        </p>
      )}

      {answered && copy && (
        <div
          role="status"
          className={`space-y-3 rounded-xl border p-3 ${
            answered.isServiceable
              ? "border-success/30 bg-success/10"
              : "border-warning/30 bg-warning/10"
          }`}
        >
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {answered.isServiceable
                ? <Check aria-hidden className="size-4 text-success" />
                : <AlertCircle aria-hidden className="size-4 text-warning" />}
              {copy.title}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
          </div>

          {/* Not at your address — but here is where we are. */}
          {nearby && (
            <div className="border-t border-border/60 pt-3">
              <AreasOfOperation cityName={nearby.city.name} areas={nearby.areas} compact />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle, ArrowRight, Check, Loader2, LocateFixed, MapPin,
} from "lucide-react"
import type { CityMarket, Serviceability } from "@repo/types/customer-app"

import { AreasOfOperation } from "@/components/city/AreasOfOperation"
import { SaveAddressPanel } from "@/components/location/SaveAddressPanel"
import { Button } from "@/components/ui/button"
import { clientFetch } from "@/lib/api/client"
import { customerErrorMessage } from "@/lib/api/error-copy"
import { SERVICEABILITY_COPY } from "@/lib/location/serviceability-copy"

/*
 * "Where should we deliver?" — the page, not a sheet.
 *
 * ── Two ways in, one primitive out ─────────────────────────────────────────
 *
 * The browser's own location and a pin on a map are two ways of answering the
 * same question, and both produce the only thing that matters downstream: a
 * LATITUDE AND A LONGITUDE. A search box would be a third source of exactly
 * that, which is why there is no provider abstraction here to make room for
 * one — a geocoder will call `pick()` like everything else does.
 *
 * ── The city in the URL is context, never the answer ───────────────────────
 *
 * This page is mounted under a city because that is where the customer is
 * browsing and because it is what points the map somewhere useful. It is not
 * evidence of where they are, it is not a coverage claim, and it never becomes
 * the delivery point: the centroid opens the view and stops there. The
 * customer can pin anywhere on earth, and if that lands in a different city
 * the SERVER says so and we offer to switch marketplace — we do not quietly
 * relabel their point as this city's.
 *
 * ── Nothing here decides serviceability ────────────────────────────────────
 *
 * The verdict is whatever `POST /api/location` returns for the exact point
 * submitted. No boundary test, no zone lookup and no distance arithmetic
 * happens in this file (principle 1).
 */

const DeliveryMap = dynamic(() => import("./DeliveryMap"), {
  ssr    : false,
  loading: () => <div className="shimmer h-full min-h-[20rem] w-full rounded-2xl" />,
})

interface Point { latitude: number; longitude: number }

type Phase =
  | { step: "idle" }
  | { step: "locating" }
  | { step: "confirming" }
  | { step: "answered"; serviceability: Serviceability }
  | { step: "error"; message: string }

/** Enough precision to identify a doorway (~1 m), and no more digits of
 *  false accuracy than that. Display only. */
function formatPoint(point: Point): string {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
}

/** Identity of a pin, for "is this still the point we answered for?". Rounded
 *  to the same precision the customer is shown, so a sub-millimetre difference
 *  in a float cannot make a settled pin look moved. */
function keyOf(point: Point): string {
  return formatPoint(point)
}

export function LocationWorkbench({
  market,
  initialPin = null,
}: {
  market     : CityMarket
  /** The customer's own pin for this city, from their delivery choice. Placed
   *  but NOT confirmed — coverage is re-checked on confirm, never assumed. */
  initialPin?: Point | null
}) {
  const router = useRouter()
  const [point, setPoint] = React.useState<Point | null>(initialPin)
  /* The point the verdict on screen belongs to. Confirming is only meaningful
   * for a pin we have NOT already answered for: without this the button stayed
   * live after a confirmed — and even saved — location, inviting the customer
   * to re-ask a question they had finished asking. */
  const [confirmedKey, setConfirmedKey] = React.useState<string | null>(null)
  const [phase, setPhase] = React.useState<Phase>({ step: "idle" })
  /** The resolved city's areas, fetched only when we have to explain a refusal. */
  const [nearby, setNearby] = React.useState<CityMarket | null>(null)

  /* Latest-wins. Someone can press "use my location" and then tap the map
   * before the first answer lands; without this the slower response would
   * overwrite the newer one and report a verdict for a point they have already
   * moved away from. */
  const sequence = React.useRef(0)

  /** Every source of coordinates lands here — GPS, a tap, a dragged pin. */
  const pick = React.useCallback((latitude: number, longitude: number) => {
    sequence.current++
    setPoint({ latitude, longitude })
    setNearby(null)
    /* A new point invalidates the previous verdict AND its confirmation.
     * Leaving either on screen would be the page asserting coverage for
     * somewhere the pin no longer is. */
    setPhase({ step: "idle" })
    setConfirmedKey(null)
  }, [])

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setPhase({
        step   : "error",
        message: "This browser cannot share your location. Tap the map to place your pin instead.",
      })
      return
    }

    const ticket = ++sequence.current
    setPhase({ step: "locating" })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (ticket !== sequence.current) return
        /* Note what this does NOT do: it does not submit. The browser's idea
         * of "here" can be a kilometre out indoors, so it seeds the pin and
         * the customer confirms — the same as any other way of placing it. */
        pick(position.coords.latitude, position.coords.longitude)
      },
      (error) => {
        if (ticket !== sequence.current) return
        setPhase({
          step   : "error",
          message: error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Tap the map to place your pin instead."
            : "We could not get your location. Tap the map to place your pin instead.",
        })
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  async function confirm() {
    if (!point) return

    const ticket = ++sequence.current
    setPhase({ step: "confirming" })

    try {
      /* The existing write, unchanged: the backend resolves the point and
       * writes the session cookie, and hands back the verdict WITHOUT storing
       * it anywhere — coverage changes when an admin edits a zone. */
      const { serviceability } = await clientFetch<{ serviceability: Serviceability }>(
        "/api/location",
        { method: "POST", body: JSON.stringify(point) },
      )
      if (ticket !== sequence.current) return

      setPhase({ step: "answered", serviceability })
      setConfirmedKey(keyOf(point))
      /* The cookie now holds this pin for its market — re-render the market
       * bar so it says so. */
      router.refresh()

      /* Inside a city we know but unable to serve it: name the places we do
       * cover there rather than leaving someone to guess. */
      if (!serviceability.isServiceable && serviceability.citySlug) {
        try {
          const detail = await clientFetch<CityMarket>(`/api/cities/${serviceability.citySlug}`)
          if (ticket === sequence.current) setNearby(detail)
        } catch {
          /* Silent: the verdict above already answered them, and a failure to
           * load a helpful extra must not become a second error about
           * something they did not ask for. */
        }
      }
    } catch (err) {
      if (ticket !== sequence.current) return
      setPhase({
        step   : "error",
        message: customerErrorMessage(err, "We could not check that location just now. Please try again."),
      })
    }
  }

  const busy = phase.step === "locating" || phase.step === "confirming"
  /* Settled = the pin on screen is the one we already have an answer for.
   * Everything below keys off this rather than off "has a verdict", because a
   * verdict for a pin that has since moved is exactly the stale state this
   * distinction exists to prevent. */
  const settled = Boolean(point && confirmedKey && keyOf(point) === confirmedKey)
  const answered = phase.step === "answered" ? phase.serviceability : null
  const copy = answered ? SERVICEABILITY_COPY[answered.status] : null

  /* THE MISMATCH. The point decides which city it is in; the URL only decided
   * which map we opened. When the two differ we say so plainly and offer the
   * switch — never rewrite one as the other. */
  const resolvedElsewhere = Boolean(
    answered?.citySlug && answered.citySlug !== market.city.slug,
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
      <div className="order-2 h-[22rem] sm:h-[28rem] lg:order-1 lg:h-[34rem]">
        <DeliveryMap viewport={market.viewport} point={point} onPick={pick} />
      </div>

      <div className="order-1 space-y-5 lg:order-2">
        <div className="surface space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="heading-md text-foreground">Your delivery point</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tap the map to place your pin, drag it to fine-tune, or use your
              current location. We check coverage once you confirm.
            </p>
          </div>

          <Button
            type="button"
            variant="brand"
            onClick={useMyLocation}
            disabled={busy}
            className="h-11 w-full gap-2 rounded-xl"
          >
            {phase.step === "locating"
              ? <Loader2 aria-hidden className="size-4 animate-spin" />
              : <LocateFixed aria-hidden className="size-4" />}
            {phase.step === "locating" ? "Finding you…" : "Use my current location"}
          </Button>

          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {settled ? "Delivering to" : "Selected point"}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
              {settled
                ? <Check aria-hidden className="size-4 shrink-0 text-success" />
                : <MapPin aria-hidden className="size-4 shrink-0 text-primary-text" />}
              {/* Once settled, the customer's own words for the place beat six
                  decimal places of latitude — they recognise "Westlands", not
                  "-1.26410". The raw point stays available while they are
                  still choosing, because that is when it is the only thing
                  distinguishing one pin from another. */}
              {!point
                ? "No pin placed yet"
                : settled && answered
                  ? answered.zoneName && answered.cityName
                    ? `${answered.zoneName}, ${answered.cityName}`
                    : answered.cityName ?? formatPoint(point)
                  : formatPoint(point)}
            </p>
          </div>

          {/* Confirming is only offered for a pin we have NOT answered for.
              Leaving it live after a confirmed — and possibly saved — location
              invites someone to re-ask a finished question, and reads as though
              nothing had happened the first time. */}
          {settled ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              This location is set. Drag the pin or tap the map to choose a
              different spot.
            </p>
          ) : (
            <Button
              type="button"
              onClick={confirm}
              disabled={!point || busy}
              className="h-11 w-full rounded-xl"
            >
              {phase.step === "confirming"
                ? <Loader2 aria-hidden className="size-4 animate-spin" />
                : null}
              {phase.step === "confirming" ? "Checking…" : "Confirm this location"}
            </Button>
          )}
        </div>

        {phase.step === "error" && (
          <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            {phase.message}
          </p>
        )}

        {answered && copy && (
          <div
            role="status"
            className={`space-y-4 rounded-2xl border p-5 ${
              answered.isServiceable
                ? "border-success/30 bg-success/10"
                : "border-warning/30 bg-warning/10"
            }`}
          >
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                {answered.isServiceable
                  ? <Check aria-hidden className="size-4 text-success" />
                  : <AlertCircle aria-hidden className="size-4 text-warning" />}
                {copy.title}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{copy.body}</p>

              {/* The resolved city, named by the server. Shown whenever we know
                  it — it is how someone spots that they have pinned the wrong
                  side of a boundary. */}
              {answered.cityName && (
                <p className="pt-1 text-sm text-muted-foreground">
                  This point is in{" "}
                  <span className="font-medium text-foreground">{answered.cityName}</span>
                  {answered.zoneName && <> &middot; {answered.zoneName}</>}
                </p>
              )}
            </div>

            {nearby && (
              <div className="border-t border-border/60 pt-4">
                <AreasOfOperation cityName={nearby.city.name} areas={nearby.areas} compact />
              </div>
            )}

            {/* Keeping the spot is offered wherever the point is USABLE — which
                includes a city we know but cannot serve yet. That address is a
                real destination and a real demand signal; refusing to save it
                would throw away the one thing the customer just told us. Only
                a point in no city at all has nothing to attach. */}
            {point && answered.cityId && (
              <SaveAddressPanel
                point={point}
                serviceability={answered}
                cityName={market.city.name}
                citySlug={market.city.slug}
              />
            )}

            <div className="flex flex-wrap gap-3">
              {answered.isServiceable && (
                <Button asChild className="h-11 rounded-full px-5">
                  {/* The point is already in the cookie, so the feed renders
                      for it with no further round trip. Straight to THIS
                      market's places rather than the global doorway, which
                      would only resolve the same city again. */}
                  <Link href={`/city/${answered.citySlug ?? market.city.slug}/discover`}>
                    See what&apos;s available
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </Button>
              )}

              {resolvedElsewhere && answered.citySlug && (
                <Button asChild variant="outline" className="h-11 rounded-full px-5">
                  <Link href={`/city/${answered.citySlug}`}>
                    Browse {answered.cityName ?? "that city"}
                  </Link>
                </Button>
              )}

              {!answered.isServiceable && !answered.citySlug && (
                <Button asChild variant="outline" className="h-11 rounded-full px-5">
                  <Link href="/city">See where we deliver</Link>
                </Button>
              )}

              {!answered.isServiceable && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-full px-5"
                  /* Clears the verdict and KEEPS the pin, so moving it a
                     street over starts from where they were rather than from
                     an empty map. */
                  onClick={() => { sequence.current++; setNearby(null); setPhase({ step: "idle" }) }}
                >
                  Try another spot
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

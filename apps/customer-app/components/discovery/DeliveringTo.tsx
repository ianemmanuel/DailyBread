import Link from "next/link"
import { ArrowRight, MapPin, Pencil } from "lucide-react"
import type { MarketCity, Serviceability } from "@repo/types/customer-app"

/*
 * The feed's header: where we are delivering, and whether that is the market
 * being browsed.
 *
 * ── The one place the two concepts meet ────────────────────────────────────
 *
 * A customer can browse Nairobi from Cape Town, and can browse Nairobi while
 * their pin sits in Mombasa. Both are legitimate, and neither should be
 * silently resolved by the app picking a winner. So when the resolved city is
 * not the one in the URL this says so in plain words and offers the switch —
 * the feed itself is, correctly, the POINT's feed either way.
 *
 * ── Customer labels only ───────────────────────────────────────────────────
 *
 * `location.label` is built by the server from the resolved zone's publicName
 * and the city name, so operational vocabulary cannot reach this line. The
 * count is the backend's own total, not a guess.
 */
export function DeliveringTo({
  label,
  resolved,
  browsing,
  total,
  usingDefault = false,
}: {
  /** "Westlands, Nairobi" — already customer-facing. */
  label   : string
  resolved: Serviceability
  browsing: MarketCity
  total   : number
  /** Nothing was chosen on this device, so the customer's DEFAULT address is
   *  anchoring the feed. Said out loud: an address they picked months ago on
   *  another device is a reasonable guess, not an instruction they just gave. */
  usingDefault?: boolean
}) {
  const elsewhere = Boolean(resolved.citySlug && resolved.citySlug !== browsing.slug)

  return (
    <header className="space-y-3">
      <div className="space-y-1">
        <h1 className="heading-xl text-foreground">
          Places delivering to{" "}
          <span className="text-primary-text">{label}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing available here right now"
            : `${total} ${total === 1 ? "place" : "places"} can reach this address`}
          {usingDefault && (
            <span className="text-muted-foreground"> · your default address</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/city/${browsing.slug}/location`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Pencil aria-hidden className="size-3.5 text-muted-foreground" />
          Change delivery location
        </Link>

        {/* The mismatch, stated rather than resolved for them. */}
        {elsewhere && resolved.citySlug && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0 text-warning" />
            You are browsing {browsing.name}, but this address is in{" "}
            {resolved.cityName ?? "another city"}.
            <Link
              href={`/city/${resolved.citySlug}/places`}
              className="group inline-flex items-center gap-1 font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Switch market
              <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </p>
        )}
      </div>
    </header>
  )
}

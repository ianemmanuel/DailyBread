/*
 * Where the visitor is, held in a cookie.
 *
 * ─── Why a cookie and not client state ───────────────────────────────────────
 *
 * Discovery is entirely a function of a location, and a cookie is the only
 * client-owned value a SERVER component can read. Holding the location in
 * React state instead would force every located page to render empty, fetch on
 * mount and fill in — a visible waterfall on the screen that matters most.
 *
 * ─── It is UNTRUSTED input ───────────────────────────────────────────────────
 *
 * A cookie is client-writable, so everything read back from it is parsed
 * defensively: a malformed, out-of-range or oversized value reads as "no
 * location" rather than being forwarded to the backend. The cookie carries a
 * POINT and some labels — never a serviceability verdict, because coverage
 * changes when an admin edits a zone and a cached answer would go quietly
 * stale. The backend re-resolves what the point means on every request.
 *
 * ─── Anonymous and signed-in visitors ────────────────────────────────────────
 *
 * An anonymous visitor has no address book, so this cookie IS their location.
 * A signed-in visitor has saved addresses, and the cookie then holds WHICH ONE
 * they picked. Either way the SERVER resolves what it means.
 *
 * ─── When addressId is present it is the ONLY authority ──────────────────────
 *
 * `addressId` names a row the backend owns and re-resolves per request. The
 * other fields are then a SNAPSHOT for rendering a label without a round trip —
 * they are not a fallback, and nothing may answer for a selected address using
 * them. A read that cannot use the address says so (`address-unusable` in
 * lib/data/discovery.ts); it does not quietly answer for the stale point
 * sitting next to it.
 *
 * ─── What this cookie is NOT ─────────────────────────────────────────────────
 *
 * Not a serviceability verdict (coverage changes when an admin edits a zone).
 * Not the customer's DEFAULT address, which is durable and lives in the
 * database — this is the per-device CURRENT choice, and the two are allowed to
 * differ. Not the marketplace city being browsed either: that is the URL.
 */

export const LOCATION_COOKIE = "db_location"

/** A year. The location is a convenience, not a session — someone returning in
 *  a month still lives in the same place. */
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export interface StoredLocation {
  latitude : number
  longitude: number
  /** What to show in the header — "Westlands, Nairobi" or a saved address's
   *  label. Display only; nothing is ever decided from it. */
  label    : string
  /** The city the backend resolved this point into, when it resolved into one.
   *  Cached here so a header or a link can be rendered without re-resolving;
   *  anything that DECIDES still asks the backend with the point. */
  cityId   ?: string
  citySlug ?: string
  cityName ?: string
  countryId?: string
  /** Set when the visitor picked a SAVED address, so a read can pass the id and
   *  let the backend resolve the point itself rather than trusting coordinates
   *  from a cookie the client could edit. */
  addressId?: string
}

/** A bounded, trimmed string or undefined. Keeps a hand-edited cookie from
 *  putting a megabyte of text into a header or an id into a query. */
function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed.slice(0, max)
}

/**
 * Tight parsing, shared by the server and the browser.
 *
 * Deliberately has no `next/headers` import so the picker can read the same
 * cookie client-side through exactly this function — one parser, so the two
 * sides can never disagree about what a malformed value means.
 */
export function parseLocation(raw: string | undefined): StoredLocation | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<StoredLocation>
    const { latitude, longitude } = parsed

    if (
      typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    ) return null

    return {
      latitude,
      longitude,
      label: text(parsed.label, 120) ?? "Your location",
      ...(text(parsed.cityId, 64)    ? { cityId   : text(parsed.cityId, 64)! }    : {}),
      ...(text(parsed.citySlug, 80)  ? { citySlug : text(parsed.citySlug, 80)! }  : {}),
      ...(text(parsed.cityName, 120) ? { cityName : text(parsed.cityName, 120)! } : {}),
      ...(text(parsed.countryId, 64) ? { countryId: text(parsed.countryId, 64)! } : {}),
      ...(text(parsed.addressId, 64) ? { addressId: text(parsed.addressId, 64)! } : {}),
    }
  } catch {
    return null
  }
}

export function serializeLocation(location: StoredLocation): string {
  return encodeURIComponent(JSON.stringify(location))
}

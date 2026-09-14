import "server-only"
import { cookies } from "next/headers"

/*
 * Where the visitor is, held in a cookie.
 *
 * ─── Why a cookie and not client state ───────────────────────────────────────
 *
 * Discovery is entirely a function of a location, and a cookie is the only
 * client-owned value a SERVER component can read. Holding the location in
 * React state instead would force the feed to render empty, fetch on mount and
 * fill in — a visible waterfall on the first screen of the app, and the slowest
 * possible version of the page that matters most.
 *
 * With it in a cookie the home page is a plain server render: read the
 * location, ask the backend, stream the result. Uber Eats does the same thing
 * for the same reason.
 *
 * ─── Anonymous and signed-in visitors ────────────────────────────────────────
 *
 * An anonymous visitor has no address book, so this cookie IS their location.
 * A signed-in visitor has saved addresses, and the cookie then holds which one
 * they picked (plus its coordinates, so the feed needs no extra round trip).
 * Either way the SERVER resolves what it means — the cookie carries a point,
 * never a serviceability verdict, because that is the backend's answer to give.
 */

const COOKIE = "db_location"

/** A year. The location is a convenience, not a session — someone returning in
 *  a month still lives in the same place. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export interface StoredLocation {
  latitude : number
  longitude: number
  /** What to show in the header — "Westlands, Nairobi" or a saved address's
   *  label. Display only; nothing is ever decided from it. */
  label    : string
  /** Set when the visitor picked a SAVED address, so discovery can pass the id
   *  and let the backend resolve the point itself rather than trusting the
   *  coordinates in a cookie the client could edit. */
  addressId?: string
}

/** Tight parsing. A cookie is client-writable, so everything from it is
 *  untrusted input: a malformed or out-of-range value reads as "no location"
 *  rather than being passed to the backend. */
export function parseLocation(raw: string | undefined): StoredLocation | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<StoredLocation>
    const { latitude, longitude, label, addressId } = parsed

    if (
      typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    ) return null

    return {
      latitude,
      longitude,
      label: typeof label === "string" && label.trim() !== "" ? label.trim().slice(0, 120) : "Your location",
      ...(typeof addressId === "string" && addressId !== "" ? { addressId } : {}),
    }
  } catch {
    return null
  }
}

export async function getStoredLocation(): Promise<StoredLocation | null> {
  return parseLocation((await cookies()).get(COOKIE)?.value)
}

export async function setStoredLocation(location: StoredLocation): Promise<void> {
  ;(await cookies()).set(COOKIE, encodeURIComponent(JSON.stringify(location)), {
    maxAge  : MAX_AGE_SECONDS,
    path    : "/",
    sameSite: "lax",
    // Deliberately NOT httpOnly: the picker reads it to show the current choice
    // without a round trip. Nothing secret lives here — it is a point and a
    // label, and the backend re-resolves what either means on every request.
    httpOnly: false,
  })
}

export async function clearStoredLocation(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}

export const LOCATION_COOKIE = COOKIE

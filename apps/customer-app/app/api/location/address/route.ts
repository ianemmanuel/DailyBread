import { NextResponse, type NextRequest } from "next/server"
import type { CustomerSessionData } from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { envelopeError, envelopeReject } from "@/lib/api/proxy"
import {
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE,
  serializeLocation,
  type StoredLocation,
} from "@/lib/location/cookie"

/*
 * POST /api/location/address — "deliver to this saved address, on this device".
 *
 * ── Why this is not just a cookie write in the browser ─────────────────────
 *
 * The cookie is client-writable, so nothing in it can be trusted on its own.
 * What makes `addressId` safe to act on is that the SERVER resolves it: this
 * handler reads the caller's own address book with their token and finds the
 * row. An id belonging to someone else simply is not in that list, so it is
 * refused here and would be refused again by the feed.
 *
 * Everything written into the cookie therefore comes from the BACKEND's answer
 * — the label from the resolved zone's publicName and city, the coordinates
 * from the stored row. Nothing is taken from the request but the id itself.
 *
 * ── The coordinates are a display snapshot, not authority ──────────────────
 *
 * They are stored so a header can render without a round trip. Every read that
 * DECIDES anything sends the `addressId` and lets the backend resolve the point
 * again, because a zone edit can change what that point means between now and
 * the next request. If the address later becomes unusable, the feed says so
 * rather than silently falling back to these (see `getFeed`).
 *
 * ── An unserviceable address may still be selected ─────────────────────────
 *
 * Deliberately. "Not launched here yet" and "paused right now" are temporary,
 * and the feed's job is to explain that for the chosen address — refusing the
 * selection here would leave the customer unable to even ask.
 */

export async function POST(req: NextRequest) {
  let payload: { addressId?: unknown }
  try {
    payload = (await req.json()) as { addressId?: unknown }
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }

  const addressId = typeof payload.addressId === "string" ? payload.addressId.trim() : ""
  if (!addressId) {
    return envelopeReject(400, "ADDRESS_REQUIRED", "Choose an address to deliver to.")
  }

  let session: CustomerSessionData
  try {
    session = await backendFetch<CustomerSessionData>("/api/customer/v1/auth/session")
  } catch (err) {
    return envelopeError(err)
  }

  const address = session.addresses.find((row) => row.id === addressId)
  /* Not theirs, or gone. 404 either way — an opaque id must not be probeable. */
  if (!address) {
    return envelopeReject(404, "ADDRESS_NOT_FOUND", "We couldn't find that address.")
  }

  const { serviceability } = address

  const stored: StoredLocation = {
    addressId : address.id,
    latitude  : address.latitude,
    longitude : address.longitude,
    /* The customer's own name for the place when they gave one — it is what
     * they will recognise in the header. Otherwise the resolved area, which is
     * already customer-facing copy. */
    label     : address.label
      ?? (serviceability.zoneName && serviceability.cityName
        ? `${serviceability.zoneName}, ${serviceability.cityName}`
        : serviceability.cityName ?? address.addressLine1),
    ...(serviceability.cityId    ? { cityId   : serviceability.cityId }    : {}),
    ...(serviceability.citySlug  ? { citySlug : serviceability.citySlug }  : {}),
    ...(serviceability.cityName  ? { cityName : serviceability.cityName }  : {}),
    ...(serviceability.countryId ? { countryId: serviceability.countryId } : {}),
  }

  /* The verdict is RETURNED, never stored — coverage changes when an admin
   * edits a zone, and a cached answer would start contradicting the pages
   * rendered from it. */
  const res = NextResponse.json({ status: "success", data: { serviceability } })

  res.cookies.set(LOCATION_COOKIE, serializeLocation(stored), {
    maxAge  : LOCATION_COOKIE_MAX_AGE,
    path    : "/",
    sameSite: "lax",
    secure  : process.env.NODE_ENV === "production",
    /* Not httpOnly, same as the anonymous point: the navbar chip reads the
     * label in the browser. Nothing secret is in it. */
    httpOnly: false,
  })

  return res
}

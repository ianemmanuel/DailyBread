import { NextResponse, type NextRequest } from "next/server"
import type { Serviceability } from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { envelopeError, envelopeReject } from "@/lib/api/proxy"
import {
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE,
  serializeLocation,
  type StoredLocation,
} from "@/lib/location/cookie"

/*
 * POST /api/location — "I am here."
 *
 * The one write the anonymous storefront has. It does three things in a single
 * round trip, which is why it is a route handler rather than two calls:
 *
 *   1. asks the BACKEND whether the point is serviceable,
 *   2. writes the location cookie,
 *   3. hands the verdict back, so the picker can say "we are not there yet"
 *      in place, or send the visitor to that city's page.
 *
 * ── The verdict is returned, never stored ──────────────────────────────────
 *
 * Coverage changes when an admin edits a zone. A verdict cached in the cookie
 * would go quietly stale and start contradicting the pages rendered from it,
 * so the cookie carries a POINT and some labels and nothing else. Every read
 * re-resolves (principle 1).
 *
 * ── The cookie is written from the BACKEND's answer ────────────────────────
 *
 * The city name, slug and country come off the serviceability response, not
 * off the request body. A client-supplied label would end up rendered in the
 * header, and a client-supplied countryId would let a visitor ask for another
 * market's promotions. The only thing taken from the caller is the point, and
 * that is range-checked here and again by the backend.
 */

interface LocationRequest {
  latitude ?: unknown
  longitude?: unknown
}

export async function POST(req: NextRequest) {
  let payload: LocationRequest
  try {
    payload = (await req.json()) as LocationRequest
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }

  /* Read field by field, never spread — the same rule the backend controllers
   * follow. There is exactly one thing a caller may set here. */
  const latitude = Number(payload.latitude)
  const longitude = Number(payload.longitude)

  if (
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) {
    return envelopeReject(400, "INVALID_LOCATION", "That does not look like a valid location.")
  }

  let serviceability: Serviceability
  try {
    serviceability = await backendFetch<Serviceability>(
      `/api/customer/v1/discovery/serviceability?latitude=${latitude}&longitude=${longitude}`,
      /* anonymous: the answer depends only on WHERE, so there is no reason to
       * pay for a Clerk lookup we would then ignore. */
      { anonymous: true },
    )
  } catch (err) {
    return envelopeError(err)
  }

  const stored: StoredLocation = {
    latitude,
    longitude,
    /* Derived from what the backend resolved. "Westlands, Nairobi" when both
     * are known, the city alone when the point is in no zone, and a neutral
     * label when it landed outside every market. */
    label: serviceability.zoneName && serviceability.cityName
      ? `${serviceability.zoneName}, ${serviceability.cityName}`
      : serviceability.cityName ?? "Your location",
    ...(serviceability.cityId    ? { cityId   : serviceability.cityId }    : {}),
    ...(serviceability.citySlug  ? { citySlug : serviceability.citySlug }  : {}),
    ...(serviceability.cityName  ? { cityName : serviceability.cityName }  : {}),
    ...(serviceability.countryId ? { countryId: serviceability.countryId } : {}),
  }

  const res = NextResponse.json({ status: "success", data: { serviceability } })

  res.cookies.set(LOCATION_COOKIE, serializeLocation(stored), {
    maxAge  : LOCATION_COOKIE_MAX_AGE,
    path    : "/",
    sameSite: "lax",
    secure  : process.env.NODE_ENV === "production",
    /* Deliberately NOT httpOnly: the picker reads it to show the current choice
     * without a round trip. Nothing secret lives here — it is a point and some
     * labels, and the backend re-resolves what they mean on every request. */
    httpOnly: false,
  })

  return res
}

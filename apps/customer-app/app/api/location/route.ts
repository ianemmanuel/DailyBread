import { NextResponse, type NextRequest } from "next/server"
import type { Serviceability } from "@repo/types/customer-app"

import { backendFetch } from "@/lib/api/server"
import { envelopeError, envelopeReject } from "@/lib/api/proxy"
import {
  COOKIE_OPTIONS, DELIVERY_COOKIE, parseDeliveryCookie, serializeDeliveryCookie, withChoice,
} from "@/lib/location/cookie"

/*
 * POST /api/location — a PIN placed on the location page's map.
 *
 * Checks coverage and records the pin as the delivery point for the market
 * the BACKEND resolved it into, in one round trip. The market key comes from
 * the backend's answer, never from the page: someone on the Nairobi map who
 * drops a pin in Mombasa has chosen a Mombasa delivery point, and the page
 * says so and offers the switch.
 *
 * A point inside no operating city is answered but not stored — there is no
 * market to attach it to, and nothing could ever be delivered there.
 *
 * The verdict itself is never stored: coverage changes when an admin edits a
 * zone, so every read re-resolves it.
 */
export async function POST(req: NextRequest) {
  let payload: { latitude?: unknown; longitude?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }

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
      { anonymous: true },
    )
  } catch (err) {
    return envelopeError(err)
  }

  const res = NextResponse.json({ status: "success", data: { serviceability } })
  if (!serviceability.citySlug) return res

  const label = serviceability.zoneName && serviceability.cityName
    ? `${serviceability.zoneName}, ${serviceability.cityName}`
    /* No named area: never label the point with the bare city name, which
     * would read "we can't deliver to Nairobi" about a city we serve. */
    : `your pinned spot in ${serviceability.cityName ?? "this city"}`

  const cookie = withChoice(
    parseDeliveryCookie(req.cookies.get(DELIVERY_COOKIE)?.value),
    serviceability.citySlug,
    { mode: "deliver", target: { kind: "pin", latitude, longitude, label } },
  )
  res.cookies.set(DELIVERY_COOKIE, serializeDeliveryCookie(cookie), COOKIE_OPTIONS)
  return res
}

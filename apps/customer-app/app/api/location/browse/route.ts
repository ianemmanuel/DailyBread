import { NextResponse, type NextRequest } from "next/server"

import { envelopeReject } from "@/lib/api/proxy"
import {
  COOKIE_OPTIONS, DELIVERY_COOKIE, isCitySlug, parseDeliveryCookie, serializeDeliveryCookie, withChoice,
} from "@/lib/location/cookie"

/*
 * POST /api/location/browse — switch ONE market between "browse everything"
 * and "deliver to my point".
 *
 *   { citySlug, browse: true }   browse this city; the delivery target is KEPT
 *   { citySlug, browse: false }  go back to delivering to that kept target
 *
 * A view change, never an account change: no address is deleted, no default
 * moves, and other markets are untouched.
 *
 * Browsing is ALWAYS recorded, even when this device has chosen nothing for
 * the market yet. The old version wrote nothing in that case, so a signed-in
 * customer on a new device — whose city default applies without any cookie —
 * pressed "Browse" and stayed exactly where they were.
 *
 * The slug is only shape-checked: it keys a view flag in the caller's own
 * cookie and decides nothing about geography, so an unknown one is inert.
 */
export async function POST(req: NextRequest) {
  let payload: { citySlug?: unknown; browse?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }

  if (!isCitySlug(payload.citySlug)) {
    return envelopeReject(400, "INVALID_CITY", "That is not a city we can browse.")
  }
  const citySlug = payload.citySlug
  const browse = payload.browse !== false

  const cookie = parseDeliveryCookie(req.cookies.get(DELIVERY_COOKIE)?.value)
  const kept = cookie.markets[citySlug]?.target ?? null

  let next
  if (browse) {
    next = withChoice(cookie, citySlug, { mode: "browse", target: kept })
  } else if (kept) {
    next = withChoice(cookie, citySlug, { mode: "deliver", target: kept })
  } else {
    /* Back to delivery with nothing remembered on this device: drop the entry
     * and the city's default address applies again. */
    const { [citySlug]: _dropped, ...rest } = cookie.markets
    next = { v: 2 as const, markets: rest }
  }

  const res = NextResponse.json({ status: "success", data: { browsing: browse } })
  res.cookies.set(DELIVERY_COOKIE, serializeDeliveryCookie(next), COOKIE_OPTIONS)
  return res
}

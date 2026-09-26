import { NextResponse, type NextRequest } from "next/server"
import type { CustomerMarketsResult } from "@repo/types/customer-app"

import { backendFetch, BackendApiError, isSignedIn } from "@/lib/api/server"
import { envelopeError, envelopeReject } from "@/lib/api/proxy"
import { findMarketCity } from "@/lib/data/markets"
import {
  COOKIE_OPTIONS, LAST_MARKET_COOKIE, isCitySlug, serializeLastMarket,
} from "@/lib/location/cookie"

/*
 * POST /api/markets/select — "I am in this city now".
 *
 *   { citySlug }                   remember it on this device, and — signed in —
 *                                  record it as one of the customer's cities
 *   { citySlug, isDefault: true }  also make it the default city (signed in)
 *
 * Called by the market layout when a customer ARRIVES in a market (only when
 * this device's last market differs, so it is one write per switch, not one
 * per page), and by "Make default city" on the account page.
 *
 * The slug is checked against the operating markets before anything is
 * written, which is also where the display name for the cookie comes from —
 * the request never names a city, it only picks one we listed.
 *
 * Recording on the account is BEST-EFFORT for a plain selection: the device
 * cookie is what the navbar and doorways need right now, and a failed
 * backend write must not turn arriving on a page into an error. A default-city
 * request is different — the customer asked for it and is told if it failed.
 */
export async function POST(req: NextRequest) {
  let payload: { citySlug?: unknown; isDefault?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return envelopeReject(400, "INVALID_BODY", "That request could not be read.")
  }
  if (!isCitySlug(payload.citySlug)) return envelopeReject(400, "INVALID_CITY", "That is not a city we list.")
  const isDefault = payload.isDefault === true

  const found = await findMarketCity(payload.citySlug)
  if (!found) return envelopeReject(404, "CITY_NOT_FOUND", "We do not deliver in that city.")

  let recorded: CustomerMarketsResult | null = null
  if (await isSignedIn()) {
    try {
      recorded = await backendFetch<CustomerMarketsResult>(
        `/api/customer/v1/markets/${encodeURIComponent(found.city.slug)}`,
        { method: "PUT", body: JSON.stringify({ isDefault }) },
      )
    } catch (err) {
      if (isDefault) return envelopeError(err)
      /* Pending (webhook not landed yet) and every other failure: the device
       * still remembers the city, which is what this call is mostly for. */
      if (!(err instanceof BackendApiError && err.code === "CUSTOMER_ACCOUNT_PENDING")) {
        console.error("[markets/select] Could not record the city on the account.", err)
      }
    }
  } else if (isDefault) {
    return envelopeReject(401, "SIGN_IN_REQUIRED", "Sign in to choose a default city.")
  }

  const res = NextResponse.json({ status: "success", data: { recorded } })
  res.cookies.set(
    LAST_MARKET_COOKIE,
    serializeLastMarket({ slug: found.city.slug, name: found.city.name }),
    COOKIE_OPTIONS,
  )
  return res
}

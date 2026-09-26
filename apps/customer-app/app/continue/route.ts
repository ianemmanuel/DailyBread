import { NextResponse, type NextRequest } from "next/server"

import { COOKIE_OPTIONS, LAST_MARKET_COOKIE, serializeLastMarket } from "@/lib/location/cookie"
import { resolveHomeMarket } from "@/lib/market/home"

/*
 * GET /continue — where signing in lands when the customer was not in the
 * middle of something.
 *
 * The navbar's sign-in buttons send customers who were INSIDE a market
 * straight back to that page; everyone else comes here. Clerk's own
 * `redirect_url` still wins for the in-page auth walls (saving an address),
 * because this is wired as `fallbackRedirectUrl`, never `forceRedirectUrl`.
 *
 *   suspended   → /account, which says so plainly
 *   otherwise   → their HOME market (`resolveHomeMarket`: the account's
 *                 default city, else the market this device was last in —
 *                 the same answer the navbar's "back to your city" chip shows)
 *   nothing     → /city, which asks rather than guesses
 *
 * `pending` (the webhook has not landed) and a failed account read fall
 * through to the device's market — someone who just signed in successfully
 * must never be shown a failure.
 *
 * A route handler rather than a page so it can SET the device's last-market
 * cookie on the redirect. It never writes the delivery cookie: which address a
 * market delivers to is resolved on the market page from the per-city default.
 */
export async function GET(req: NextRequest) {
  const { home, suspended } = await resolveHomeMarket()
  if (suspended) return NextResponse.redirect(new URL("/account", req.url))
  if (!home) return NextResponse.redirect(new URL("/city", req.url))

  const res = NextResponse.redirect(new URL(`/city/${home.slug}`, req.url))
  res.cookies.set(LAST_MARKET_COOKIE, serializeLastMarket(home), COOKIE_OPTIONS)
  return res
}

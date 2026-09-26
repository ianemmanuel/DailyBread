import "server-only"
import { cookies } from "next/headers"

import {
  DELIVERY_COOKIE,
  LAST_MARKET_COOKIE,
  parseDeliveryCookie,
  parseLastMarket,
  type DeliveryCookie,
  type LastMarket,
} from "./cookie"

/*
 * The server's view of the per-device cookies.
 *
 * ── Calling this makes a route DYNAMIC ─────────────────────────────────────
 *
 * `cookies()` is a Dynamic API. Every market route now reads it — through the
 * market layout — because every market page is scoped by the customer's
 * delivery choice. `/`, `/about` and `/city` never do and stay static.
 */
export async function getDeliveryCookie(): Promise<DeliveryCookie> {
  return parseDeliveryCookie((await cookies()).get(DELIVERY_COOKIE)?.value)
}

export async function getLastMarket(): Promise<LastMarket | null> {
  return parseLastMarket((await cookies()).get(LAST_MARKET_COOKIE)?.value)
}

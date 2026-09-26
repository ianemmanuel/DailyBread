import type { HomeMarketResponse } from "@/app/api/markets/home/route"
import { clientFetch } from "@/lib/api/client"

/*
 * The browser's one read of `/api/markets/home`.
 *
 * On `/` both the navbar chip and the "Continue to <city>" card want it; this
 * shares a single request between them. The promise is dropped after a short
 * window so navigating between global pages picks up a changed default city.
 */

const TTL_MS = 15_000
let inflight: { at: number; promise: Promise<HomeMarketResponse> } | null = null

export function fetchHomeMarket(): Promise<HomeMarketResponse> {
  if (inflight && Date.now() - inflight.at < TTL_MS) return inflight.promise
  const promise = clientFetch<HomeMarketResponse>("/api/markets/home")
  inflight = { at: Date.now(), promise }
  promise.catch(() => { inflight = null })
  return promise
}

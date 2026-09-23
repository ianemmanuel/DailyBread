import { env } from "@/env"
import { logger } from "@/lib/pino/logger"

/*
 * Tells the customer storefront that cached content is stale.
 *
 * The storefront renders `/` statically with a timed revalidate, which is what
 * keeps it fast. This is the other half: when an admin actually DOES something,
 * the change should appear at once rather than at the end of a revalidate
 * window. The timed revalidate still handles transitions that have no event
 * behind them — a promotion whose `startsAt` passes at midnight.
 *
 * Lives in the BACKEND rather than in the ERP's proxy routes because the
 * backend is the one place every write goes through. A purge fired from the
 * ERP would be silently missed by anything published from another surface.
 *
 * NEVER THROWS, and never blocks the operation that triggered it. A failed
 * cache purge must not turn a successful publish into an error the admin sees
 * — the content IS published; the storefront is at worst briefly stale, which
 * is precisely the state it would have been in without this call at all. Every
 * failure is logged with enough detail to diagnose.
 */

const log = logger.child({ module: "storefront-revalidate" })

/** Tags the storefront will accept. It keeps its own allowlist; this is the
 *  same set, so a typo here fails fast in the smoke test rather than silently
 *  purging nothing. */
export type StorefrontTag = "hero-promotion"

/** Long enough for a healthy local or in-region call, short enough that a dead
 *  storefront cannot hold an admin request open. */
const TIMEOUT_MS = 3_000

export function isStorefrontRevalidationConfigured(): boolean {
  return Boolean(env.CUSTOMER_APP_URL && env.STOREFRONT_REVALIDATE_SECRET)
}

export async function revalidateStorefront(tag: StorefrontTag): Promise<void> {
  if (!isStorefrontRevalidationConfigured()) {
    /* Debug, not warn: plenty of environments legitimately run without a
     * storefront attached, and this is the documented optional path. */
    log.debug({ tag }, "Storefront revalidation is not configured — skipping")
    return
  }

  const url = `${env.CUSTOMER_APP_URL!.replace(/\/+$/, "")}/api/revalidate`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": env.STOREFRONT_REVALIDATE_SECRET!,
      },
      body: JSON.stringify({ tag }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      log.warn(
        { tag, status: res.status, url },
        "Storefront refused the revalidation — it will refresh on its own schedule instead",
      )
      return
    }

    log.info({ tag }, "Storefront cache purged")
  } catch (err) {
    log.warn(
      { tag, url, err },
      "Could not reach the storefront to purge its cache — it will refresh on its own schedule instead",
    )
  }
}

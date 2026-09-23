import { timingSafeEqual } from "node:crypto"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

/*
 * ON-DEMAND CACHE PURGE — the backend tells the storefront something changed.
 *
 * WHY THIS EXISTS
 *
 * The landing page is a STATIC route with a 5-minute revalidate, which is what
 * makes it fast: a visitor is served pre-rendered HTML, not a render that waits
 * on an API call. The cost of that is staleness — an admin who publishes a
 * promotion would wait up to five minutes to see it, which is a genuinely poor
 * authoring experience even though nothing is slow.
 *
 * This endpoint removes the wait WITHOUT giving up the static render: the
 * backend calls it the moment a promotion is published, withdrawn, or edited
 * while live, and the next request re-renders with the new content.
 *
 * THE TIMED REVALIDATE STAYS, and is not redundant. A promotion can become
 * live or expire with NO request and no publish event at all — that is exactly
 * what `startsAt` and `endsAt` do. Nothing fires a webhook at midnight when a
 * campaign's window opens, so the periodic revalidate is what catches
 * time-based transitions. The two mechanisms cover different things:
 *
 *   on-demand  -> somebody DID something      (instant, event-driven)
 *   timed      -> the CLOCK passed a boundary (bounded lag, no event exists)
 *
 * WHY NOT `revalidateTag` FROM THE ERP
 *
 * `revalidateTag` only reaches the cache of the process that calls it. The ERP
 * is a different Next application in a different process, so its own
 * `revalidateTag("hero-promotions")` purges its list view and can never touch
 * this app. Crossing that boundary needs an HTTP call, which is this route.
 *
 * Driven by the BACKEND rather than the ERP because the backend is the only
 * place that sees every write. An ERP-driven purge would silently miss
 * anything published by another surface later.
 */

/*
 * An ALLOWLIST, not a free-form tag. Without it this is a "purge any cache key
 * you can name" endpoint, and a caller who learned a tag name could force
 * repeated re-renders of any page. Adding a tag here is a deliberate act.
 */
const PURGEABLE_TAGS = new Set(["hero-promotion"])

const SECRET = process.env.STOREFRONT_REVALIDATE_SECRET

/**
 * Constant-time compare that does not leak length.
 *
 * `timingSafeEqual` throws when the buffers differ in size, and the naive
 * length check that avoids the throw is itself an oracle for the secret's
 * length. Comparing fixed-size digests sidesteps both.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    /* Still do a comparison so the work is the same either way, then fail. */
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  /*
   * FAILS CLOSED. An unset secret makes this an open endpoint that anyone can
   * use to force the storefront to re-render on demand — a cheap way to push
   * load onto the backend. Refusing loudly is the safe default; the value is
   * documented in .env.
   */
  if (!SECRET) {
    console.error("[revalidate] STOREFRONT_REVALIDATE_SECRET is not set — refusing.")
    return NextResponse.json({ message: "Revalidation is not configured" }, { status: 503 })
  }

  const provided = req.headers.get("x-revalidate-secret")
  if (!provided || !secretMatches(provided, SECRET)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  let tag: unknown
  try {
    tag = (await req.json())?.tag
  } catch {
    return NextResponse.json({ message: "Expected a JSON body" }, { status: 400 })
  }

  if (typeof tag !== "string" || !PURGEABLE_TAGS.has(tag)) {
    return NextResponse.json({ message: "Unknown tag" }, { status: 400 })
  }

  revalidateTag(tag, {})

  return NextResponse.json({ revalidated: tag })
}

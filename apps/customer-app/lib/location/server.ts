import "server-only"
import { cookies } from "next/headers"

import { LOCATION_COOKIE, parseLocation, type StoredLocation } from "./cookie"

/*
 * The server's view of the stored location.
 *
 * Split from cookie.ts so the PARSER can be shared with the browser without
 * dragging `next/headers` into client JS — the picker reads the same cookie to
 * show the current choice, and one parser means the two sides cannot disagree
 * about what a malformed value means.
 *
 * ── Calling this makes a route DYNAMIC ─────────────────────────────────────
 *
 * `cookies()` is a Dynamic API: any route whose render reaches this goes from
 * `○` to `ƒ` in the build output, and so does every route sharing a layout
 * that calls it. That is why neither `/` nor `/city/[citySlug]` touches this —
 * both are meant to stay static and cacheable, and both are correct without a
 * location. Verify with the build output, not by inspection.
 */
export async function getStoredLocation(): Promise<StoredLocation | null> {
  return parseLocation((await cookies()).get(LOCATION_COOKIE)?.value)
}

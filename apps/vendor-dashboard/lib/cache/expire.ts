import "server-only"
import { revalidateTag } from "next/cache"

/*
 * Invalidate tagged server reads so the vendor's NEXT render sees their write.
 *
 * `revalidateTag(tag, "default")` — what every route here used to call — does
 * NOT do that in Next 16. A named profile marks the tag STALE and leaves its
 * `expire` at the profile's value (INFINITE for "default"), and a stale entry
 * is served once more while it revalidates in the background. So the
 * `router.refresh()` that follows a successful save rendered the data from
 * before the save. Verified in next@16.1.0:
 *   revalidation-utils.js  revalidateTags → profile object becomes `durations`
 *   file-system-cache.js   revalidateTag  → expired = now + expire * 1000
 *   tags-manifest          areTagsExpired → an expired tag is a cache MISS
 *
 * `{ expire: 0 }` is the immediate form, and it is the one a Route Handler may
 * use: `updateTag` (the Server Action equivalent) throws outside an action.
 * `lib/cache/expire.test.ts` pins these semantics against Next's own code.
 */
export const EXPIRE_NOW = { expire: 0 } as const

export function expireTags(...tags: string[]): void {
  for (const tag of tags) revalidateTag(tag, EXPIRE_NOW)
}

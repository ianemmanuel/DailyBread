import { assertKeyUnderPrefix } from "@/lib/images/publicImage"
import type { SquareCropSpec } from "@/lib/images/transform"

/*
 * Cuisine imagery — the key shapes and the crop. Pure: no I/O, no Prisma.
 *
 * ── THE CROP ───────────────────────────────────────────────────────────────
 *
 * A cuisine tile is a small circle in a row — 64 CSS px on a phone, 72 on a
 * tablet. Stored pixels = the widest size it will ever be rendered at x2.
 *
 * 512 rather than the ~150 that today's tile strictly needs, because this is a
 * MASTER that `next/image` resizes and re-encodes per width: storing exactly
 * the current tile size would mean re-uploading every picture the first time
 * the design shows a cuisine larger — on a cuisine landing page, say. 512
 * square in WebP is ~30-60 KB, so the headroom is nearly free.
 *
 * Quality 80 rather than the hero's 82: at this size the difference is
 * invisible and the files are already small.
 *
 * Note that `normaliseSquareImage` still refuses a source whose shortest edge
 * is under MIN_SOURCE_EDGE (900px) even though the output is 512. That is
 * deliberate and shared — it keeps someone from uploading a thumbnail they
 * found and calling it done.
 */
export const CUISINE_CROP: SquareCropSpec = { edge: 512, quality: 80 }

/** Where the admin's untouched upload lands. PRIVATE bucket, never served.
 *  Kept after processing so the crop can be redone without re-uploading. */
export const CUISINE_ORIGINAL_PREFIX = "catalog/cuisine-originals"

/** Where the processed square lands. PUBLIC bucket. Only ever bytes this
 *  server produced. */
export const CUISINE_PUBLIC_PREFIX = "catalog/cuisine"

/*
 * The prefix guards. The RULE lives in lib/images/publicImage.ts and is shared
 * with the hero — it is a security control, and two copies of a security
 * control is one copy that will not get the next fix. These wrappers exist so
 * the prefix can never be supplied by a caller: cuisine code can only ever
 * assert cuisine keys, and "process this key" can never be turned into
 * "copy that payout proof into the public bucket".
 */
export function assertCuisineOriginalKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, CUISINE_ORIGINAL_PREFIX)
}

export function assertCuisinePublicKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, CUISINE_PUBLIC_PREFIX)
}

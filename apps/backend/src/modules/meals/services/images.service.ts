import type { Prisma } from "@repo/db"
import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import { processPublicBoundedImage } from "@/lib/images/publicImage"
import { DISH_PHOTO_SPEC } from "@/lib/images/transform"
import { MAX_IMAGE_SIZE_BYTES } from "@/lib/images/uploadType"
import {
  MEAL_PUBLIC_PREFIX, mealUploadPrefix, originalKeyForStaged,
} from "../lib/images.rules"

/*
 * Dish photographs: turning a staged upload into a saved image, and back into
 * nothing when it is removed.
 *
 * The ORDER is the design, because processing is external I/O and must never
 * sit inside a database transaction:
 *
 *   1. publishStagedImages   — before the transaction. Each staged upload is
 *                              size-checked, decoded, re-encoded and published,
 *                              and its original copied to the permanent prefix.
 *                              Any failure unwinds what THIS call published and
 *                              the save is refused with nothing changed.
 *   2. writeImageRows        — inside the transaction, rows only.
 *   3. after commit           — removed images' objects and the consumed staging
 *                              uploads are deleted, best-effort. A failure there
 *                              leaves an orphan, never a broken dish.
 *   If the transaction itself fails, discardPublished undoes step 1.
 *
 * No distributed rollback: an occasional orphan object is the accepted cost,
 * and the staging prefix expires on its own (an R2 lifecycle rule).
 */

const imageLog = logger.child({ module: "meal-images" })

/** Processed images per request at a time: bounded so six photos cannot pin
 *  six sharp decodes of up to 40MP each at once. */
const PROCESS_CONCURRENCY = 2

export interface PublishedImage {
  stagedKey  : string
  position   : number
  originalKey: string
  imageKey   : string
  width      : number
  height     : number
  blurDataUrl: string
}

/** Reasons the upload ITSELF is unacceptable — the staged object is useless
 *  and is removed at once rather than left for the lifecycle rule. */
const REJECTED_UPLOAD_CODES = new Set([
  "FILE_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "IMAGE_TOO_SMALL", "IMAGE_TOO_LARGE", "EMPTY_FILE",
])

async function publishOne(vendorId: string, stagedKey: string, position: number): Promise<PublishedImage> {
  let processed
  try {
    processed = await processPublicBoundedImage({
      sourceKey   : stagedKey,
      sourcePrefix: mealUploadPrefix(vendorId),
      publicPrefix: MEAL_PUBLIC_PREFIX,
      spec        : DISH_PHOTO_SPEC,
      maxBytes    : MAX_IMAGE_SIZE_BYTES,
    })
  } catch (err) {
    if (err instanceof ApiError && err.code && REJECTED_UPLOAD_CODES.has(err.code)) {
      await R2Service.deleteObject(stagedKey).catch(() => undefined)
    }
    throw err
  }

  // The original is kept (privately) so a future master size or crop can be
  // produced without asking the vendor again. A server-side copy: the bytes
  // never leave R2.
  const originalKey = originalKeyForStaged(stagedKey, vendorId)
  try {
    await R2Service.copyObject(stagedKey, originalKey)
  } catch (err) {
    await publicMediaStorage.delete(processed.imageKey).catch(() => undefined)
    throw err
  }

  return { stagedKey, position, originalKey, ...processed }
}

/** Step 1. All or nothing: if any image fails, every image this call already
 *  published is removed before the error is rethrown. */
export async function publishStagedImages(
  vendorId: string,
  staged  : ReadonlyArray<{ stagedKey: string; position: number }>,
): Promise<PublishedImage[]> {
  const published: PublishedImage[] = []
  for (let i = 0; i < staged.length; i += PROCESS_CONCURRENCY) {
    const batch = staged.slice(i, i + PROCESS_CONCURRENCY)
    const results = await Promise.allSettled(batch.map((s) => publishOne(vendorId, s.stagedKey, s.position)))
    for (const r of results) if (r.status === "fulfilled") published.push(r.value)
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected")
    if (failed) {
      await discardPublished(published)
      throw failed.reason
    }
  }
  return published
}

/** Undo step 1 when the database write that would have referenced these
 *  images did not happen. Best-effort. */
export async function discardPublished(published: readonly PublishedImage[]): Promise<void> {
  await deleteImageObjects(published)
}

/** Deletes an image's two permanent objects. Best-effort: a failure leaves an
 *  orphan for later cleanup and never fails a save that already committed. */
export async function deleteImageObjects(
  images: ReadonlyArray<{ originalKey: string; imageKey: string }>,
): Promise<void> {
  await Promise.all(images.flatMap((image) => [
    publicMediaStorage.delete(image.imageKey).catch((err) =>
      imageLog.warn({ err, key: image.imageKey }, "Failed to delete a meal image master")),
    R2Service.deleteObject(image.originalKey).catch((err) =>
      imageLog.warn({ err, key: image.originalKey }, "Failed to delete a meal image original")),
  ]))
}

/** Staging uploads a save has consumed. Best-effort — the lifecycle rule on
 *  the staging prefix removes anything this misses. */
export async function clearStaged(published: readonly PublishedImage[]): Promise<void> {
  await Promise.all(published.map((p) =>
    R2Service.deleteObject(p.stagedKey).catch((err) =>
      imageLog.warn({ err, key: p.stagedKey }, "Failed to clear a consumed meal upload"))))
}

/**
 * Step 2 — the rows, inside the caller's transaction.
 *
 * Positions are unique per dish, so a reorder cannot move rows straight to
 * their new positions (swapping 0 and 1 would collide half way). Kept rows are
 * parked on negative positions first, then placed; new rows are created last,
 * at positions nothing else holds by then.
 */
export async function writeImageRows(
  tx        : Prisma.TransactionClient,
  menuItemId: string,
  change    : {
    removedIds: readonly string[]
    keep      : ReadonlyArray<{ id: string; position: number }>
    published : readonly PublishedImage[]
  },
): Promise<void> {
  if (change.removedIds.length > 0) {
    await tx.menuItemImage.deleteMany({ where: { id: { in: [...change.removedIds] }, menuItemId } })
  }
  for (const [i, k] of change.keep.entries()) {
    await tx.menuItemImage.update({ where: { id: k.id }, data: { position: -1 - i } })
  }
  for (const k of change.keep) {
    await tx.menuItemImage.update({ where: { id: k.id }, data: { position: k.position } })
  }
  if (change.published.length > 0) {
    await tx.menuItemImage.createMany({
      data: change.published.map((p) => ({
        menuItemId,
        position   : p.position,
        originalKey: p.originalKey,
        imageKey   : p.imageKey,
        width      : p.width,
        height     : p.height,
        blurDataUrl: p.blurDataUrl,
      })),
    })
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** The select every reader uses: the master and what it needs to render. */
export const IMAGE_SELECT = {
  orderBy: { position: "asc" },
  select : { originalKey: true, imageKey: true, width: true, height: true, blurDataUrl: true },
} as const

export interface MealImageView {
  url        : string
  width      : number
  height     : number
  blurDataUrl: string
}

let warnedUnconfigured = false

/**
 * The public, stable URL for a master — never a signed one. Degrades to null
 * (and logs why, once) if the public bucket is not configured, rather than
 * failing a read over a deployment concern — the same stance hero promotions
 * take.
 */
export function mealImageUrl(imageKey: string): string | null {
  try {
    return publicMediaStorage.publicUrl(imageKey)
  } catch (err) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true
      imageLog.warn({ err }, "Public media is not configured — meal images render without a URL")
    }
    return null
  }
}

export function presentMealImage(
  image: { imageKey: string; width: number; height: number; blurDataUrl: string },
): MealImageView | null {
  const url = mealImageUrl(image.imageKey)
  return url ? { url, width: image.width, height: image.height, blurDataUrl: image.blurDataUrl } : null
}

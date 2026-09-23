import { ApiError } from "@/errors/ApiError"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import { publicMediaStorage } from "@/lib/storage/publicMedia.storage"
import {
  ImageRejected,
  normaliseSquareImage,
  type SquareCropSpec,
} from "./transform"

/*
 * The upload → sanitise → publish pipeline, once, for any square public image.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The hero promotion built this flow first. Cuisine tiles need exactly the
 * same one at a different size, and the MODULARITY note in CLAUDE.md names
 * this as the moment to generalise rather than copy: the key guard in
 * particular is a security control, and two copies of a security control is
 * one copy that will not get the next fix.
 *
 * What is generic: the two-bucket round trip, the key shapes, the prefix
 * guard, the re-encode, the blur placeholder, the best-effort cleanup.
 * What stays with each caller: its PREFIXES and its CROP — a hero is a 1600px
 * square behind text, a cuisine tile is a small thumbnail in a grid, and
 * neither should be able to write into the other's namespace.
 *
 * ── The two buckets ────────────────────────────────────────────────────────
 *
 *   ORIGINAL  → private bucket. The admin's untouched upload, kept so a crop
 *               can be redone without asking them to upload again. Never
 *               served.
 *   PUBLIC    → public bucket. Only ever bytes THIS server produced, uuid
 *               named and cached for a year.
 */

const imageLog = logger.child({ module: "public-image" })

/**
 * Proves a key is one of ours before anything is done with it.
 *
 * Without this, "process this key" and "delete this key" are
 * read-anything and delete-anything primitives — a caller could pass a payout
 * proof's key and have its contents copied into the PUBLIC bucket. That is the
 * worst outcome available here, so the check is exact: the expected prefix,
 * exactly one path segment after it, no traversal, and no prefix collision
 * (`marketing/hero` must not match `marketing/hero-originals`).
 */
export function assertKeyUnderPrefix(storageKey: unknown, prefix: string): string {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new ApiError(400, "storageKey is required", "MISSING_FIELDS")
  }
  if (storageKey.includes("..") || storageKey.includes("//")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  const expected = `${prefix}/`
  if (!storageKey.startsWith(expected)) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  /* Exactly one segment after the prefix. A nested path is not something any
   * caller here ever produces. */
  const rest = storageKey.slice(expected.length)
  if (!rest || rest.includes("/")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  return storageKey
}

/**
 * The private key an admin uploads their original to.
 *
 * `<prefix>/<uuid>.<ext>` — no admin id in the path. For vendor uploads the
 * owner segment is what proves a key belongs to the caller; this is platform
 * content with no per-admin ownership, so the guard is the permission plus the
 * prefix check, not the path.
 */
export function buildOriginalKey(prefix: string, extension: string): string {
  const ext = extension.replace(/^\.+/, "")
  return `${prefix}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
}

/**
 * The public key for a processed square.
 *
 * A fresh uuid per processed image, never a name derived from the row's id.
 * That is what makes the object IMMUTABLE: replacing an image writes a NEW
 * key, so the year-long cache header is safe and no CDN purge is ever needed.
 * It also leaves the old object there to be deleted deliberately rather than
 * overwritten out from under a cached page.
 */
export function buildPublicKey(prefix: string): string {
  return `${prefix}/${crypto.randomUUID()}.webp`
}

/**
 * Hands back a presigned PUT for the admin's ORIGINAL, into the private bucket.
 *
 * The browser uploads straight to storage, so the file never passes through
 * this process. The declared content type decides the key's extension and
 * nothing else — the bytes are re-read and verified at processing time,
 * because a declared type is only a claim.
 */
export async function presignOriginalUpload(input: {
  prefix: string
  contentType: string
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const extension = input.contentType.split("/")[1] ?? "bin"
  const storageKey = buildOriginalKey(input.prefix, extension === "jpeg" ? "jpg" : extension)
  const uploadUrl = await R2Service.generateUploadUrl(storageKey, input.contentType)
  return { uploadUrl, storageKey }
}

export interface ProcessedImage {
  imageKey: string
  imageWidth: number
  imageHeight: number
  imageBlurDataUrl: string
  originalImageKey: string
}

/**
 * Fetches the original, re-encodes it, and publishes the derivative.
 *
 * RE-ENCODING IS THE SANITISER — see transform.ts. Nothing a user uploaded
 * reaches the public bucket byte for byte.
 *
 * Synchronous on purpose: there is no queue in this project, this takes a
 * second or two for one image, and an admin gets a finished record instead of
 * a pending state to poll. Add a queue when thousands of vendor photos need
 * one, not for a handful of admin uploads.
 */
export async function processPublicSquareImage(input: {
  originalKey: string
  /** The prefix the original MUST sit under. The guard, not a hint. */
  originalPrefix: string
  /** Where the derivative is published. */
  publicPrefix: string
  crop: SquareCropSpec
}): Promise<ProcessedImage> {
  publicMediaStorage.assertConfigured()
  assertKeyUnderPrefix(input.originalKey, input.originalPrefix)

  let original: Buffer
  try {
    original = await R2Service.getObjectBuffer(input.originalKey)
  } catch {
    throw new ApiError(
      400,
      "That upload could not be found. Try uploading the image again.",
      "UPLOAD_NOT_FOUND",
    )
  }

  let derived
  try {
    derived = await normaliseSquareImage(original, input.crop)
  } catch (err) {
    /* Surface WHICH rule the image broke — "too small", "not an image" — so
     * the admin can fix it, rather than a generic failure. */
    if (err instanceof ImageRejected) throw new ApiError(400, err.message, err.code)
    throw err
  }

  const publicKey = buildPublicKey(input.publicPrefix)
  await publicMediaStorage.put(publicKey, derived.buffer, derived.contentType)

  return {
    imageKey: publicKey,
    imageWidth: derived.width,
    imageHeight: derived.height,
    imageBlurDataUrl: derived.blurDataUrl,
    originalImageKey: input.originalKey,
  }
}

/** Best-effort cleanup of an image a row no longer points at. A failure here
 *  must never fail the admin's save — the row is already correct, and the
 *  worst case is one orphaned object. */
export async function discardPublicImage(imageKey: string | null, context: string): Promise<void> {
  if (!imageKey) return
  try {
    await publicMediaStorage.delete(imageKey)
  } catch (err) {
    imageLog.warn({ err, imageKey, context }, "Could not delete a replaced public image")
  }
}

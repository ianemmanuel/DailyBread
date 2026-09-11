import { ApiError } from "@/middleware/error"

/*
 * Vendor public-profile media rules. Pure — no I/O, no Prisma — so the
 * validation and the key-ownership check are unit-testable on their own, same
 * convention as vendor.payoutProof.ts's decideProofRequirement and
 * vendor.placement.ts.
 *
 * The images live in the same private R2 bucket as every document, so what is
 * stored on VendorProfile is a storage KEY and what leaves the server is a
 * short-lived signed URL. The columns are named ...StorageKey precisely so
 * nobody renders one into an <img src> and gets a 403.
 */

/*
 * A logo and a cover, and nothing else. The photo gallery that briefly lived
 * here was removed: it advertises a physical venue, which a delivery-only
 * marketplace has no reason to publish, and for a cloud kitchen it discloses
 * something the vendor may not have intended. Uber Eats, DoorDash and Bolt
 * Food all stop at these two for the same reason.
 */
export const PROFILE_MEDIA_KINDS = ["logo", "cover"] as const
export type ProfileMediaKind = (typeof PROFILE_MEDIA_KINDS)[number]

/*
 * Images only — deliberately narrower than the document pipeline's
 * ALLOWED_MIME_TYPES, which also accepts PDF. A PDF logo is never what a
 * vendor meant, and it would render as a broken image to every customer.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

/** Smaller than the 10MB document ceiling: these are display images that get
 *  downloaded by every customer viewing the profile, not archival evidence. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png" : "png",
  "image/webp": "webp",
}

export function isProfileMediaKind(value: unknown): value is ProfileMediaKind {
  return typeof value === "string" && (PROFILE_MEDIA_KINDS as readonly string[]).includes(value)
}

/**
 * Validates an upload request and returns the file extension to key it under.
 * The extension comes from the MIME type, never from the supplied filename —
 * a filename is attacker-controlled and would otherwise decide part of the key.
 */
export function resolveImageExtension(contentType: string, fileSize: number): string {
  const ext = EXTENSION_BY_MIME[contentType]
  if (!ext) {
    throw new ApiError(
      400,
      "Unsupported image type — upload a JPEG, PNG or WebP.",
      "UNSUPPORTED_MEDIA_TYPE",
    )
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new ApiError(400, "fileSize is required", "MISSING_FIELDS")
  }
  if (fileSize > MAX_IMAGE_SIZE_BYTES) {
    throw new ApiError(400, "Image is too large — the maximum size is 5MB.", "FILE_TOO_LARGE")
  }
  return ext
}

/**
 * Proves a storage key belongs to this vendor before anything is done with it.
 *
 * This is the whole security model of the discard endpoint. Without it,
 * "delete this key" is a delete-anything primitive: a vendor could pass
 * another vendor's logo key, or a payout proof, or an application document.
 * The key must match the exact prefix `generateProfileMediaKey` produces for
 * THIS vendor, with a single path segment after it and no traversal.
 */
export function assertOwnedProfileMediaKey(storageKey: unknown, vendorId: string): string {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new ApiError(400, "storageKey is required", "MISSING_FIELDS")
  }
  if (storageKey.includes("..") || storageKey.includes("//")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  const parts = storageKey.split("/")
  const [root, kind, keyVendorId, filename, ...rest] = parts

  if (
    root !== "profile-media" ||
    !isProfileMediaKind(kind) ||
    keyVendorId !== vendorId ||
    !filename ||
    rest.length > 0
  ) {
    throw new ApiError(403, "That file does not belong to your profile", "FORBIDDEN")
  }

  return storageKey
}

/**
 * The keys a saved profile currently points at. Used to decide whether a
 * discard request is removing a not-yet-saved upload (safe to delete) or one
 * the live profile still renders (must not be deleted out from under it).
 */
export function currentProfileKeys(profile: {
  logoStorageKey : string | null
  coverStorageKey: string | null
} | null): Set<string> {
  if (!profile) return new Set()
  return new Set(
    [profile.logoStorageKey, profile.coverStorageKey].filter((k): k is string => !!k),
  )
}

/** A single optional key (logo / cover), or null when the vendor cleared it. */
export function normalizeSingleKey(key: unknown, vendorId: string): string | null {
  if (key === undefined || key === null || key === "") return null
  return assertOwnedProfileMediaKey(key, vendorId)
}

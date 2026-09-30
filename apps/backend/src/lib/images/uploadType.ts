import { ApiError } from "@/middleware/error"

/*
 * Which images a vendor may upload for display, and what extension to key one
 * under. Pure.
 *
 * In lib/ because two owners accept display images through the same presign
 * flow — a vendor profile's logo and cover (vendor module) and a dish's
 * photographs (meals module) — and neither may import the other. This is the
 * REQUEST check only; it trusts the declared type and size, which is exactly
 * what the image pipeline will stop doing once it decodes the bytes.
 */

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

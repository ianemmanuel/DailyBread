"use client"

import { uploadToPresignedUrl } from "@/lib/onboarding/upload"
import { clientFetch } from "@/lib/api/client"
import {
  validateImage, releasePreview, ALLOWED_IMAGE_LABEL, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES,
} from "@/lib/profile/media"

/*
 * Meal photography, on the app's one existing upload pipeline: presign → XHR
 * PUT straight to R2 → hold the storage key → submit it with the form. The
 * validation is imported rather than restated — a vendor meets exactly one set
 * of rules about what an image may be, whoever is asking for it.
 */

export { validateImage, releasePreview, ALLOWED_IMAGE_LABEL, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES }

export interface UploadedMealImage {
  storageKey: string
  /** Object URL for instant preview; the signed URL arrives on the next read. */
  previewUrl: string
}

export async function uploadMealImage(
  file      : File,
  onProgress: (percent: number) => void,
): Promise<UploadedMealImage> {
  const { uploadUrl, storageKey } = await clientFetch<{ uploadUrl: string; storageKey: string }>(
    "/api/menu/images/presign",
    { method: "POST", body: JSON.stringify({ contentType: file.type, fileSize: file.size }) },
  )

  await uploadToPresignedUrl(uploadUrl, file, onProgress)

  return { storageKey, previewUrl: URL.createObjectURL(file) }
}

/**
 * Deletes a photo the vendor removed before saving, so an abandoned upload
 * never becomes a file nothing can reach.
 *
 * Best-effort: the vendor's intent is served the moment it leaves the form, and
 * the backend refuses to delete anything a saved meal still points at — which
 * is what stops a stale tab wiping a live photo.
 */
export async function discardMealImage(storageKey: string): Promise<void> {
  try {
    await clientFetch("/api/menu/images", { method: "DELETE", body: JSON.stringify({ storageKey }) })
  } catch {
    // Intentionally silent — see above.
  }
}

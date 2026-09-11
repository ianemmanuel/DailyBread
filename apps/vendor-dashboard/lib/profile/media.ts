"use client"

import { uploadToPresignedUrl } from "@/lib/onboarding/upload"
import { clientFetch } from "@/lib/api/client"
import type { ProfileMediaKind, ProfileMediaPresignResponse } from "@repo/types/vendor-app"

/*
 * Profile image upload, using the app's one existing pipeline verbatim:
 * presign → XHR PUT straight to R2 → hold the storage key → submit it with the
 * form. Identical to the vendor application documents and the payout proof,
 * which is the point — a vendor should not meet a third different upload UX.
 *
 * Mirrors the backend's own limits (vendor.profileMedia.ts). This is UX only;
 * the presign endpoint re-validates and remains authoritative.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

/** Human-readable list for the "JPG, PNG or WebP" hint under each control. */
export const ALLOWED_IMAGE_LABEL = "JPG, PNG or WebP"

export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Unsupported file type — upload a ${ALLOWED_IMAGE_LABEL} image.`
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Image is too large — the maximum size is 5MB."
  }
  return null
}

export interface UploadedImage {
  storageKey: string
  /** Object URL for instant preview — the signed URL only exists after a save. */
  previewUrl: string
}

/**
 * Uploads one image and returns the key to submit.
 *
 * The preview is a local object URL rather than a round trip: the vendor sees
 * their image the moment it finishes uploading, and the server-signed URL
 * arrives with the next profile read. Callers must revokeObjectURL when they
 * discard the result (see releasePreview).
 */
export async function uploadProfileImage(
  kind      : ProfileMediaKind,
  file      : File,
  onProgress: (percent: number) => void,
): Promise<UploadedImage> {
  const { uploadUrl, storageKey } = await clientFetch<ProfileMediaPresignResponse>(
    "/api/profile/media/presign",
    {
      method: "POST",
      body  : JSON.stringify({ kind, contentType: file.type, fileSize: file.size }),
    },
  )

  await uploadToPresignedUrl(uploadUrl, file, onProgress)

  return { storageKey, previewUrl: URL.createObjectURL(file) }
}

/**
 * Deletes an uploaded image the vendor removed before saving, so an abandoned
 * upload doesn't sit in the bucket forever.
 *
 * Best-effort by design: the vendor's intent is served the moment it leaves
 * the form, and the backend refuses to delete anything the saved profile still
 * points at. A failure here must never block them from continuing.
 */
export async function discardProfileImage(storageKey: string): Promise<void> {
  try {
    await clientFetch("/api/profile/media", {
      method: "DELETE",
      body  : JSON.stringify({ storageKey }),
    })
  } catch {
    // Intentionally silent — see above.
  }
}

/** Frees an object URL created by uploadProfileImage. */
export function releasePreview(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url)
}

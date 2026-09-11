import { prisma } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { R2Service } from "@/lib/r2/r2.service"
import {
  assertOwnedProfileMediaKey,
  currentProfileKeys,
  isProfileMediaKind,
  resolveImageExtension,
  type ProfileMediaKind,
} from "./vendor.profileMedia"
import type { ProfileMediaPresignResponse } from "@repo/types/backend"

/*
 * Upload and discard for vendor public-profile images.
 *
 * The flow is the app's existing one, unchanged: presign → the browser PUTs
 * the bytes straight to R2 → the form submits the returned storage key. The
 * backend never handles image bytes, exactly as with application documents and
 * payout proofs.
 *
 * The rules live next door in vendor.profileMedia.ts as pure functions, so the
 * ownership check that makes `discard` safe is unit-testable without a DB.
 */

const serviceLog = logger.child({ module: "vendor-profile-media-service" })

async function assertActiveVendor(vendorId: string) {
  const vendor = await prisma.vendorAccount.findUnique({
    where : { id: vendorId },
    select: { id: true, status: true },
  })
  if (!vendor) throw new ApiError(404, "Vendor account not found", "NOT_FOUND")
  if (vendor.status !== "ACTIVE") throw new ApiError(403, "Your account is not active", "ACCOUNT_INACTIVE")
}

export interface PresignProfileMediaInput {
  kind       : unknown
  contentType: string
  fileSize   : number
}

export async function presignProfileMediaUpload(
  vendorId: string,
  input   : PresignProfileMediaInput,
): Promise<ProfileMediaPresignResponse> {
  await assertActiveVendor(vendorId)

  if (!isProfileMediaKind(input.kind)) {
    throw new ApiError(400, "kind must be one of: logo, cover", "INVALID_MEDIA_KIND")
  }
  const kind: ProfileMediaKind = input.kind

  // Extension comes from the MIME type, never the filename — a filename is
  // client-controlled and would otherwise decide part of the storage key.
  const extension = resolveImageExtension(input.contentType, input.fileSize)
  const storageKey = R2Service.generateProfileMediaKey(kind, vendorId, extension)
  const uploadUrl  = await R2Service.generateUploadUrl(storageKey, input.contentType)

  return { uploadUrl, storageKey }
}

/**
 * Removes an image the vendor discarded before saving.
 *
 * Two guards, both necessary:
 *   1. the key must be under this vendor's own profile-media prefix, so this
 *      can never become a delete-anything endpoint;
 *   2. the key must NOT be one the saved profile still points at — otherwise
 *      a stale tab could delete the live logo out from under the profile,
 *      leaving a row referencing an object that no longer exists.
 *
 * Deleting a key that was never uploaded is a no-op success, so the client can
 * call this without tracking whether the PUT actually completed.
 */
export async function discardProfileMedia(vendorId: string, storageKey: unknown): Promise<void> {
  await assertActiveVendor(vendorId)

  const key = assertOwnedProfileMediaKey(storageKey, vendorId)

  const profile = await prisma.vendorProfile.findUnique({
    where : { vendorAccountId: vendorId },
    select: { logoStorageKey: true, coverStorageKey: true },
  })

  if (currentProfileKeys(profile).has(key)) {
    throw new ApiError(
      409,
      "That image is still part of your saved profile. Remove it and save first.",
      "MEDIA_IN_USE",
    )
  }

  try {
    await R2Service.deleteObject(key)
  } catch (err) {
    // The vendor's intent — "this image is not part of my profile" — is
    // already satisfied, since the key was never saved. A storage hiccup here
    // leaks one object; failing the request would leave the form stuck.
    serviceLog.warn({ err, vendorId, storageKey: key }, "Failed to delete discarded profile media")
  }
}

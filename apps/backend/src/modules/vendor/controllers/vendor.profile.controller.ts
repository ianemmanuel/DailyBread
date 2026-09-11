import { Request, Response, NextFunction } from "express"
import { getVendorAccount } from "@/helpers/auth/vendorAuth"
import { ApiError } from "@/middleware/error"
import { sendSuccess } from "@/helpers/api-response/response"
import {
  getVendorProfile,
  upsertVendorProfile,
  getVendorGoLiveStatus,
  publishVendorProfile,
  unpublishVendorProfile,
} from "../services/vendor.profile.service"
import { presignProfileMediaUpload, discardProfileMedia } from "../services/vendor.profileMedia.service"
import { getVendorFoodTagOptions } from "../services/vendor.foodTags"
import type { UpsertVendorProfileRequest } from "@repo/types/backend"

export const handleGetVendorProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const profile = await getVendorProfile(auth.vendorAccount.id)
    return sendSuccess(res, profile, "Profile fetched")
  } catch (err) { next(err) }
}

export const handleUpsertVendorProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    /*
     * Destructured field-by-field on purpose: a full-form save writing
     * `...req.body` straight through would let a client set any column on the
     * row, including isPublished and the moderation fields. Every new field
     * has to be added here deliberately — the same reason the payout
     * controller's omission of `proofDocument` was a real bug rather than a
     * style issue.
     */
    const {
      displayName, tagline, description, story,
      logoStorageKey, coverStorageKey,
      publicEmail, publicPhone, website, socialLinks,
      primaryCuisineId, cuisineIds, dietaryTagIds, foundedYear,
    } = req.body

    if (!displayName) throw new ApiError(400, "displayName is required", "MISSING_FIELDS")

    const input: UpsertVendorProfileRequest = {
      displayName, tagline, description, story,
      logoStorageKey, coverStorageKey,
      publicEmail, publicPhone, website, socialLinks,
      primaryCuisineId, cuisineIds, dietaryTagIds, foundedYear,
    }

    const profile = await upsertVendorProfile(auth.vendorAccount.id, input)
    return sendSuccess(res, profile, "Profile saved")
  } catch (err) { next(err) }
}

export const handleGetGoLiveStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const status = await getVendorGoLiveStatus(auth.vendorAccount.id)
    return sendSuccess(res, status, "Go-live status fetched")
  } catch (err) { next(err) }
}

export const handlePublishVendorProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const profile = await publishVendorProfile(auth.vendorAccount.id)
    return sendSuccess(res, profile, "You're live!")
  } catch (err) { next(err) }
}

export const handleUnpublishVendorProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const profile = await unpublishVendorProfile(auth.vendorAccount.id)
    return sendSuccess(res, profile, "Profile unpublished")
  } catch (err) { next(err) }
}

//* GET /vendor/v1/profile/food-tags — the cuisines and dietary tags this
//* vendor's country has switched on, plus the selection caps.
export const handleGetVendorFoodTags = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const options = await getVendorFoodTagOptions(auth.vendorAccount.countryId)
    return sendSuccess(res, options, "Food tags fetched")
  } catch (err) { next(err) }
}

//* POST /vendor/v1/profile/media/presign — Body: { kind, contentType, fileSize }
export const handlePresignProfileMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const { kind, contentType, fileSize } = req.body as { kind?: unknown; contentType?: unknown; fileSize?: unknown }

    const result = await presignProfileMediaUpload(auth.vendorAccount.id, {
      kind,
      contentType: typeof contentType === "string" ? contentType : "",
      fileSize   : Number(fileSize),
    })
    return sendSuccess(res, result, "Upload URL generated")
  } catch (err) { next(err) }
}

//* DELETE /vendor/v1/profile/media — Body: { storageKey }
//* Removes an uploaded image the vendor discarded before saving, so an
//* abandoned upload doesn't linger in the bucket forever.
export const handleDiscardProfileMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = await getVendorAccount(req)
    const { storageKey } = req.body as { storageKey?: unknown }

    await discardProfileMedia(auth.vendorAccount.id, storageKey)
    return sendSuccess(res, { discarded: true }, "Image removed")
  } catch (err) { next(err) }
}

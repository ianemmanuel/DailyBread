import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"

import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/errors/ApiError"
import { ALLOWED_UPLOAD_MIME_TYPES } from "@/lib/images/transform"
import {
  getCuisineDetail,
  presignCuisineImageUpload,
  removeCuisineImage,
  setCuisineImage,
  updateCuisineImageAlt,
} from "../services/admin.cuisineImage.service"

/*
 * Cuisine detail and imagery.
 *
 * Thin, like every controller here: map the request field by field and
 * delegate. Scope is decided in the SERVICE, never in the router — a route
 * cannot know whether the caller may write global catalog content.
 */

//* GET /admin/v1/food-tags/cuisines/:tagRef/detail
export const handleGetCuisineDetail: RequestHandler = async (req, res, next) => {
  try {
    const { tagRef } = req.params as { tagRef: string }
    return sendSuccess(res, await getCuisineDetail(tagRef), "Cuisine fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/food-tags/cuisines/image/presign
export const handlePresignCuisineImage: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const contentType = req.body?.contentType

    /* An ALLOWLIST, not a pattern. The declared type only decides the key's
     * extension — the bytes are re-read and verified at processing time — but
     * accepting an arbitrary string here would let a caller name the object
     * anything at all. */
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(contentType)) {
      throw new ApiError(
        400,
        "Upload a JPEG, PNG, WebP or AVIF image.",
        "UNSUPPORTED_MEDIA_TYPE",
      )
    }

    void adminUser
    return sendSuccess(
      res,
      await presignCuisineImageUpload(contentType, adminScope),
      "Upload URL created",
    )
  } catch (err) { next(err) }
}

//* PUT /admin/v1/food-tags/cuisines/:tagRef/image
export const handleSetCuisineImage: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { tagRef } = req.params as { tagRef: string }
    /* Field by field, never spread — a spread would let a client set imageKey
     * directly and point a cuisine at any object in the public bucket. */
    const { originalImageKey, imageAlt } = req.body ?? {}

    if (typeof originalImageKey !== "string" || !originalImageKey) {
      /* Nothing to publish, but alt text alone is a legitimate edit. */
      if (typeof imageAlt === "string" || imageAlt === null) {
        return sendSuccess(
          res,
          await updateCuisineImageAlt(tagRef, imageAlt, adminUser.id, adminScope),
          "Image description updated",
        )
      }
      throw new ApiError(400, "originalImageKey is required", "MISSING_FIELDS")
    }

    return sendSuccess(
      res,
      await setCuisineImage(
        tagRef,
        { originalImageKey, imageAlt: typeof imageAlt === "string" ? imageAlt : null },
        adminUser.id,
        adminScope,
      ),
      "Image updated",
    )
  } catch (err) { next(err) }
}

//* DELETE /admin/v1/food-tags/cuisines/:tagRef/image
export const handleRemoveCuisineImage: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { tagRef } = req.params as { tagRef: string }
    return sendSuccess(
      res,
      await removeCuisineImage(tagRef, adminUser.id, adminScope),
      "Image removed",
    )
  } catch (err) { next(err) }
}

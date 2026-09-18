import type { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"

import { sendSuccess } from "@/helpers/api-response/response"
import {
  archiveHeroPromotion,
  createHeroPromotion,
  getHeroPromotion,
  listHeroPromotions,
  presignHeroImageUpload,
  publishHeroPromotion,
  updateHeroPromotion,
} from "../services/heroPromotion.service"
import {
  createHeroPromotionSchema,
  listHeroPromotionsSchema,
  presignHeroImageSchema,
  publishHeroPromotionSchema,
  updateHeroPromotionSchema,
} from "../schemas/heroPromotion.schema"

/*
 * Controllers only map and delegate — parse the body, pull the actor and scope
 * off the request, call the service, send the result. Every rule, every scope
 * check and every write lives in the service.
 *
 * `adminUser` and `adminScope` are put on the request by the admin auth chain
 * (verifyAdminToken -> loadAdminUser -> checkIsActive -> loadPermissions ->
 * buildScopeContext), which is applied to the whole admin router, so it covers
 * this module's routes exactly as it covers tax's and finance's. Nothing here
 * re-derives identity or permissions.
 */
function ctx(req: unknown) {
  const { adminUser, adminScope } = req as AdminRequest
  return { actorId: adminUser.id, scope: adminScope }
}

export const handleListHeroPromotions: RequestHandler = async (req, res, next) => {
  try {
    const { scope } = ctx(req)
    const filters = listHeroPromotionsSchema.parse(req.query)
    const data = await listHeroPromotions(filters, scope)
    return sendSuccess(res, data, "Hero promotions fetched")
  } catch (err) {
    next(err)
  }
}

export const handleGetHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const { scope } = ctx(req)
    const data = await getHeroPromotion(req.params.promotionId as string, scope)
    return sendSuccess(res, data, "Hero promotion fetched")
  } catch (err) {
    next(err)
  }
}

/**
 * Hands back a presigned PUT so the browser can upload the original straight
 * to storage. The file never passes through this process.
 */
export const handlePresignHeroImage: RequestHandler = async (req, res, next) => {
  try {
    const input = presignHeroImageSchema.parse(req.body)
    const data = await presignHeroImageUpload(input)
    return sendSuccess(res, data, "Upload URL created")
  } catch (err) {
    next(err)
  }
}

export const handleCreateHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const input = createHeroPromotionSchema.parse(req.body)
    const data = await createHeroPromotion(input, actorId, scope)
    return sendSuccess(res, data, "Hero promotion created", 201)
  } catch (err) {
    next(err)
  }
}

export const handleUpdateHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const input = updateHeroPromotionSchema.parse(req.body)
    const data = await updateHeroPromotion(req.params.promotionId as string, input, actorId, scope)
    return sendSuccess(res, data, "Hero promotion updated")
  } catch (err) {
    next(err)
  }
}

export const handlePublishHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const input = publishHeroPromotionSchema.parse(req.body)
    const data = await publishHeroPromotion(req.params.promotionId as string, input, actorId, scope)
    return sendSuccess(res, data, "Hero promotion published")
  } catch (err) {
    next(err)
  }
}

export const handleArchiveHeroPromotion: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const data = await archiveHeroPromotion(req.params.promotionId as string, actorId, scope)
    return sendSuccess(res, data, "Hero promotion withdrawn")
  } catch (err) {
    next(err)
  }
}

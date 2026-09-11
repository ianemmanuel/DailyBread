import type { Request, RequestHandler } from "express"
import { TaxonomyStatus } from "@repo/db"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  listFoodTags,
  createFoodTag,
  updateFoodTag,
  setFoodTagStatus,
  setFoodTagCountryAvailability,
  setAllFoodTagsForCountry,
  getFoodTagAdoption,
  type FoodTagKind,
} from "../services/admin.foodTag.service"

/*
 * Cuisines and dietary tags share one controller because they share one
 * service — the kind is a path segment, resolved once here so nothing
 * downstream has to re-parse it.
 */

const KINDS: Record<string, FoodTagKind> = {
  cuisines     : "CUISINE",
  "dietary-tags": "DIETARY_TAG",
}

function kindFromParams(req: Request): FoodTagKind {
  const kind = KINDS[req.params.kind ?? ""]
  if (!kind) throw new ApiError(404, "Unknown catalog", "NOT_FOUND")
  return kind
}

function parseStatus(value: unknown): TaxonomyStatus | undefined {
  if (typeof value !== "string" || !value) return undefined
  if (!(value in TaxonomyStatus)) {
    throw new ApiError(400, `status must be one of: ${Object.keys(TaxonomyStatus).join(", ")}`, "INVALID_STATUS")
  }
  return value as TaxonomyStatus
}

//* GET /admin/v1/food-tags/:kind?search=&status=&countryId=
export const handleListFoodTags: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const availability = req.query.availability
    const result = await listFoodTags(kindFromParams(req), adminScope, {
      search   : typeof req.query.search === "string" ? req.query.search : undefined,
      status   : parseStatus(req.query.status),
      countryId: typeof req.query.countryId === "string" && req.query.countryId ? req.query.countryId : undefined,
      availability: availability === "ENABLED" || availability === "DISABLED" ? availability : undefined,
      page     : req.query.page ? Number(req.query.page) : undefined,
      pageSize : req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    return sendSuccess(res, result, "Food tags fetched")
  } catch (err) { next(err) }
}

//* GET /admin/v1/food-tags/:kind/adoption?countryId=
export const handleGetFoodTagAdoption: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const result = await getFoodTagAdoption(kindFromParams(req), adminScope, {
      countryId: typeof req.query.countryId === "string" && req.query.countryId ? req.query.countryId : undefined,
    })
    return sendSuccess(res, result, "Food tag adoption fetched")
  } catch (err) { next(err) }
}

//* POST /admin/v1/food-tags/:kind — GLOBAL scope only (enforced in the service)
export const handleCreateFoodTag: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { name, description, code } = req.body as { name?: string; description?: string; code?: string }
    if (!name) throw new ApiError(400, "Name is required", "MISSING_FIELDS")

    const created = await createFoodTag(kindFromParams(req), { name, description, code }, adminUser.id, adminScope)
    return sendSuccess(res, created, "Created")
  } catch (err) { next(err) }
}

//* PATCH /admin/v1/food-tags/:kind/:tagRef — GLOBAL scope only
export const handleUpdateFoodTag: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { name, description } = req.body as { name?: string; description?: string }

    const updated = await updateFoodTag(
      kindFromParams(req), req.params.tagRef as string, { name, description }, adminUser.id, adminScope,
    )
    return sendSuccess(res, updated, "Updated")
  } catch (err) { next(err) }
}

//* PATCH /admin/v1/food-tags/:kind/:tagRef/status — GLOBAL scope only
export const handleSetFoodTagStatus: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const status = parseStatus((req.body as { status?: string }).status)
    if (!status) throw new ApiError(400, "status is required", "MISSING_FIELDS")

    const updated = await setFoodTagStatus(
      kindFromParams(req), req.params.tagRef as string, status, adminUser.id, adminScope,
    )
    return sendSuccess(res, updated, "Status updated")
  } catch (err) { next(err) }
}

//* PUT /admin/v1/food-tags/:kind/:tagRef/countries/:countryRef
//* Body: { enabled: boolean }. Country scope — this is the half a
//* country-scoped vendor_ops admin can reach.
export const handleSetFoodTagCountryAvailability: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { enabled } = req.body as { enabled?: unknown }
    if (typeof enabled !== "boolean") {
      throw new ApiError(400, "enabled must be true or false", "MISSING_FIELDS")
    }

    const result = await setFoodTagCountryAvailability(
      kindFromParams(req),
      req.params.tagRef as string,
      req.params.countryRef as string,
      enabled,
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, enabled ? "Enabled for country" : "Disabled for country")
  } catch (err) { next(err) }
}

//* PUT /admin/v1/food-tags/:kind/countries/:countryRef/all
//* Body: { enabled: boolean } — "offer everything in this country", or clear it.
export const handleSetAllFoodTagsForCountry: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { enabled } = req.body as { enabled?: unknown }
    if (typeof enabled !== "boolean") {
      throw new ApiError(400, "enabled must be true or false", "MISSING_FIELDS")
    }

    const result = await setAllFoodTagsForCountry(
      kindFromParams(req),
      req.params.countryRef as string,
      enabled,
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, enabled ? "All entries offered in this country" : "All entries withdrawn")
  } catch (err) { next(err) }
}

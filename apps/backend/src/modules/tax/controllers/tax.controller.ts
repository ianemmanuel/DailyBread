import type { RequestHandler } from "express"
import type { TaxonomyStatus, GeoStatus } from "@repo/db"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { resolveCountryIdInScope } from "@/modules/admin/lib/scope/resolve-country-id"
import {
  listTaxCategories,
  createTaxCategory,
  updateTaxCategory,
  setTaxCategoryStatus,
  getCountryTaxSettings,
  setCountryTaxSettings,
  upsertCountryTaxRate,
  setCountryTaxRateStatus,
} from "../services/tax.service"
import {
  createTaxCategorySchema,
  updateTaxCategorySchema,
  setTaxCategoryStatusSchema,
  setCountryTaxSettingsSchema,
  upsertCountryTaxRateSchema,
  setCountryTaxRateStatusSchema,
} from "../schemas/tax.schema"

function ctx(req: unknown) {
  const { adminUser, adminScope } = req as AdminRequest
  return { actorId: adminUser.id, scope: adminScope }
}

//* ─── Catalog ────────────────────────────────────────────────────────────────

export const handleListTaxCategories: RequestHandler = async (req, res, next) => {
  try {
    const data = await listTaxCategories({ includeRetired: req.query.includeRetired === "true" })
    return sendSuccess(res, data, "Tax categories fetched")
  } catch (err) { next(err) }
}

export const handleCreateTaxCategory: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const input = createTaxCategorySchema.parse(req.body)
    const data = await createTaxCategory(input, actorId, scope)
    return sendSuccess(res, data, "Tax category created", 201)
  } catch (err) { next(err) }
}

export const handleUpdateTaxCategory: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const input = updateTaxCategorySchema.parse(req.body)
    const data = await updateTaxCategory(req.params.categoryId as string, input, actorId, scope)
    return sendSuccess(res, data, "Tax category updated")
  } catch (err) { next(err) }
}

export const handleSetTaxCategoryStatus: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const { status } = setTaxCategoryStatusSchema.parse(req.body)
    const data = await setTaxCategoryStatus(
      req.params.categoryId as string,
      status as TaxonomyStatus,
      actorId,
      scope,
    )
    return sendSuccess(res, data, "Tax category status updated")
  } catch (err) { next(err) }
}

//* ─── Per-country settings and rates ─────────────────────────────────────────

export const handleGetCountryTaxSettings: RequestHandler = async (req, res, next) => {
  try {
    const { scope } = ctx(req)
    const countryId = await resolveCountryIdInScope(req.params.countryRef as string, scope)
    const data = await getCountryTaxSettings(countryId, scope)
    return sendSuccess(res, data, "Country tax settings fetched")
  } catch (err) { next(err) }
}

export const handleSetCountryTaxSettings: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const countryId = await resolveCountryIdInScope(req.params.countryRef as string, scope)
    const input = setCountryTaxSettingsSchema.parse(req.body)
    const data = await setCountryTaxSettings(countryId, input, actorId, scope)
    return sendSuccess(res, data, "Country tax settings updated")
  } catch (err) { next(err) }
}

export const handleUpsertCountryTaxRate: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const countryId = await resolveCountryIdInScope(req.params.countryRef as string, scope)
    const input = upsertCountryTaxRateSchema.parse(req.body)
    const data = await upsertCountryTaxRate(countryId, input, actorId, scope)
    return sendSuccess(res, data, "Tax rate saved")
  } catch (err) { next(err) }
}

export const handleSetCountryTaxRateStatus: RequestHandler = async (req, res, next) => {
  try {
    const { actorId, scope } = ctx(req)
    const countryId = await resolveCountryIdInScope(req.params.countryRef as string, scope)
    const { status } = setCountryTaxRateStatusSchema.parse(req.body)
    const data = await setCountryTaxRateStatus(
      countryId,
      req.params.rateId as string,
      status as GeoStatus,
      actorId,
      scope,
    )
    return sendSuccess(res, data, "Tax rate status updated")
  } catch (err) { next(err) }
}

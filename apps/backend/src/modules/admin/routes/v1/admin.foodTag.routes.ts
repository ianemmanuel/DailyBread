import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListFoodTags,
  handleCreateFoodTag,
  handleUpdateFoodTag,
  handleSetFoodTagStatus,
  handleSetFoodTagCountryAvailability,
  handleSetAllFoodTagsForCountry,
  handleGetFoodTagAdoption,
} from "../../controllers/admin.foodTag.controller"
import {
  handleGetCuisineDetail,
  handlePresignCuisineImage,
  handleRemoveCuisineImage,
  handleSetCuisineImage,
} from "../../controllers/admin.cuisineImage.controller"

/*
 * /admin/v1/food-tags/:kind  where :kind is "cuisines" | "dietary-tags".
 *
 * One WRITE permission guards every mutation; what an admin can actually do
 * with it is decided by SCOPE inside the service — catalog mutations require
 * GLOBAL, per-country availability requires only that the country is in scope.
 * That is what lets a country-scoped vendor_ops admin curate their own market
 * without being able to create global vocabulary, using the same grant.
 */
const foodTagRouter: Router = Router()

const READ  = requirePermission(AdminPermissions.SETTINGS_FOOD_TAGS_READ)
const WRITE = requirePermission(AdminPermissions.SETTINGS_FOOD_TAGS_WRITE)

/*
 * CUISINE-ONLY routes, registered FIRST so their literal "cuisines" segment
 * always wins over the generic "/:kind" patterns below — the same ordering
 * rule /vendor-types/adoption needs.
 *
 * Imagery is cuisine-only on purpose: a cuisine tile is a photograph, a
 * dietary tag is a badge. See admin.cuisineImage.service.ts.
 */
foodTagRouter.post  ("/cuisines/image/presign",  WRITE, handlePresignCuisineImage)
foodTagRouter.get   ("/cuisines/:tagRef/detail", READ,  handleGetCuisineDetail)
foodTagRouter.put   ("/cuisines/:tagRef/image",  WRITE, handleSetCuisineImage)
foodTagRouter.delete("/cuisines/:tagRef/image",  WRITE, handleRemoveCuisineImage)

foodTagRouter.get("/:kind", READ, handleListFoodTags)
// Before /:kind/:tagRef for the same reason as the "countries" route below.
foodTagRouter.get("/:kind/adoption", READ, handleGetFoodTagAdoption)
foodTagRouter.post("/:kind", WRITE, handleCreateFoodTag)
// Registered BEFORE /:kind/:tagRef so the literal "countries" segment wins —
// otherwise it would be parsed as a tag slug and 404, the same ordering rule
// /vendor-types/adoption needs.
foodTagRouter.put("/:kind/countries/:countryRef/all", WRITE, handleSetAllFoodTagsForCountry)

foodTagRouter.patch("/:kind/:tagRef", WRITE, handleUpdateFoodTag)
foodTagRouter.patch("/:kind/:tagRef/status", WRITE, handleSetFoodTagStatus)
foodTagRouter.put("/:kind/:tagRef/countries/:countryRef", WRITE, handleSetFoodTagCountryAvailability)

export default foodTagRouter

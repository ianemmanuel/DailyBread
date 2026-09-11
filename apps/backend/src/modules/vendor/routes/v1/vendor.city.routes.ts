import { Router } from "express"
import {
  handleListCities,
  handleGetCityCoverage,
  handleGetOutletPlacement,
} from "../../controllers/vendor.city.controller"

const cityRouter: Router = Router()

//* /vendor/v1/cities — read-only geography reference for the outlet create form
cityRouter.get("/", handleListCities)

//* Operational geography for the location picker. Both are scoped to the
//* vendor's own country and to ACTIVE cities inside the service.
cityRouter.get("/:cityId/coverage",  handleGetCityCoverage)
cityRouter.get("/:cityId/placement", handleGetOutletPlacement)

export default cityRouter

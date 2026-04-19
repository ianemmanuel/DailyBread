import { Router }          from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListCountries,
  handleListCities,
} from "../../controllers/admin.geography.controller"

const geographyRouter: Router = Router()

// All roles that might need to pick a country/city for scope assignment
// need at minimum the geography:read permission.
geographyRouter.get("/countries", requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ), handleListCountries)
geographyRouter.get("/countries/:countryId/cities", requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ), handleListCities)

export default geographyRouter
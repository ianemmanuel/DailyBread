
import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import { 
    handleActivateCountry, 
    handleDeactivateCountry, 
    handleGetCountry, 
    handleListCities,
    handleGetCountriesByStatus,
    handleGetCountryVendorSnapshot
} from "../../controllers/admin.country.controller"
import { handleCreateCity } from "../../controllers/admin.city.controller"


const countryRouter: Router = Router()

const READ   = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)
const WRITE  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
const GLOBAL = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)


countryRouter.get("/", READ, handleGetCountriesByStatus)
countryRouter.get("/:countryRef", READ, handleGetCountry)
countryRouter.patch("/:countryRef/activate", GLOBAL, handleActivateCountry)
countryRouter.patch("/:countryRef/deactivate", GLOBAL, handleDeactivateCountry)
countryRouter.get ("/:countryRef/cities", READ, handleListCities)
countryRouter.post ("/:countryRef/cities", WRITE, handleCreateCity)
countryRouter.get("/:countryRef/vendors", READ, handleGetCountryVendorSnapshot)

export default countryRouter
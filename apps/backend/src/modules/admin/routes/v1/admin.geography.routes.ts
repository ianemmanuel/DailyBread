import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListCountries,
  handleGetCountry,
  handleActivateCountry,
  handleDeactivateCountry,
  handleListCities,
  handleGetCity,
  handleCreateCity,
  handleUpdateCity,
  handleActivateCity,
  handleDeactivateCity,
  handleGetCityBoundary,
  handlePreviewOsmBoundary,
  handleSaveCityBoundary,
  handleClearCityBoundary,
  handleListServiceAreas,
  handleGetServiceArea,
  handleCreateServiceArea,
  handleUpdateServiceArea,
  handleActivateServiceArea,
  handleDeactivateServiceArea,
  handleDeleteServiceArea,
  handleListDeliveryZones,
  handleCreateDeliveryZone,
  handleUpdateDeliveryZone,
  handleActivateDeliveryZone,
  handleDeactivateDeliveryZone,
  handleDeleteDeliveryZone,
} from "../../controllers/admin.geography.controller"

const geographyRouter: Router = Router()

// ─── Route param note ─────────────────────────────────────────────────────────
// :countryRef  — accepts a UUID  OR  a country slug  (e.g. "ke", "ae", "us")
// :cityRef     — accepts a UUID  OR  a city slug     (e.g. "nairobi-ke", "dubai-ae")
// :serviceAreaId / :zoneId — UUID only (these entities have no slug of their own)
// Resolution (slug → id) happens inside the service layer, not here.
// ─────────────────────────────────────────────────────────────────────────────

const READ   = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)
const WRITE  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
const GLOBAL = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)

//* Countries

geographyRouter.get   ("/countries",                           READ,   handleListCountries)
geographyRouter.get   ("/countries/:countryRef",               READ,   handleGetCountry)
geographyRouter.patch ("/countries/:countryRef/activate",      GLOBAL, handleActivateCountry)
geographyRouter.patch ("/countries/:countryRef/deactivate",    GLOBAL, handleDeactivateCountry)

//* Cities

geographyRouter.get   ("/countries/:countryRef/cities",        READ,   handleListCities)
geographyRouter.post  ("/countries/:countryRef/cities",        WRITE,  handleCreateCity)

geographyRouter.get   ("/cities/:cityRef",                     READ,   handleGetCity)
geographyRouter.patch ("/cities/:cityRef",                     WRITE,  handleUpdateCity)
geographyRouter.patch ("/cities/:cityRef/activate",            WRITE,  handleActivateCity)
geographyRouter.patch ("/cities/:cityRef/deactivate",          WRITE,  handleDeactivateCity)

//* City boundary

geographyRouter.get   ("/cities/:cityRef/boundary",            READ,   handleGetCityBoundary)
geographyRouter.post  ("/cities/:cityRef/boundary",            WRITE,  handleSaveCityBoundary)
geographyRouter.delete("/cities/:cityRef/boundary",            WRITE,  handleClearCityBoundary)

// OSM preview — read-only, no DB write
geographyRouter.get   ("/cities/:cityRef/boundary/osm-preview", READ,  handlePreviewOsmBoundary)

//* Service areas

geographyRouter.get   ("/cities/:cityRef/service-areas",               READ,  handleListServiceAreas)
geographyRouter.post  ("/cities/:cityRef/service-areas",               WRITE, handleCreateServiceArea)

geographyRouter.get   ("/service-areas/:serviceAreaId",                READ,  handleGetServiceArea)
geographyRouter.patch ("/service-areas/:serviceAreaId",                WRITE, handleUpdateServiceArea)
geographyRouter.patch ("/service-areas/:serviceAreaId/activate",       WRITE, handleActivateServiceArea)
geographyRouter.patch ("/service-areas/:serviceAreaId/deactivate",     WRITE, handleDeactivateServiceArea)
geographyRouter.delete("/service-areas/:serviceAreaId",                WRITE, handleDeleteServiceArea)

//* Delivery zones

geographyRouter.get   ("/cities/:cityRef/delivery-zones",              READ,  handleListDeliveryZones)
geographyRouter.post  ("/cities/:cityRef/delivery-zones",              WRITE, handleCreateDeliveryZone)

geographyRouter.patch ("/delivery-zones/:zoneId",                      WRITE, handleUpdateDeliveryZone)
geographyRouter.patch ("/delivery-zones/:zoneId/activate",             WRITE, handleActivateDeliveryZone)
geographyRouter.patch ("/delivery-zones/:zoneId/deactivate",           WRITE, handleDeactivateDeliveryZone)
geographyRouter.delete("/delivery-zones/:zoneId",                      WRITE, handleDeleteDeliveryZone)

export default geographyRouter
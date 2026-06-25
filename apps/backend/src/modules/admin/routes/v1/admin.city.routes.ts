
import { Router } from "express"
import { requirePermission } from "@/modules/admin/middleware"
import { AdminPermissions } from "@repo/types/enums"
import {
    handleActivateCity, 
    handleCreateCity, 
    handleDeactivateCity, 
    handleGetCity,  
    handleUpdateCity 
} from "../../controllers/admin.city.controller"
import { 
    handleClearCityBoundary,   
    handleGetCityBoundary, 
    handlePreviewOsmBoundary, 
    handleSaveCityBoundary 
} from "../../controllers/admin.city.controller"
import { handleListServiceAreas, handleCreateServiceArea, } from "../../controllers/admin.servicearea.controller"
import { handleListDeliveryZones, handleCreateDeliveryZone } from "../../controllers/admin.deliveryzone.controller"

const cityRouter: Router = Router()

const READ   = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)
const WRITE  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
const GLOBAL = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)


cityRouter.get("/:cityRef", READ, handleGetCity)
cityRouter.patch("/:cityRef", WRITE, handleUpdateCity)
cityRouter.patch("/:cityRef/activate", WRITE, handleActivateCity)
cityRouter.patch("/:cityRef/deactivate",WRITE, handleDeactivateCity)
cityRouter.get("/:cityRef/boundary", READ, handleGetCityBoundary)
cityRouter.post("/:cityRef/boundary", WRITE, handleSaveCityBoundary)
cityRouter.delete("/:cityRef/boundary", WRITE, handleClearCityBoundary)

// OSM preview — read-only, no DB write
cityRouter.get("/:cityRef/boundary/osm-preview", READ,  handlePreviewOsmBoundary)

cityRouter.get("/:cityRef/service-areas", READ, handleListServiceAreas)
cityRouter.post("/:cityRef/service-areas", WRITE, handleCreateServiceArea)
cityRouter.get("/:cityRef/delivery-zones", READ, handleListDeliveryZones)
cityRouter.post("/:cityRef/delivery-zones", WRITE, handleCreateDeliveryZone)

export default cityRouter
import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import { 
    handleActivateServiceArea, 
    handleDeactivateServiceArea, 
    handleDeleteServiceArea, 
    handleGetServiceArea, 
    handleUpdateServiceArea 
} from "../../controllers/admin.servicearea.controller"

const serviceareaRouter: Router = Router()

const READ   = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)
const WRITE  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
const GLOBAL = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)

serviceareaRouter.get("/:serviceAreaId", READ,  handleGetServiceArea)
serviceareaRouter.patch ("/:serviceAreaId", WRITE, handleUpdateServiceArea)
serviceareaRouter.patch ("/:serviceAreaId/activate", WRITE, handleActivateServiceArea)
serviceareaRouter.patch ("/:serviceAreaId/deactivate", WRITE, handleDeactivateServiceArea)
serviceareaRouter.delete("/:serviceAreaId", WRITE, handleDeleteServiceArea)

export default serviceareaRouter
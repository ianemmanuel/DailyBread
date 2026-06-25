import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleUpdateDeliveryZone,
  handleActivateDeliveryZone,
  handleDeactivateDeliveryZone,
  handleDeleteDeliveryZone,
} from "../../controllers/admin.deliveryzone.controller"

const deliveryzoneRouter: Router = Router()


const WRITE  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

deliveryzoneRouter.patch ("/delivery-zones/:zoneId", WRITE, handleUpdateDeliveryZone)
deliveryzoneRouter.patch ("/delivery-zones/:zoneId/activate", WRITE, handleActivateDeliveryZone)
deliveryzoneRouter.patch ("/delivery-zones/:zoneId/deactivate", WRITE, handleDeactivateDeliveryZone)
deliveryzoneRouter.delete("/delivery-zones/:zoneId", WRITE, handleDeleteDeliveryZone)

export default deliveryzoneRouter
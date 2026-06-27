import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetRegions,
  handleGetRegionBreakdown,
  handleGetRegion,
  handleCreateRegion,
  handleUpdateRegion,
  handleActivateRegion,
  handleDeactivateRegion,
} from "../../controllers/admin.region.controller"

const regionRouter: Router = Router()

const READ  = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)
const WRITE = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

// Reads
// Note: /breakdown registered before /:regionRef — Express matches top-down.
regionRouter.get("/",            READ, handleGetRegions)
regionRouter.get("/breakdown",   READ, handleGetRegionBreakdown)
regionRouter.get("/:regionRef",  READ, handleGetRegion)

// Writes
// Country assignment is on the country router: PATCH/DELETE /countries/:countryRef/region
regionRouter.post("/",                      WRITE, handleCreateRegion)
regionRouter.patch("/:regionId",            WRITE, handleUpdateRegion)
regionRouter.patch("/:regionId/activate",   WRITE, handleActivateRegion)
regionRouter.patch("/:regionId/deactivate", WRITE, handleDeactivateRegion)

export default regionRouter
import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetKPIs,
  handleGetCountryKPIs,
  handleGetCityKPIs,
  handleGetVendorKPIs,
  handleGetOutletKPIs,
  handleGetCustomerKPIs,
} from "../../controllers/admin.kpi.controller"


const kpiRouter: Router = Router()

const READ = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)

kpiRouter.get("/", READ, handleGetKPIs)
kpiRouter.get("/countries", READ, handleGetCountryKPIs)
kpiRouter.get("/cities", READ, handleGetCityKPIs)
kpiRouter.get("/vendors", READ, handleGetVendorKPIs)
kpiRouter.get("/outlets", READ, handleGetOutletKPIs)
kpiRouter.get("/customers", READ, handleGetCustomerKPIs)


export default kpiRouter
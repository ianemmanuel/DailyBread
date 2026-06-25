import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetPlatformKPIs,
  handleGetCountryKPIs,
  handleGetCityKPIs,
  handleGetVendorKPIs,
  handleGetOutletKPIs,
  handleGetCustomerKPIs,
} from "../../controllers/admin.platform.controller"


const platformRouter: Router = Router()

const READ = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)

/* ── Platform KPI endpoints ──────────────────────────────────
 *
 * Full snapshot (all domains in one call — used by the Countries KPI strip):
 *   GET /admin/v1/platform/kpis
 *
 * Domain-specific (call individually when a page only needs one domain):
 *   GET /admin/v1/platform/kpis/countries
 *   GET /admin/v1/platform/kpis/cities
 *   GET /admin/v1/platform/kpis/vendors
 *   GET /admin/v1/platform/kpis/outlets
 *   GET /admin/v1/platform/kpis/customers
 */
platformRouter.get("/kpis", READ, handleGetPlatformKPIs)
platformRouter.get("/kpis/countries", READ, handleGetCountryKPIs)
platformRouter.get("/kpis/cities", READ, handleGetCityKPIs)
platformRouter.get("/kpis/vendors", READ, handleGetVendorKPIs)
platformRouter.get("/kpis/outlets", READ, handleGetOutletKPIs)
platformRouter.get("/kpis/customers", READ, handleGetCustomerKPIs)


export default platformRouter
import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetPlatformKPIs,
  handleGetCountriesByStatus,
  handleGetCountryVendorSnapshot,
} from "../../controllers/admin.platform.controller"

const platformRouter: Router = Router()

const READ = requirePermission(AdminPermissions.SETTINGS_GEOGRAPHY_READ)

/**
 * GET /admin/v1/platform/kpis
 * Cross-domain summary counts: countries, vendors, cities, outlets, customers.
 */
platformRouter.get("/kpis", READ, handleGetPlatformKPIs)

/**
 * GET /admin/v1/platform/countries
 * GET /admin/v1/platform/countries?status=ACTIVE
 * GET /admin/v1/platform/countries?status=INACTIVE.
 */
platformRouter.get("/countries", READ, handleGetCountriesByStatus)
platformRouter.get("/countries/:countrySlug/vendors", READ, handleGetCountryVendorSnapshot)

export default platformRouter
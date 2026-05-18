import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleGetPlatformKPIs,
  handleGetCountriesByStatus,
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
 * GET /admin/v1/platform/countries?status=INACTIVE
 *
 * Single endpoint, status-filtered. Cleaner than three separate routes.
 * Geography routes (/geography/countries) remain for geography-specific operations
 * (city CRUD, boundaries, service areas). This route is for UI-layer listing and KPIs.
 */
platformRouter.get("/countries", READ, handleGetCountriesByStatus)

export default platformRouter
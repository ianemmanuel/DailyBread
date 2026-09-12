import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListTaxCategories,
  handleCreateTaxCategory,
  handleUpdateTaxCategory,
  handleSetTaxCategoryStatus,
  handleGetCountryTaxSettings,
  handleSetCountryTaxSettings,
  handleUpsertCountryTaxRate,
  handleSetCountryTaxRateStatus,
} from "../controllers/tax.controller"

/**
 * Tax module — admin-facing routes. Mounted at `/admin/v1/tax` behind the
 * full adminAuthChain by the admin v1 router.
 *
 * RBAC uses the existing pool + requirePermission + scope model, with its own
 * permission pair rather than borrowing finance's: READ = finance:tax:read,
 * every mutation = finance:tax:manage. The `finance:` namespace is kept
 * because tax IS financial configuration and the permission catalog groups by
 * domain, but the keys are the tax module's own, so finance-provider access
 * and tax access can be granted independently.
 *
 * Scope is enforced per call in the service, not here:
 *   - catalog mutations require GLOBAL scope;
 *   - a country's own rates and tax position need only own-country scope,
 *     since a statutory rate is that country's finance admin's record;
 *   - city tier is refused for anything country-wide.
 */
const taxAdminRouter: Router = Router()

const READ   = requirePermission(AdminPermissions.FINANCE_TAX_READ)
const MANAGE = requirePermission(AdminPermissions.FINANCE_TAX_MANAGE)

//* ─── Tax-category catalog (global vocabulary) ───────────────────────────
taxAdminRouter.get   ("/categories",                   READ,   handleListTaxCategories)
taxAdminRouter.post  ("/categories",                   MANAGE, handleCreateTaxCategory)
taxAdminRouter.patch ("/categories/:categoryId",        MANAGE, handleUpdateTaxCategory)
taxAdminRouter.patch ("/categories/:categoryId/status", MANAGE, handleSetTaxCategoryStatus)

//* ─── One country's tax position and rates ───────────────────────────────
taxAdminRouter.get   ("/countries/:countryRef",                    READ,   handleGetCountryTaxSettings)
taxAdminRouter.patch ("/countries/:countryRef/settings",           MANAGE, handleSetCountryTaxSettings)
taxAdminRouter.put   ("/countries/:countryRef/rates",              MANAGE, handleUpsertCountryTaxRate)
taxAdminRouter.patch ("/countries/:countryRef/rates/:rateId/status", MANAGE, handleSetCountryTaxRateStatus)

export default taxAdminRouter

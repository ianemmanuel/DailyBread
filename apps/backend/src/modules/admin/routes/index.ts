import { Router } from "express"
import { adminAuthChain } from "../middleware"
import v1Router from "./v1"

const adminRouter: Router = Router()

/**
 * Admin module router.
 *
 * Applies the full auth chain to every route:
 *   verifyAdminToken → loadAdminUser → checkIsActive → loadPermissions → scopeFilter
 *
 * Individual routes apply requirePermission() on top of this chain.
 * The admin module is entirely self-contained — no shared middleware from
 * the vendor/meta routes applies here.
 */
adminRouter.use(...adminAuthChain)
adminRouter.use("/v1", v1Router)

export default adminRouter
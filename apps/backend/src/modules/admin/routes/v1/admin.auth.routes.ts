import { Router }         from "express"
import { adminAuthChain } from "@/modules/admin/middleware"
import { getAdminSession } from "../../controllers/admin.session.controller"

/**
 * Admin auth routes.
 * Mounted at: /api/admin/v1/auth
 *
 * GET /api/admin/v1/auth/session
 *   Returns the current user's identity, role, permissions, and scope.
 *   Protected by the full adminAuthChain.
 */
const authRouter: Router = Router()

authRouter.get("/session", getAdminSession)

export default authRouter
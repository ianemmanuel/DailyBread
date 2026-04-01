import { Router }          from "express"
import { AdminPermissions } from "@repo/types"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListAdminUsers,
  handleGetAdminUser,
  handleCreateAdminUser,
  handleSendInvitation,
  handleUpdatePermissions,
  handleSuspendAdminUser,
  handleReinstateAdminUser,
  handleDeactivateAdminUser,
} from "../../controllers/admin.user.controller"

/**
 * Admin user management routes.
 * Mounted at: /api/admin/v1/users
 *
 * The adminAuthChain is applied at the parent router level —
 * all routes here already have a verified, active admin user attached.
 *
 * Route                    Permission required
 * ─────────────────────────────────────────────────────────────────
 * GET    /                 ADMIN_USERS_READ
 * GET    /:id              ADMIN_USERS_READ
 * POST   /                 ADMIN_USERS_CREATE
 * POST   /:id/invite       ADMIN_USERS_INVITE
 * PUT    /:id/permissions  ADMIN_USERS_PERMISSIONS
 * POST   /:id/suspend      ADMIN_USERS_DEACTIVATE
 * POST   /:id/reinstate    ADMIN_USERS_DEACTIVATE
 * POST   /:id/deactivate   ADMIN_USERS_DEACTIVATE
 */

const userRouter: Router = Router()

userRouter.get(
  "/",
  requirePermission(AdminPermissions.ADMIN_USERS_READ),
  handleListAdminUsers,
)

userRouter.get(
  "/:id",
  requirePermission(AdminPermissions.ADMIN_USERS_READ),
  handleGetAdminUser,
)

userRouter.post(
  "/",
  requirePermission(AdminPermissions.ADMIN_USERS_CREATE),
  handleCreateAdminUser,
)

userRouter.post(
  "/:id/invite",
  requirePermission(AdminPermissions.ADMIN_USERS_INVITE),
  handleSendInvitation,
)

userRouter.put(
  "/:id/permissions",
  requirePermission(AdminPermissions.ADMIN_USERS_PERMISSIONS),
  handleUpdatePermissions,
)

userRouter.post(
  "/:id/suspend",
  requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE),
  handleSuspendAdminUser,
)

userRouter.post(
  "/:id/reinstate",
  requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE),
  handleReinstateAdminUser,
)

userRouter.post(
  "/:id/deactivate",
  requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE),
  handleDeactivateAdminUser,
)

export default userRouter
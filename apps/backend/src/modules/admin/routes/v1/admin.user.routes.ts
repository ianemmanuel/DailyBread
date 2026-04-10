import { Router }          from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleListAdminUsers,
  handleGetAdminUser,
  handleCreateAdminUser,
  handleSendInvitation,
  handleUpdatePermissions,
  handleUpdateRole,
  handleUpdateScopes,
  handleSuspendAdminUser,
  handleReinstateAdminUser,
  handleDeactivateAdminUser,
  handleGetRolePermissionPool,
  handleListRoles,
} from "../../controllers/admin.user.controller"

/**
 * Admin user management routes.
 * Mounted at: /api/admin/v1/users
 *
 * Route                          Permission required
 * ─────────────────────────────────────────────────────────────────────────
 * GET    /meta/roles              ADMIN_USERS_READ   (role dropdown for UI)
 * GET    /meta/roles/:id/pool     ADMIN_USERS_READ   (permissions in role)
 * GET    /                        ADMIN_USERS_READ
 * GET    /:id                     ADMIN_USERS_READ
 * POST   /                        ADMIN_USERS_CREATE
 * POST   /:id/invite              ADMIN_USERS_INVITE
 * PUT    /:id/permissions         ADMIN_USERS_PERMISSIONS
 * PATCH  /:id/role                ADMIN_USERS_ROLES_ASSIGN
 * PATCH  /:id/scopes              ADMIN_USERS_PERMISSIONS
 * POST   /:id/suspend             ADMIN_USERS_DEACTIVATE
 * POST   /:id/reinstate           ADMIN_USERS_DEACTIVATE
 * POST   /:id/deactivate          ADMIN_USERS_DEACTIVATE
 */

const userRouter: Router = Router()

// ── Meta routes first — avoid :id param conflicts ─────────────────────────
userRouter.get("/meta/roles", requirePermission(AdminPermissions.ADMIN_USERS_READ), handleListRoles)
userRouter.get("/meta/roles/:roleId/pool", requirePermission(AdminPermissions.ADMIN_USERS_READ), handleGetRolePermissionPool)

// ── User list + get ────────────────────────────────────────────────────────
userRouter.get("/",    requirePermission(AdminPermissions.ADMIN_USERS_READ), handleListAdminUsers)
userRouter.get("/:id", requirePermission(AdminPermissions.ADMIN_USERS_READ), handleGetAdminUser)

// ── Create ─────────────────────────────────────────────────────────────────
userRouter.post("/", requirePermission(AdminPermissions.ADMIN_USERS_CREATE), handleCreateAdminUser)

// ── Invitation ─────────────────────────────────────────────────────────────
userRouter.post("/:id/invite", requirePermission(AdminPermissions.ADMIN_USERS_INVITE), handleSendInvitation)

// ── Assignments ────────────────────────────────────────────────────────────
userRouter.put("/:id/permissions",  requirePermission(AdminPermissions.ADMIN_USERS_PERMISSIONS),  handleUpdatePermissions)
userRouter.patch("/:id/role",       requirePermission(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN), handleUpdateRole)
userRouter.patch("/:id/scopes",     requirePermission(AdminPermissions.ADMIN_USERS_PERMISSIONS),  handleUpdateScopes)

// ── Lifecycle ──────────────────────────────────────────────────────────────
userRouter.post("/:id/suspend",    requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE), handleSuspendAdminUser)
userRouter.post("/:id/reinstate",  requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE), handleReinstateAdminUser)
userRouter.post("/:id/deactivate", requirePermission(AdminPermissions.ADMIN_USERS_DEACTIVATE), handleDeactivateAdminUser)

export default userRouter
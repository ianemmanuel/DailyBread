import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission, requireAnyPermission } from "@/modules/admin/middleware"
import {
  handleListAdminUsers,
  handleGetAdminUser,
  handleCreateAdminUser,
  handleSendInvitation,
  handleUpdatePermissions,
  handleRecoverPermissions,
  handleGetPermissionOptions,
  handleListDelegableAdmins,
  handleUpdateRole,
  handleUpdateScopes,
  handleSuspendAdminUser,
  handleReinstateAdminUser,
  handleReactivateAdminUser,
  handleDeactivateAdminUser,
  handleSetAdminUserAvailability,
  handleGetRolePermissionPool,
  handleListRoles,
} from "../../controllers/admin.user.controller"

/**
 * Admin user management routes. Mounted at: /api/admin/v1/users
 *
 * Security chain per route:
 *   adminAuthChain (token → user → active → scope → effective permissions)
 *   → requirePermission(X)   the admin_users key for THIS action
 *   → handler → service      re-reads the actor in the transaction and applies
 *                            the delegation policy to the target: scope
 *                            containment, self / super_admin protection,
 *                            role pools, permission ownership or recovery
 *
 * There is NO role-name gate. The old requireIdentityAccess guard (super_admin
 * or identity_admin only) was removed once every route here was shown to carry
 * its own key gate AND a service-level target check; authority now comes only
 * from effective permissions + scope, so a department lead holding
 * admin_users:permissions:manage reaches the shared delegation workflow
 * without being treated as an identity admin, and nothing else.
 */

const router: Router = Router()

const MANAGE  = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
const RECOVER = AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER

// ── Meta ──────────────────────────────────────────────────────────────────────
router.get("/meta/roles",              requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ), handleListRoles)
router.get("/meta/roles/:roleId/pool", requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ), handleGetRolePermissionPool)

// ── Permission assignment (identity admins AND department leads) ─────────────
// Registered before "/:id" so "delegable" is not read as an id. Both reads
// return only targets the actor may assign to (service-computed).
router.get("/delegable",                 requireAnyPermission([MANAGE, RECOVER]), handleListDelegableAdmins)
router.get("/:id/permission-options",    requireAnyPermission([MANAGE, RECOVER]), handleGetPermissionOptions)
// Ordinary delegation: permission ownership.
router.put("/:id/permissions",           requirePermission(MANAGE),  handleUpdatePermissions)
// Recovery / bootstrap: independently gated, any key of another department's pool.
router.put("/:id/permissions/recovery",  requirePermission(RECOVER), handleRecoverPermissions)

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/",    requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ),   handleListAdminUsers)
router.get("/:id", requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ),   handleGetAdminUser)
router.post("/",   requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE), handleCreateAdminUser)

// ── Invitation ────────────────────────────────────────────────────────────────
router.post("/:id/invite", requirePermission(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND), handleSendInvitation)

// ── Assignments ───────────────────────────────────────────────────────────────
router.patch("/:id/role",   requirePermission(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN), handleUpdateRole)
// Scope is assigned with the role (identity provisioning), so it is gated on
// roles:assign — permissions:manage is the grant capability.
router.patch("/:id/scopes", requirePermission(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN), handleUpdateScopes)

// ── Lifecycle ─────────────────────────────────────────────────────────────────
router.post("/:id/suspend",    requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND),    handleSuspendAdminUser)
router.post("/:id/reinstate",  requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE),  handleReinstateAdminUser)
// Deactivated → pending, no grants, new invitation required (re-hire).
router.post("/:id/reactivate", requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE),  handleReactivateAdminUser)
router.post("/:id/deactivate", requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE), handleDeactivateAdminUser)

// ── Availability ──────────────────────────────────────────────────────────────
router.patch("/:id/availability", requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_MANAGE_AVAILABILITY), handleSetAdminUserAvailability)

export default router

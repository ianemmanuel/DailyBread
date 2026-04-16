import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import { requireIdentityAccess } from "@/modules/admin/middleware/identity/requireIdentityAccess"
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
 * Security chain per route:
 *   adminAuthChain (token → user → active → permissions → scope)
 *   → requireIdentityAccess (blocks non-identity roles at the route level)
 *   → requirePermission(X)  (checks specific permission grant)
 *   → handler
 *
 * Two layers of role enforcement is intentional defence-in-depth.
 * The middleware catches misconfigured roles early.
 * The service layer enforces scope rules with full DB context.
 */

const router: Router = Router()

// Apply identity guard to ALL routes in this router.
// This runs after adminAuthChain (already applied at parent router level).
router.use(requireIdentityAccess)

// ── Meta ──────────────────────────────────────────────────────────────────────
// These endpoints are read-only and needed for the permission picker UI.
// Identity admins need read access to fetch roles/pools for user creation.
router.get("/meta/roles",              requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ), handleListRoles)
router.get("/meta/roles/:roleId/pool", requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ), handleGetRolePermissionPool)

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get("/",    requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ),   handleListAdminUsers)
router.get("/:id", requirePermission(AdminPermissions.ADMIN_USERS_PROFILES_READ),   handleGetAdminUser)
router.post("/",   requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE), handleCreateAdminUser)

// ── Invitation ────────────────────────────────────────────────────────────────
router.post("/:id/invite", requirePermission(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND), handleSendInvitation)

// ── Assignments ───────────────────────────────────────────────────────────────
router.put("/:id/permissions",  requirePermission(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE), handleUpdatePermissions)
router.patch("/:id/role",       requirePermission(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN),       handleUpdateRole)
router.patch("/:id/scopes",     requirePermission(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE), handleUpdateScopes)

// ── Lifecycle ─────────────────────────────────────────────────────────────────
router.post("/:id/suspend",    requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND),    handleSuspendAdminUser)
router.post("/:id/reinstate",  requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE),  handleReinstateAdminUser)
router.post("/:id/deactivate", requirePermission(AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE), handleDeactivateAdminUser)

export default router

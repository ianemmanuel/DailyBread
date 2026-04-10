import { RequestHandler }         from "express"
import { AdminUserStatus }        from "@repo/db"
import type { AdminRequest }      from "@repo/types/backend"
import { sendSuccess }            from "@/helpers/api-response/response"
import { ApiError }               from "@/middleware/error"
import {
  createAdminUser,
  sendAdminInvitation,
  updateAdminUserPermissions,
  updateAdminUserRole,
  updateAdminUserScopes,
  suspendAdminUser,
  reinstateAdminUser,
  deactivateAdminUser,
  getAdminUser,
  listAdminUsers,
  getRolePermissionPool,
  listRoles,
} from "../services/admin.user.service"

// ─── List ─────────────────────────────────────────────────────────────────────

export const handleListAdminUsers: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }                          = req as unknown as AdminRequest
    const { status, roleId, search, page, pageSize } = req.query

    const result = await listAdminUsers(
      {
        status  : status   as AdminUserStatus | undefined,
        roleId  : roleId   as string | undefined,
        search  : search   as string | undefined,
        page    : page     ? parseInt(page     as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      },
      adminScope,
    )
    return sendSuccess(res, result, "Admin users fetched successfully")
  } catch (err) { next(err) }
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export const handleGetAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }
    const user           = await getAdminUser(id, adminScope)
    return sendSuccess(res, user, "Admin user fetched successfully")
  } catch (err) { next(err) }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export const handleCreateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }                            = req as unknown as AdminRequest
    const { email, fullName, roleId, permissionKeys = [], scopes } = req.body

    if (!email || !fullName || !roleId) {
      throw new ApiError(400, "email, fullName, and roleId are required", "MISSING_FIELDS")
    }

    const user = await createAdminUser(
      { email, fullName, roleId, permissionKeys, scopes },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, user, "Admin user created successfully", 201)
  } catch (err) { next(err) }
}

// ─── Send invitation ──────────────────────────────────────────────────────────

export const handleSendInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await sendAdminInvitation({ adminUserId: id }, adminUser.id, adminScope)
    return sendSuccess(res, result, "Invitation sent successfully")
  } catch (err) { next(err) }
}

// ─── Update permissions ───────────────────────────────────────────────────────

export const handleUpdatePermissions: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { permissionKeys = [] }   = req.body
    const result = await updateAdminUserPermissions(
      { adminUserId: id, permissionKeys },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, "Permissions updated successfully")
  } catch (err) { next(err) }
}

// ─── Update role ──────────────────────────────────────────────────────────────

export const handleUpdateRole: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { roleId }                = req.body
    if (!roleId) throw new ApiError(400, "roleId is required", "MISSING_FIELDS")
    const result = await updateAdminUserRole(
      { adminUserId: id, roleId },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, "Role updated successfully")
  } catch (err) { next(err) }
}

// ─── Update scopes ────────────────────────────────────────────────────────────

export const handleUpdateScopes: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { scopes }                = req.body
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ApiError(400, "scopes array is required", "MISSING_FIELDS")
    }
    const result = await updateAdminUserScopes(
      { adminUserId: id, scopes },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, result, "Scopes updated successfully")
  } catch (err) { next(err) }
}

// ─── Suspend ──────────────────────────────────────────────────────────────────

export const handleSuspendAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await suspendAdminUser(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "User suspended successfully")
  } catch (err) { next(err) }
}

// ─── Reinstate ────────────────────────────────────────────────────────────────

export const handleReinstateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await reinstateAdminUser(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "User reinstated successfully")
  } catch (err) { next(err) }
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export const handleDeactivateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await deactivateAdminUser(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "User deactivated successfully")
  } catch (err) { next(err) }
}

// ─── Meta: role permission pool ───────────────────────────────────────────────

export const handleGetRolePermissionPool: RequestHandler = async (req, res, next) => {
  try {
    const { roleId } = req.params as { roleId: string }
    const pool       = await getRolePermissionPool(roleId)
    return sendSuccess(res, pool, "Role permission pool fetched")
  } catch (err) { next(err) }
}

// ─── Meta: list roles ─────────────────────────────────────────────────────────

export const handleListRoles: RequestHandler = async (req, res, next) => {
  try {
    const roles = await listRoles()
    return sendSuccess(res, roles, "Roles fetched")
  } catch (err) { next(err) }
}
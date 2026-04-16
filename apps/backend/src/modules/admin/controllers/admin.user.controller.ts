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

//* ─── List ─────────────────

export const handleListAdminUsers: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope }                             = req as unknown as AdminRequest
    const { status, roleId, search, page, pageSize } = req.query
    const result = await listAdminUsers(
      {
        status  : status   as string | undefined,
        roleId  : roleId   as string | undefined,
        search  : search   as string | undefined,
        page    : page     ? parseInt(page     as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      },
      adminScope,
    )
    return sendSuccess(res, result, "Admin users fetched")
  } catch (err) { next(err) }
}

//* ─── Get one ────────────────

export const handleGetAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }
    const user           = await getAdminUser(id, adminScope)
    return sendSuccess(res, user, "Admin user fetched")
  } catch (err) { next(err) }
}

//* ─── Create ────────────────

export const handleCreateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope }                               = req as unknown as AdminRequest
    const { firstName, middleName, lastName, email, employeeId,
            roleId, permissionKeys = [], scopes }                 = req.body

    if (!firstName || !lastName || !email || !roleId) {
      throw new ApiError(400, "firstName, lastName, email, and roleId are required", "MISSING_FIELDS")
    }

    const user = await createAdminUser(
      { firstName, middleName, lastName, email, employeeId, roleId, permissionKeys, scopes },
      adminUser.id,
      adminScope,
    )
    return sendSuccess(res, user, "Admin user created", 201)
  } catch (err) { next(err) }
}

//* ─── Send invitation ──────────

export const handleSendInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await sendAdminInvitation(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "Invitation sent")
  } catch (err) { next(err) }
}

//* ─── Update permissions ───────────

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
    return sendSuccess(res, result, "Permissions updated")
  } catch (err) { next(err) }
}

//* ─── Update role ────────────────────

export const handleUpdateRole: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { roleId }                = req.body
    if (!roleId) throw new ApiError(400, "roleId is required", "MISSING_FIELDS")
    const result = await updateAdminUserRole({ adminUserId: id, roleId }, adminUser.id, adminScope)
    return sendSuccess(res, result, "Role updated")
  } catch (err) { next(err) }
}

//* ─── Update scopes ──────────────

export const handleUpdateScopes: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { scopes }                = req.body
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ApiError(400, "scopes array is required", "MISSING_FIELDS")
    }
    const result = await updateAdminUserScopes({ adminUserId: id, scopes }, adminUser.id, adminScope)
    return sendSuccess(res, result, "Scopes updated")
  } catch (err) { next(err) }
}

//* ─── Lifecycle ─────────────────

export const handleSuspendAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await suspendAdminUser(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "User suspended")
  } catch (err) { next(err) }
}

export const handleReinstateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const result = await reinstateAdminUser(id, adminUser.id, adminScope)
    return sendSuccess(res, result, "User reinstated")
  } catch (err) { next(err) }
}

export const handleDeactivateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }                    = req.params as { id: string }
    const { reason }                = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await deactivateAdminUser(id, reason, adminUser.id, adminScope)
    return sendSuccess(res, result, "User deactivated")
  } catch (err) { next(err) }
}

//* ─── Meta ──────────────

export const handleGetRolePermissionPool: RequestHandler = async (req, res, next) => {
  try {
    const { roleId } = req.params as { roleId: string }
    const pool       = await getRolePermissionPool(roleId)
    return sendSuccess(res, pool, "Role permission pool fetched")
  } catch (err) { next(err) }
}

export const handleListRoles: RequestHandler = async (req, res, next) => {
  try {
    const roles = await listRoles()
    return sendSuccess(res, roles, "Roles fetched")
  } catch (err) { next(err) }
}
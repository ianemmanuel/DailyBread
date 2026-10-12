import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { sendSuccess } from "@/helpers/api-response/response"
import { ApiError } from "@/middleware/error"
import {
  createAdminUser,
  sendAdminInvitation,
  updateAdminUserPermissions,
  updateAdminUserRole,
  updateAdminUserScopes,
  suspendAdminUser,
  reinstateAdminUser,
  deactivateAdminUser,
  setAdminUserAvailability,
  getAdminUser,
  listAdminUsers,
  getRolePermissionPool,
  listRoles,
} from "../services/admin.user.service"
import { parseAvailabilityInput } from "./admin.reviewerAvailability.controller"

/*
 * Mutations pass ONLY the actor's id: the service re-reads the actor's role,
 * pool, grants and scope itself, so nothing on the request is authority.
 *
 * Each assignment route takes exactly its own fields. A role change that also
 * carries permissions or a scope (or the reverse) is refused, not partly
 * applied — one request never does two kinds of assignment.
 */
function refuseFields(body: Record<string, unknown> | undefined, fields: string[]): void {
  const present = fields.filter((f) => body && body[f] !== undefined)
  if (present.length > 0) {
    throw new ApiError(400, `This request does not accept: ${present.join(", ")}`, "UNSUPPORTED_FIELD")
  }
}

export const handleListAdminUsers: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { status, roleId, search, countryId, page, pageSize } = req.query
    const result = await listAdminUsers(
      {
        status   : status    as string | undefined,
        roleId   : roleId    as string | undefined,
        search   : search    as string | undefined,
        countryId: countryId as string | undefined,
        page     : page      ? parseInt(page     as string) : undefined,
        pageSize : pageSize  ? parseInt(pageSize as string) : undefined,
      },
      adminScope,
      adminUser.role?.name,
    )
    return sendSuccess(res, result, "Admin users fetched")
  } catch (err) { next(err) }
}

export const handleGetAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminScope } = req as unknown as AdminRequest
    const { id }         = req.params as { id: string }
    const user           = await getAdminUser(id, adminScope, adminUser.role?.name)
    return sendSuccess(res, user, "Admin user fetched")
  } catch (err) { next(err) }
}

export const handleCreateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const {
      firstName,
      middleName,
      lastName,
      email,
      employeeId,
      roleId,
      permissionKeys,
      scopes,
    } = req.body

    if (!firstName || !lastName || !email || !roleId) {
      throw new ApiError(400, "firstName, lastName, email, and roleId are required", "MISSING_FIELDS")
    }

    // permissionKeys is mapped deliberately: the service REFUSES a non-empty
    // list (provisioning grants nothing), so it must reach it.
    const user = await createAdminUser(
      { firstName, middleName, lastName, email, employeeId, roleId, permissionKeys, scopes },
      adminUser.id,
    )
    return sendSuccess(res, user, "Admin user created", 201)
  } catch (err) { next(err) }
}

export const handleSendInvitation: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    const result = await sendAdminInvitation(id, adminUser.id)
    return sendSuccess(res, result, "Invitation sent")
  } catch (err) { next(err) }
}

export const handleUpdatePermissions: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    refuseFields(req.body, ["roleId", "scopes"])
    const { permissionKeys } = req.body ?? {}
    const result = await updateAdminUserPermissions({ adminUserId: id, permissionKeys }, adminUser.id)
    return sendSuccess(res, result, "Permissions updated")
  } catch (err) { next(err) }
}

export const handleUpdateRole: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    refuseFields(req.body, ["permissionKeys", "scopes"])
    const { roleId } = req.body ?? {}
    if (!roleId) throw new ApiError(400, "roleId is required", "MISSING_FIELDS")
    const result = await updateAdminUserRole({ adminUserId: id, roleId }, adminUser.id)
    return sendSuccess(res, result, "Role updated")
  } catch (err) { next(err) }
}

export const handleUpdateScopes: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    refuseFields(req.body, ["permissionKeys", "roleId"])
    const { scopes } = req.body ?? {}
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ApiError(400, "scopes array is required", "MISSING_FIELDS")
    }
    const result = await updateAdminUserScopes({ adminUserId: id, scopes }, adminUser.id)
    return sendSuccess(res, result, "Scopes updated")
  } catch (err) { next(err) }
}

export const handleSuspendAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    const { reason } = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await suspendAdminUser(id, reason, adminUser.id)
    return sendSuccess(res, result, "User suspended")
  } catch (err) { next(err) }
}

export const handleReinstateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    const result = await reinstateAdminUser(id, adminUser.id)
    return sendSuccess(res, result, "User reinstated")
  } catch (err) { next(err) }
}

export const handleDeactivateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    const { reason }    = req.body
    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")
    const result = await deactivateAdminUser(id, reason, adminUser.id)
    return sendSuccess(res, result, "User deactivated")
  } catch (err) { next(err) }
}

export const handleSetAdminUserAvailability: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id } = req.params as { id: string }
    const input  = parseAvailabilityInput(req.body)
    const result = await setAdminUserAvailability(id, input, adminUser.id)
    return sendSuccess(res, result, "Availability updated")
  } catch (err) { next(err) }
}

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

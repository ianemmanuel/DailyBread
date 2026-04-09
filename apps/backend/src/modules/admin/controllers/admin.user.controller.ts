import { NextFunction, RequestHandler }    from "express"
import { AdminUserStatus }   from "@repo/db"            
import type { AdminRequest } from "@repo/types/backend/admin"
import { sendSuccess }       from "@/helpers/api-response/response"
import { ApiError }          from "@/middleware/error"
import {
  createAdminUser,
  sendAdminInvitation,
  updateAdminUserPermissions,
  suspendAdminUser,
  reinstateAdminUser,
  deactivateAdminUser,
  getAdminUser,
  listAdminUsers,
} from "../services/admin.user.service"



export const handleListAdminUsers: RequestHandler = async (req, res, next) => {
  try {
    const { status, roleId, page, pageSize } = req.query

    const result = await listAdminUsers({
      status  : status   as AdminUserStatus | undefined,
      roleId  : roleId   as string          | undefined,
      page    : page     ? parseInt(page     as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
    })

    return sendSuccess(res, result, "Admin users fetched successfully")
  } catch (err) {
    next(err)
  }
}

export const handleGetAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const user   = await getAdminUser(id)
    return sendSuccess(res, user, "Admin user fetched successfully")
  } catch (err) {
    next(err)
  }
}


export const handleCreateAdminUser: RequestHandler = async (req, res, next:NextFunction) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { email, fullName, roleId, permissionKeys = [] } = req.body

    if (!email || !fullName || !roleId) {
      throw new ApiError(400, "email, fullName, and roleId are required", "MISSING_FIELDS")
    }

    const user = await createAdminUser(
      { email, fullName, roleId, permissionKeys },
      adminUser.id,
    )

    return sendSuccess(res, user, "Admin user created successfully", 201)
  } catch (err) {
    next(err)
  }
}


export const handleSendInvitation: RequestHandler = async (req, res, next:NextFunction) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }

    const result = await sendAdminInvitation({ adminUserId: id }, adminUser.id)
    return sendSuccess(res, result, "Invitation sent successfully")
  } catch (err) {
    next(err)
  }
}

export const handleUpdatePermissions: RequestHandler = async (req, res, next:NextFunction) => {
  try {
    const { adminUser }           = req as unknown as AdminRequest
    const { id }                  = req.params as { id: string }
    const { permissionKeys = [] } = req.body

    const result = await updateAdminUserPermissions(
      { adminUserId: id, permissionKeys },
      adminUser.id,
    )
    return sendSuccess(res, result, "Permissions updated successfully")
  } catch (err) {
    next(err)
  }
}


export const handleSuspendAdminUser: RequestHandler = async (req, res, next:NextFunction) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    const { reason }    = req.body

    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

    const result = await suspendAdminUser(id, reason, adminUser.id)
    return sendSuccess(res, result, "User suspended successfully")
  } catch (err) {
    next(err)
  }
}


export const handleReinstateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }

    const result = await reinstateAdminUser(id, adminUser.id)
    return sendSuccess(res, result, "User reinstated successfully")
  } catch (err) {
    next(err)
  }
}


export const handleDeactivateAdminUser: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser } = req as unknown as AdminRequest
    const { id }        = req.params as { id: string }
    const { reason }    = req.body

    if (!reason) throw new ApiError(400, "reason is required", "MISSING_FIELDS")

    const result = await deactivateAdminUser(id, reason, adminUser.id)
    return sendSuccess(res, result, "User deactivated successfully")
  } catch (err) {
    next(err)
  }
}
import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import type { AdminSessionData } from "@repo/types"
import { sendSuccess }       from "@/helpers/api-response/response"

/**
 * GET /api/admin/v1/auth/session
 *
 * Returns the current admin user's identity, role, permissions, and scope.
 * Called once on dashboard load — the frontend caches this in context.
 *
 * All data is already loaded by the adminAuthChain middleware (loadAdminUser
 * + loadPermissions + scopeFilter). This handler only shapes the response.
 * Zero additional DB calls.
 */
export const getAdminSession: RequestHandler = (req, res) => {
    const { adminUser, adminPermissions, adminScope } = req as AdminRequest

    const response: AdminSessionData = {
        id         : adminUser.id,
        email      : adminUser.email,
        fullName   : adminUser.fullName,
        role       : {
            name       : adminUser.role?.name        ?? "",
            displayName: adminUser.role?.displayName ?? "",
        },
        permissions: adminPermissions,
        scope      : {
            isGlobal  : adminScope.isGlobal,
            countryIds: adminScope.countryIds,
            cityIds   : adminScope.cityIds,
            scopes    : adminUser.scopes,
        },
    }

    return sendSuccess(res, response)
}


import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import type { AdminSessionData } from "@repo/types/api/admin"
import { sendSuccess } from "@/helpers/api-response/response"

/**
 * GET /api/admin/v1/auth/session
 *
 * Returns the current admin's identity, role, permissions, and scope.
 * All data already loaded by adminAuthChain — zero additional DB calls.
 *
 * The `scopes` field on the scope object carries the raw AdminUserScope rows
 * so the frontend can display country/city names and build the scope picker.
 */
export const getAdminSession: RequestHandler = (req, res) => {
  const { adminUser, adminPermissions, adminScope } = req as unknown as AdminRequest

  const fullName = [adminUser.firstName, adminUser.middleName, adminUser.lastName]
    .filter(Boolean)
    .join(" ")

  const response: AdminSessionData = {
    id         : adminUser.id,
    email      : adminUser.email,
    firstName  : adminUser.firstName,
    lastName   : adminUser.lastName,
    middleName : adminUser.middleName,
    role       : adminUser.role
      ? { name: adminUser.role.name, displayName: adminUser.role.displayName }
      : null,
    permissions: adminPermissions,
    scope      : {
      isGlobal  : adminScope.isGlobal,
      countryIds: adminScope.countryIds,
      cityIds   : adminScope.cityIds,
      // Pass raw scope rows so the frontend can render country/city names
      scopes    : adminUser.scopes.map((s) => ({
        id          : s.id,
        adminUserId : s.adminUserId,
        scopeType   : s.scopeType as "GLOBAL" | "COUNTRY" | "CITY",
        countryId   : s.countryId,
        cityId      : s.cityId,
      })),
    },
  }

  return sendSuccess(res, response)
}
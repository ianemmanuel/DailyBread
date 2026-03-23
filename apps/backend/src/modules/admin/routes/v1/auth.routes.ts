import { Router, Request, Response } from "express"
import type { AdminRequest } from "@repo/types/backend"
import type { AdminSessionData } from "@repo/types"

const authRouter: Router = Router()

/**
 * GET /api/admin/v1/auth/session
 *
 * Returns the authenticated admin's full session data.
 * Called by the admin dashboard on every page load after Clerk auth completes.
 * The response drives everything the UI renders — sidebar, actions, scope picker.
 *
 * No permission required — any authenticated active admin can call this.
 * The full middleware chain has already run by the time this executes.
 */
authRouter.get("/session", (req: Request, res: Response) => {
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

  return res.json({ status: "success", data: response })
})

export default authRouter
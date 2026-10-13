import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"
import { requirePermission } from "@/modules/admin/middleware"
import {
  handleSetOwnAvailability,
  handleSetReviewerAvailability,
  handleListUnavailableReviewers,
} from "../../controllers/admin.reviewerAvailability.controller"

/*
 * A separate router from /admin/v1/users: reviewer availability is a
 * vendor_ops concern gated by vendors:reviewers:manage_availability (scoped
 * to country/city in its service), not an identity-lifecycle action. (It was
 * first split out because /users sat behind a role-name guard; that guard is
 * gone, but the two remain different capabilities.)
 */
const reviewerRouter: Router = Router()

reviewerRouter.patch("/me/availability", handleSetOwnAvailability)

reviewerRouter.get(
  "/unavailable",
  requirePermission(AdminPermissions.VENDORS_REVIEWERS_MANAGE_AVAILABILITY),
  handleListUnavailableReviewers,
)
reviewerRouter.patch(
  "/:adminUserId/availability",
  requirePermission(AdminPermissions.VENDORS_REVIEWERS_MANAGE_AVAILABILITY),
  handleSetReviewerAvailability,
)

export default reviewerRouter

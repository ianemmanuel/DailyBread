import { Router } from "express"
import { AdminPermissions } from "@repo/types/enums"

import { requirePermission } from "@/modules/admin/middleware"
import {
  handleArchiveHeroPromotion,
  handleCreateHeroPromotion,
  handleGetHeroPromotion,
  handleListHeroPromotions,
  handlePresignHeroImage,
  handlePublishHeroPromotion,
  handleUpdateHeroPromotion,
} from "../controllers/heroPromotion.controller"

/**
 * Marketing module — admin-facing routes. Mounted at `/admin/v1/marketing`.
 *
 * RBAC IS ALREADY APPLIED HERE and needs nothing extra. `adminRouter` calls
 * `adminRouter.use(...adminAuthChain)` before mounting `/v1`, so every router
 * inside it — this one, taxAdminRouter, financeAdminRouter — runs the full
 * chain first:
 *
 *   verifyAdminToken -> loadAdminUser -> checkIsActive -> loadPermissions
 *                    -> buildScopeContext
 *
 * By the time a handler below runs, `req.adminPermissions` and `req.adminScope`
 * are populated from Postgres on THIS request. Nothing is read from the JWT, so
 * a permission or scope change takes effect on the very next request with no
 * session to revoke.
 *
 * Three permissions, not one, because they are three different kinds of trust:
 *   READ    — see what is scheduled.
 *   MANAGE  — write drafts and upload imagery.
 *   PUBLISH — make it visible to customers, or withdraw it. The only one that
 *             changes what the public sees.
 *
 * Geographic scope is enforced per call in the service, never here: a route
 * cannot know whether the body names a city the caller holds.
 */
const marketingAdminRouter: Router = Router()

const READ = requirePermission(AdminPermissions.MARKETING_PROMOTIONS_READ)
const MANAGE = requirePermission(AdminPermissions.MARKETING_PROMOTIONS_MANAGE)
const PUBLISH = requirePermission(AdminPermissions.MARKETING_PROMOTIONS_PUBLISH)

//* ─── Storefront hero promotions ──────────────────────────────────────────
marketingAdminRouter.get("/hero-promotions", READ, handleListHeroPromotions)
marketingAdminRouter.post("/hero-promotions", MANAGE, handleCreateHeroPromotion)

/* Before `/:promotionId`, or "image" would be read as an id. */
marketingAdminRouter.post("/hero-promotions/image/presign", MANAGE, handlePresignHeroImage)

marketingAdminRouter.get("/hero-promotions/:promotionId", READ, handleGetHeroPromotion)
marketingAdminRouter.patch("/hero-promotions/:promotionId", MANAGE, handleUpdateHeroPromotion)
marketingAdminRouter.post(
  "/hero-promotions/:promotionId/publish",
  PUBLISH,
  handlePublishHeroPromotion,
)
/* Withdraw, not delete — the catalog rule. History stays readable. */
marketingAdminRouter.post(
  "/hero-promotions/:promotionId/archive",
  PUBLISH,
  handleArchiveHeroPromotion,
)

export default marketingAdminRouter

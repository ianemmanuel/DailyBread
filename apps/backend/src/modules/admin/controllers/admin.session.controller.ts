import { RequestHandler } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { AdminPermissions } from "@repo/types/enums"
import { sendSuccess } from "@/helpers/api-response/response"
import { buildAdminSession } from "../services/admin.session.service"
import { hasOpenComplianceIssuesForCountries } from "../services/admin.vendor.compliance.service"
import { hasOpenAppealIssuesForCountries } from "../services/admin.vendor.appeal.service"
import { hasFlaggedProfilesForCountries } from "../services/admin.vendorProfile.service"
import { hasFlaggedMealsForCountries } from "@/modules/meals"

/**
 * GET /api/admin/v1/auth/session
 *
 * Returns the current admin's identity, role, permissions, and scope.
 * buildAdminSession itself stays a pure, zero-DB-call transform — the
 * extra queries here (cheap, indexed) power the sidebar's Compliance/
 * Appeals/Profiles/Meals nav dots, each only ever run for a country-scoped
 * admin who'd actually see that item and hold the relevant permission.
 * This endpoint is revalidated every 5 minutes on the frontend, so every
 * dot's freshness is already "subtle glow," not a live counter.
 */
export const getAdminSession: RequestHandler = async (req, res, next) => {
  try {
    const { adminUser, adminPermissions, adminScope } = req as unknown as AdminRequest
    const session = buildAdminSession(adminUser, adminPermissions, adminScope)

    if (!adminScope.isGlobal && adminScope.countryIds.length > 0) {
      const [hasCompliance, hasAppeals, hasProfiles, hasMeals] = await Promise.all([
        adminPermissions.includes(AdminPermissions.VENDORS_COMPLIANCE_READ)
          ? hasOpenComplianceIssuesForCountries(adminScope.countryIds)
          : Promise.resolve(undefined),
        adminPermissions.includes(AdminPermissions.VENDORS_APPEALS_READ)
          ? hasOpenAppealIssuesForCountries(adminScope.countryIds)
          : Promise.resolve(undefined),
        adminPermissions.includes(AdminPermissions.VENDORS_PROFILES_MODERATE)
          ? hasFlaggedProfilesForCountries(adminScope.countryIds)
          : Promise.resolve(undefined),
        // MODERATE, like profiles: the dot means "something here needs your
        // decision", which only someone who can decide should be nudged about.
        adminPermissions.includes(AdminPermissions.VENDORS_MEALS_MODERATE)
          ? hasFlaggedMealsForCountries(adminScope.countryIds)
          : Promise.resolve(undefined),
      ])
      if (hasCompliance !== undefined) session.hasOpenComplianceIssues = hasCompliance
      if (hasAppeals    !== undefined) session.hasOpenAppealIssues     = hasAppeals
      if (hasProfiles   !== undefined) session.hasFlaggedProfiles      = hasProfiles
      if (hasMeals      !== undefined) session.hasFlaggedMeals         = hasMeals
    }

    return sendSuccess(res, session)
  } catch (err) { next(err) }
}

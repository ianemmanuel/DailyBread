import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/errors/ApiError"

/*
 * Tax authorization guards — thin wrappers over the existing
 * AdminScopeContext (built by buildScopeContext). No new authorization
 * mechanism: requirePermission still gates the route, this adds only the
 * scope-tier rule on top.
 *
 * These are the tax module's OWN copy rather than an import of the finance
 * module's near-identical helpers, and that is deliberate. A module intended
 * to survive being pulled out on its own must not depend on a sibling's
 * internal lib for something this small — the admin and finance modules
 * already each carry their own for the same reason. The shared piece that IS
 * legitimately reused is resolveCountryIdInScope, which belongs to the admin
 * plane every admin route already runs inside.
 *
 * The rule split that matters:
 *   CATALOG (what distinctions the platform can express at all) — GLOBAL.
 *   RATES   (what one country charges)                          — own country.
 */

export function assertGlobalTaxScope(scope: AdminScopeContext): void {
  if (!scope.isGlobal) {
    throw new ApiError(
      403,
      "The tax-category catalog can only be changed by a globally-scoped admin",
      "TAX_SCOPE_FORBIDDEN",
    )
  }
}

export function isCountryInTaxScope(scope: AdminScopeContext, countryId: string): boolean {
  return scope.isGlobal || scope.countryIds.includes(countryId)
}

/*
 * A country's tax position is country-WIDE policy, so a city-tier admin must
 * not set it.
 *
 * assertCountryInTaxScope alone does not catch this: buildScopeContext folds a
 * CITY scope's own countryId into countryIds (so city-scoped reads stay
 * filtered to their country), which makes a city admin indistinguishable from
 * a country admin to any check reading only countryIds. The tier is what
 * separates them. Same hole, same fix, as the food-tag availability guard.
 */
export function assertCountryTaxScope(scope: AdminScopeContext, countryId: string): void {
  if (!scope.isGlobal && scope.cityIds.length > 0) {
    throw new ApiError(
      403,
      "City-scoped admins cannot set country tax policy",
      "TAX_SCOPE_FORBIDDEN",
    )
  }
  if (!isCountryInTaxScope(scope, countryId)) {
    throw new ApiError(403, "This country is outside your scope", "TAX_SCOPE_FORBIDDEN")
  }
}

import type { AdminScopeContext } from "@repo/types/backend"

import { ApiError } from "@/errors/ApiError"
import type { HeroScope } from "./heroPromotion.rules"

/*
 * Marketing authorization guards — thin wrappers over the AdminScopeContext
 * that buildScopeContext already put on the request. No new mechanism:
 * requirePermission still gates the route, and this adds the scope-tier rule
 * on top.
 *
 * The marketing module's OWN copy rather than an import of tax's or finance's
 * near-identical helpers, deliberately and for the same reason they each carry
 * their own: a module meant to survive extraction must not depend on a
 * sibling's internal lib for something this small.
 *
 * The rule follows how far the promotion REACHES:
 *
 *   GLOBAL  — every customer in every market sees it.       GLOBAL scope only.
 *   COUNTRY — every city in one country.                    Own country, and
 *                                                           NOT city tier.
 *   CITY    — one city.                                     That city, or its
 *                                                           country, or global.
 */

export function assertGlobalPromotionScope(scope: AdminScopeContext): void {
  if (!scope.isGlobal) {
    throw new ApiError(
      403,
      "A global promotion can only be set by a globally-scoped admin",
      "MARKETING_SCOPE_FORBIDDEN",
    )
  }
}

/*
 * A country promotion is country-WIDE merchandising, so a city-tier admin must
 * not set one.
 *
 * Checking countryIds alone does not catch that: buildScopeContext folds a CITY
 * scope's own countryId into countryIds (so city-scoped reads stay filtered to
 * their country), which makes a city admin indistinguishable from a country
 * admin to any check that reads only countryIds. The TIER is what separates
 * them. Same hole, same fix, as the tax and food-tag guards.
 */
export function assertCountryPromotionScope(
  scope: AdminScopeContext,
  countryId: string,
): void {
  if (!scope.isGlobal && scope.tier === "CITY") {
    throw new ApiError(
      403,
      "City-scoped admins cannot set country-wide promotions",
      "MARKETING_SCOPE_FORBIDDEN",
    )
  }
  if (!scope.isGlobal && !scope.countryIds.includes(countryId)) {
    throw new ApiError(403, "This country is outside your scope", "MARKETING_SCOPE_FORBIDDEN")
  }
}

/** A city promotion is reachable by that city's admin, by its country's admin,
 *  and by a global admin. */
export function assertCityPromotionScope(
  scope: AdminScopeContext,
  cityId: string,
  countryId: string,
): void {
  if (scope.isGlobal) return
  if (scope.cityIds.includes(cityId)) return
  if (scope.tier === "COUNTRY" && scope.countryIds.includes(countryId)) return

  throw new ApiError(403, "This city is outside your scope", "MARKETING_SCOPE_FORBIDDEN")
}

/** The one entry point: dispatches on the promotion's own reach. */
export function assertPromotionScope(
  scope: AdminScopeContext,
  promotionScope: HeroScope,
  target: { cityId: string | null; countryId: string | null },
): void {
  switch (promotionScope) {
    case "GLOBAL":
      return assertGlobalPromotionScope(scope)
    case "COUNTRY":
      return assertCountryPromotionScope(scope, target.countryId ?? "")
    case "CITY":
      return assertCityPromotionScope(scope, target.cityId ?? "", target.countryId ?? "")
  }
}

/**
 * Narrows a LIST query to what the caller may see.
 *
 * Returns a Prisma `where` fragment rather than filtering in memory: a scope
 * filter that runs after the query is one that pages wrongly and leaks counts.
 * Fail-closed — an admin with neither global scope nor any country rows sees
 * only global promotions, never everything.
 */
export function promotionScopeWhere(scope: AdminScopeContext) {
  if (scope.isGlobal) return {}

  return {
    OR: [
      { scope: "GLOBAL" as const },
      ...(scope.countryIds.length ? [{ countryId: { in: scope.countryIds } }] : []),
      ...(scope.cityIds.length ? [{ cityId: { in: scope.cityIds } }] : []),
    ],
  }
}

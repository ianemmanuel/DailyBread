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
 * Whether the caller may WRITE this promotion.
 *
 * Deliberately implemented by running the very guard that would refuse the
 * write, rather than by restating its conditions. Two expressions of one
 * authorization rule always drift, and the failure mode here is the worst kind
 * — a UI that offers an action the server then refuses, or worse, hides one it
 * would have allowed. This cannot disagree with `assertPromotionScope` because
 * it IS `assertPromotionScope`.
 *
 * Used to tell the ERP which promotions to render as editable. It is a UI
 * affordance, never the enforcement: every write path still calls the assert.
 */
export function canManagePromotion(
  scope: AdminScopeContext,
  promotionScope: HeroScope,
  target: { cityId: string | null; countryId: string | null },
): boolean {
  try {
    assertPromotionScope(scope, promotionScope, target)
    return true
  } catch {
    return false
  }
}

/*
 * READING IS NOT SCOPED, and that is a deliberate product decision (explicit
 * direction).
 *
 * Every admin holding `marketing:promotions:read` sees every promotion at
 * every scope. A hero promotion is PUBLIC marketing copy — any customer in the
 * target market can see it simply by opening the app — so there is nothing to
 * protect, and a marketing team that cannot see what the other markets are
 * running will duplicate and contradict them.
 *
 * This is why principle 6 ("opaque ids 404, never 403") does not apply here:
 * that rule exists to stop an id space being probed for the existence of
 * things a caller should not know about. Nothing here is secret, so a write
 * refused for scope now answers 403 — the honest answer — instead of
 * pretending the row does not exist.
 *
 * There was previously a `promotionScopeWhere` narrowing every list and read.
 * It was removed rather than widened: a filter that returns everything is a
 * filter the next reader has to prove is a no-op.
 */

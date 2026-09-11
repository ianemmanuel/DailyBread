import { Request, Response, NextFunction } from "express"
import type { AdminScopeContext, AdminRequest } from "@repo/types/backend"
import { AdminScopeType } from "@repo/types/enums"

/*
 * STEP 5 — Build the geographic scope context.
 *
 * Reads the admin's scope rows (loaded by loadAdminUser) and computes
 * AdminScopeContext — the object every list query uses to apply
 * geographic filtering automatically.
 *
 * Route handlers never build their own scope WHERE clauses.
 * They receive req.adminScope and pass it to scopeService helpers.
 *
 * No database call — everything needed was loaded in loadAdminUser.
 */
export function buildScopeContext(req: Request, _res: Response, next: NextFunction) {
  const { adminUser } = req as AdminRequest
  const scopes = adminUser.scopes ?? []

  const hasGlobal = scopes.some((s) => s.scopeType === AdminScopeType.GLOBAL)

  if (hasGlobal) {
    ;(req as Partial<AdminRequest>).adminScope = {
      isGlobal   : true,
      countryIds : [],
      cityIds    : [],
      tier       : "GLOBAL",
    } satisfies AdminScopeContext
    return next()
  }

  const countryIds = new Set<string>()
  const cityIds    = new Set<string>()

  for (const scope of scopes) {
    if (scope.scopeType === AdminScopeType.COUNTRY && scope.countryId) {
      countryIds.add(scope.countryId)
    }
    if (scope.scopeType === AdminScopeType.CITY && scope.cityId) {
      cityIds.add(scope.cityId)
      if (scope.countryId) countryIds.add(scope.countryId)
    }
  }

  /*
   * A CITY scope's own country is folded into countryIds above so city-scoped
   * READS stay correctly filtered to their country's data. That makes a
   * city admin indistinguishable from a country admin by countryIds alone, so
   * the tier is recorded separately — country-WIDE policy decisions gate on
   * it. Same definition as the frontend's getScopeTier.
   */
  const hasCountryScope = scopes.some((s) => s.scopeType === AdminScopeType.COUNTRY)

  ;(req as Partial<AdminRequest>).adminScope = {
    isGlobal   : false,
    countryIds : Array.from(countryIds),
    cityIds    : Array.from(cityIds),
    tier       : hasCountryScope ? "COUNTRY" : "CITY",
  } satisfies AdminScopeContext

  next()
}
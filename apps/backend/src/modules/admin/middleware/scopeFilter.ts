import { Request, Response, NextFunction } from "express"
import type { AdminScopeContext } from "@repo/types/backend"
import { AdminScopeType } from "@repo/types/enums"
 
/**
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
export function scopeFilter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const adminUser = (req as any).adminUser
  const scopes: Array<{
    scopeType : string
    countryId : string | null
    cityId    : string | null
  }> = adminUser?.scopes ?? []

  const hasGlobal = scopes.some((s) => s.scopeType === AdminScopeType.GLOBAL)

  if (hasGlobal) {
    ;(req as any).adminScope = {
      isGlobal   : true,
      countryIds : [],
      cityIds    : [],
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

  ;(req as any).adminScope = {
    isGlobal   : false,
    countryIds : Array.from(countryIds),
    cityIds    : Array.from(cityIds),
  } satisfies AdminScopeContext

  next()
}
import { Request, Response, NextFunction } from "express"
import type { AdminRequest } from "@repo/types/backend"
import { logger } from "@/lib/pino/logger"
import { deriveScopeContext, type StoredScopeRow } from "../lib/scope/single-scope"

const scopeLog = logger.child({ module: "admin-scope" })

/*
 * STEP 5 — Build the geographic scope context.
 *
 * Reads the admin's ONE scope row (loaded by loadAdminUser, with its city's
 * own country) and computes AdminScopeContext — the object every query uses
 * to apply geographic filtering.
 *
 * The rule is deriveScopeContext (lib/scope/single-scope.ts): exactly one
 * well-formed row, or no scope at all. Rows are never unioned — COUNTRY + CITY
 * used to become a country admin of BOTH countries. A malformed assignment
 * fails CLOSED (sees nothing) and is logged, so it is found and fixed rather
 * than quietly widened.
 *
 * No database call — everything needed was loaded in loadAdminUser.
 */
export function buildScopeContext(req: Request, _res: Response, next: NextFunction) {
  const { adminUser } = req as AdminRequest
  const rows = (adminUser.scopes ?? []) as unknown as Array<
    Omit<StoredScopeRow, "cityCountryId"> & { city?: { countryId: string } | null }
  >

  const { scope, valid } = deriveScopeContext(rows.map((r) => ({
    scopeType    : r.scopeType,
    countryId    : r.countryId,
    cityId       : r.cityId,
    cityCountryId: r.city?.countryId ?? null,
  })))
  if (!valid) {
    scopeLog.warn({ adminUserId: adminUser.id, rows: rows.length }, "Admin has no single well-formed scope — failing closed")
  }

  ;(req as Partial<AdminRequest>).adminScope = scope
  next()
}

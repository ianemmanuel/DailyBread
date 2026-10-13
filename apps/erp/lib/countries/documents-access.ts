import { redirect } from "next/navigation"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminSessionData } from "@repo/types/admin-app"

/*
 * Gate for /countries/[slug]/documents/** — CLAUDE.md's "Countries depth"
 * decision. Previously global-only (SETTINGS_GEOGRAPHY_WRITE + isGlobal),
 * which meant a country-scoped vendor_ops/operations_admin holding
 * SETTINGS_DOCUMENTS_READ/WRITE could never reach a page /vendors/compliance
 * already linked them to. Now accepts either:
 *   - a global admin with SETTINGS_GEOGRAPHY_WRITE (unchanged — full
 *     Countries-hierarchy access), or
 *   - a country-scoped admin holding SETTINGS_DOCUMENTS_READ, for their
 *     own country only.
 * No other /countries/[slug]/** page is affected by this — deliberately
 * scoped to the documents subtree only (see CLAUDE.md).
 *
 * Call assertDocumentsHomeAccess before fetching the country (cheap,
 * doesn't need to know which one yet); call assertCountryInDocumentsScope
 * once the country is loaded, to reject a country-scoped admin viewing a
 * country outside their own scope. Returns whether the viewer can mutate
 * (SETTINGS_DOCUMENTS_WRITE) — write access was never available to a
 * global admin lacking SETTINGS_GEOGRAPHY_WRITE, and isn't now either.
 */
export function assertDocumentsHomeAccess(session: AdminSessionData): { canWrite: boolean } {
  const isGlobalWithGeoWrite = session.scope.isGlobal && session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)
  const isCountryScopedWithDocsRead = !session.scope.isGlobal && session.permissions.includes(AdminPermissions.SETTINGS_DOCUMENTS_READ)
  if (!isGlobalWithGeoWrite && !isCountryScopedWithDocsRead) redirect("/overview")

  return { canWrite: session.permissions.includes(AdminPermissions.SETTINGS_DOCUMENTS_WRITE) }
}

export function assertCountryInDocumentsScope(session: AdminSessionData, countryId: string): void {
  if (!session.scope.isGlobal && !session.scope.countryIds.includes(countryId)) {
    redirect("/overview")
  }
}

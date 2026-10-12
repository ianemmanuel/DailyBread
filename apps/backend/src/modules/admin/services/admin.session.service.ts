import type {
  AdminUserWithRole,
  AdminScopeContext,
  AdminSessionData,
} from "@repo/types/backend"
import type { AdminPermissionKey, AdminScopeType  } from "@repo/types/enums"
import type { ScopeInvalidReason } from "@/lib/permissions/effective"

/*
 * Builds the session payload the frontend uses for page/feature gating.
 * Pure transformation — everything it needs was already loaded by
 * adminAuthChain (loadAdminUser, loadPermissions, scopeFilter).
 * Zero additional DB calls.
 */
export function buildAdminSession(
  adminUser       : AdminUserWithRole,
  adminPermissions: AdminPermissionKey[],
  adminScope      : AdminScopeContext,
  scopeValidity   : { valid: boolean; invalidReason: ScopeInvalidReason | null } = { valid: true, invalidReason: null },
): AdminSessionData {
  return {
    id        : adminUser.id,
    email     : adminUser.email,
    firstName : adminUser.firstName,
    lastName  : adminUser.lastName,
    middleName: adminUser.middleName,
    role      : adminUser.role
      ? { name: adminUser.role.name, displayName: adminUser.role.displayName }
      : null,
    // EFFECTIVE permissions — the same list every route gate checks.
    permissions: adminPermissions,
    scope: {
      valid        : scopeValidity.valid,
      invalidReason: scopeValidity.invalidReason,
      isGlobal  : adminScope.isGlobal,
      countryIds: adminScope.countryIds,
      cityIds   : adminScope.cityIds,
      tier      : adminScope.tier,
      // Raw scope rows so the frontend can render country/city names
      // and build the scope picker.
      scopes: adminUser.scopes.map((s) => ({
        id         : s.id,
        adminUserId: s.adminUserId,
        scopeType  : s.scopeType as AdminScopeType,
        countryId  : s.countryId,
        cityId     : s.cityId,
      })),
    },
  }
}
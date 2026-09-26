import { prisma, AdminUserStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { ClerkAdminStateService } from "@/lib/clerk"
import { validateScopeForRole, getDefaultScopeType } from "../lib/scope/scope-rules"
import { SYSTEM_USER_ID } from "@/constants/system"
import { env } from "@/env"
import { AdminRoleNames } from "@repo/types/enums"
import { applyAvailabilityChange, type SetAvailabilityInput } from "./admin.reviewerAvailability.service"
import type {
  AdminScopeContext,
  CreateAdminUserRequest,
  UpdateAdminUserPermissionsRequest,
  UpdateAdminUserRoleRequest,
  UpdateAdminUserScopesRequest,
  ScopeEntry,
} from "@repo/types/backend"

// Re-exported so anything currently importing ScopeEntry from this
// file keeps working — the type itself now lives in @repo/types/backend.
export type { ScopeEntry } from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-user-service" })

/**
 * Matches what's passed to Clerk's createInvitation (expiresInDays)
 * explicitly, rather than relying on Clerk's own default (also 30
 * days, but silent) — so our tracked invitationExpiresAt always
 * agrees with what Clerk actually enforces.
 */
const INVITATION_EXPIRY_DAYS = 30

export function formatDisplayName(user: {
  firstName : string
  middleName?: string | null
  lastName  : string
}): string {
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
}

export async function createAdminUser(
  input: CreateAdminUserRequest,
  actorId: string,
  actorScope: AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const {
    firstName,
    middleName,
    lastName,
    email,
    employeeId,
    roleId,
    permissionKeys: rawPermissionKeys,
    scopes,
  } = input

  const permissionKeys = rawPermissionKeys ?? []
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
  })
  if (existing) {
    throw new ApiError(
      409,
      "An admin user with this email already exists",
      "DUPLICATE_EMAIL",
    )
  }

  if (employeeId) {
    const existingEmployee = await prisma.adminUser.findFirst({
      where: { employeeId },
    })

    if (existingEmployee) {
      throw new ApiError(
        409,
        "An admin user with this employee ID already exists",
        "DUPLICATE_EMPLOYEE_ID",
      )
    }
  }

  const role = await prisma.adminRole.findUnique({
    where: { id: roleId },
  })

  if (!role) {
    throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")
  }

  if (role.name === "system" || role.name === AdminRoleNames.SUPER_ADMIN) {
    throw new ApiError(400, "This role cannot be assigned through admin user management", "INVALID_ROLE")
  }

  if (permissionKeys.length > 0) {
    await validatePermissionsInRolePool(roleId, permissionKeys)
  }

  const resolvedScopes = resolveScopes(scopes, actorScope, role.name)

  // Validate scope-role compatibility
  validateScopeForRole(
    role.name,
    resolvedScopes.map((s) => s.scopeType),
  )

  // Scope guard: actor can only create users within their own scope
  assertScopeCanManage(actorScope, resolvedScopes, actorRoleName)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        firstName,
        middleName: middleName ?? null,
        lastName,
        email: normalizedEmail,
        employeeId: employeeId ?? null,
        roleId,
        status: AdminUserStatus.pending,
        isActive: false,
        invitedById: actorId,
      },
    })

    if (permissionKeys.length > 0) {
      const permissions = await tx.adminPermission.findMany({
        where: {
          key: { in: permissionKeys },
          isActive: true,
        },
      })

      await tx.adminUserPermission.createMany({
        data: permissions.map((p) => ({
          adminUserId: created.id,
          permissionId: p.id,
          grantedById: actorId,
        })),
      })
    }

    await tx.adminUserScope.createMany({
      data: resolvedScopes.map((s) => ({
        adminUserId: created.id,
        scopeType: s.scopeType,
        countryId: s.countryId ?? null,
        cityId: s.cityId ?? null,
      })),
    })

    return created
  })

  serviceLog.info(
    {
      adminUserId: user.id,
      email: normalizedEmail,
      actorId,
    },
    "Admin user created",
  )

  auditService.log({
    adminUserId: actorId,
    action: "admin_user.created",
    entityType: "AdminUser",
    entityId: user.id,
    changes: {
      after: {
        email: normalizedEmail,
        displayName: formatDisplayName({
          firstName,
          middleName,
          lastName,
        }),
        roleId,
        status: "pending",
        scopes: resolvedScopes,
      },
    },
    metadata: {
      permissionCount: permissionKeys.length,
    },
  })

  return user
}

//* ─── Send invitation ─────────────

export async function sendAdminInvitation(
  adminUserId: string,
  actorId    : string,
  actorScope : AdminScopeContext,
  actorRoleName: string | undefined,
) {
  // Optional at startup (see env.ts) since it's only this one admin-only
  // feature — but genuinely required to actually send an invitation.
  if (!env.CLERK_ADMIN_INVITE_REDIRECT_URL) {
    throw new ApiError(500, "Admin invitations are not configured on this environment", "INVITE_NOT_CONFIGURED")
  }

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope, actorRoleName)

  if (adminUser.status !== AdminUserStatus.pending && adminUser.status !== AdminUserStatus.invited) {
    throw new ApiError(400, `Cannot send invitation to a user with status: ${adminUser.status}`, "INVALID_STATUS")
  }

  const displayName = formatDisplayName({
    firstName : adminUser.firstName,
    middleName: adminUser.middleName,
    lastName  : adminUser.lastName,
  })

  try {
    await ClerkAdminStateService.createInvitation({
      emailAddress : adminUser.email,
      redirectUrl  : env.CLERK_ADMIN_INVITE_REDIRECT_URL,
      expiresInDays: INVITATION_EXPIRY_DAYS,
      publicMetadata: {
        adminUserId     : adminUser.id,
        role            : adminUser.role?.name ?? "",
        roleDisplayName : adminUser.role?.displayName ?? "",
        displayName,
        inviteMessage: adminUser.role
          ? `You've been invited to join DailyBread Admin as ${adminUser.role.displayName}.`
          : "You've been invited to join DailyBread Admin.",
      },
    })
  } catch (err) {
    serviceLog.error({ err, adminUserId }, "Clerk invitation failed")
    throw new ApiError(502, `Failed to send Clerk invitation: ${(err as Error).message}`, "CLERK_ERROR")
  }

  const invitationExpiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status              : AdminUserStatus.invited,
      invitationSentAt    : new Date(),
      invitationExpiresAt,
      invitationSentCount : { increment: 1 },
    },
  })

  serviceLog.info({ adminUserId, actorId }, "Invitation sent")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.invited",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { status: adminUser.status },
      after : { status: "invited" },
    },
    metadata: { invitationSentCount: adminUser.invitationSentCount + 1, role: adminUser.role?.name },
  })

  return { success: true }
}

//* Update permissions

export async function updateAdminUserPermissions(
  input     : UpdateAdminUserPermissionsRequest,
  actorId   : string,
  actorScope: AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const { adminUserId, permissionKeys } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, permissions: { include: { permission: true } }, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  if (!adminUser.roleId) throw new ApiError(400, "User has no role assigned", "NO_ROLE")

  assertUserWithinActorScope(adminUser.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "modify the permissions on")
  assertTargetNotSuperAdmin(adminUser.role?.name, "modified")

  if (permissionKeys.length > 0) await validatePermissionsInRolePool(adminUser.roleId, permissionKeys)

  const previousKeys = adminUser.permissions.map((p) => p.permission.key)

  const permissions = await prisma.adminPermission.findMany({
    where: { key: { in: permissionKeys }, isActive: true },
  })

  await prisma.$transaction([
    prisma.adminUserPermission.deleteMany({ where: { adminUserId } }),
    prisma.adminUserPermission.createMany({
      data: permissions.map((p) => ({
        adminUserId,
        permissionId: p.id,
        grantedById : actorId,
      })),
    }),
  ])

  serviceLog.info({ adminUserId, actorId, permissionCount: permissions.length }, "Permissions updated")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.permissions_updated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { permissions: previousKeys },
      after : { permissions: permissionKeys },
    },
  })

  return { updated: permissions.length }
}

//* Update role
//
// IMPORTANT: Changing a user's role CLEARS all their existing permission grants.
// Reason: permissions are valid only within a role's pool (ceiling).
// If the new role has a different pool, old grants may reference permissions
// that don't exist in the new pool — a security risk and data inconsistency.
//
// The actor must explicitly re-grant permissions from the new role's pool
// after the role change. The frontend shows this clearly on the review page.

export async function updateAdminUserRole(
  input     : UpdateAdminUserRoleRequest,
  actorId   : string,
  actorScope: AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const { adminUserId, roleId } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: {
      role       : true,
      scopes     : true,
      permissions: { include: { permission: true } },
    },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "change the role of")
  assertTargetNotSuperAdmin(adminUser.role?.name, "role-changed")

  const newRole = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!newRole) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")
  if (newRole.name === "system" || newRole.name === AdminRoleNames.SUPER_ADMIN) {
    throw new ApiError(400, "This role cannot be assigned through admin user management", "INVALID_ROLE")
  }

  // Validate existing scopes are compatible with the new role
  const currentScopeTypes = adminUser.scopes.map((s) => s.scopeType as "GLOBAL" | "COUNTRY" | "CITY")
  if (currentScopeTypes.length > 0) {
    try {
      validateScopeForRole(newRole.name, currentScopeTypes)
    } catch {
      throw new ApiError(
        400,
        `This user's current scope is not compatible with the '${newRole.displayName}' role. ` +
        `Update their scope first, then change the role.`,
        "SCOPE_ROLE_MISMATCH",
      )
    }
  }

  const clearedPermissions = adminUser.permissions.map((p) => p.permission.key)

  // Role change transaction: update role AND clear all permission grants
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: adminUserId }, data: { roleId } }),
    // Clear permissions — they belonged to the old role's pool
    prisma.adminUserPermission.deleteMany({ where: { adminUserId } }),
  ])

  serviceLog.info(
    { adminUserId, actorId, fromRole: adminUser.role?.name, toRole: newRole.name },
    "Role updated — permissions cleared",
  )

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.role_updated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { roleId: adminUser.roleId, roleName: adminUser.role?.name, permissions: clearedPermissions },
      after : { roleId, roleName: newRole.name, permissions: [] },
    },
    metadata: {
      note: "All permission grants cleared. Re-grant from new role pool.",
    },
  })

  return {
    success           : true,
    permissionsCleaned: clearedPermissions.length,
    note              : "All permission grants were cleared. Please re-assign permissions from the new role pool.",
  }
}

//* ─── Update scopes ───────────────────

export async function updateAdminUserScopes(
  input     : UpdateAdminUserScopesRequest,
  actorId   : string,
  actorScope: AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const { adminUserId, scopes } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "change the scope of")
  assertTargetNotSuperAdmin(adminUser.role?.name, "re-scoped")

  const assigningGlobal = scopes.some((s) => s.scopeType === "GLOBAL")
  if (assigningGlobal && !actorScope.isGlobal) {
    throw new ApiError(403, "Only globally-scoped admins can assign GLOBAL scope", "SCOPE_FORBIDDEN")
  }

  // Validate new scopes are compatible with the user's current role
  if (adminUser.role) {
    validateScopeForRole(adminUser.role.name, scopes.map((s) => s.scopeType))
  }

  const previousScopes = adminUser.scopes.map((s) => ({
    scopeType: s.scopeType, countryId: s.countryId, cityId: s.cityId,
  }))

  await prisma.$transaction([
    prisma.adminUserScope.deleteMany({ where: { adminUserId } }),
    prisma.adminUserScope.createMany({
      data: scopes.map((s) => ({
        adminUserId,
        scopeType: s.scopeType,
        countryId: s.countryId ?? null,
        cityId   : s.cityId    ?? null,
      })),
    }),
  ])

  serviceLog.info({ adminUserId, actorId }, "Scopes updated")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.scopes_updated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : { before: { scopes: previousScopes }, after: { scopes } },
  })

  return { success: true }
}

// ─── Suspend, Reinstate, Deactivate ──────────────────────────────────────────

export async function suspendAdminUser(
  adminUserId: string, reason: string, actorId: string, actorScope: AdminScopeContext, actorRoleName: string | undefined,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true, role: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "suspend")
  assertTargetNotSuperAdmin(user.role?.name, "suspended")
  if (user.status === AdminUserStatus.suspended) throw new ApiError(400, "Already suspended", "ALREADY_SUSPENDED")
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Cannot suspend deactivated user", "INVALID_STATUS")
  if (user.status === AdminUserStatus.pending || user.status === AdminUserStatus.invited)
    throw new ApiError(400, "Cannot suspend a user who has not activated their account", "INVALID_STATUS")
  if (user.externalAuthId) {
    try { await ClerkAdminStateService.banUser(user.externalAuthId) }
    catch (err) { throw new ApiError(502, `Clerk ban failed: ${(err as Error).message}`, "CLERK_ERROR") }
  }
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.suspended, isActive: false, deactivationReason: reason } })
  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user suspended")
  auditService.log({ adminUserId: actorId, action: "admin_user.suspended", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: user.status }, after: { status: "suspended" } }, metadata: { reason } })
  return { success: true }
}

export async function reinstateAdminUser(
  adminUserId: string, actorId: string, actorScope: AdminScopeContext, actorRoleName: string | undefined,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true, role: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope, actorRoleName)
  // Defensive — you can never actually be suspended by yourself (suspendAdminUser
  // blocks self-suspension) and a super_admin can never reach `suspended` at all
  // (suspendAdminUser blocks that target too), so both of these should be
  // unreachable in practice. Guarded anyway for consistency/defence-in-depth.
  assertNotActingOnSelf(actorId, adminUserId, "reinstate")
  assertTargetNotSuperAdmin(user.role?.name, "reinstated")
  if (user.status !== AdminUserStatus.suspended) throw new ApiError(400, "Only suspended users can be reinstated", "INVALID_STATUS")
  if (user.externalAuthId) {
    try { await ClerkAdminStateService.unbanUser(user.externalAuthId) }
    catch (err) { throw new ApiError(502, `Clerk unban failed: ${(err as Error).message}`, "CLERK_ERROR") }
  }
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.active, isActive: true, deactivationReason: null } })
  serviceLog.info({ adminUserId, actorId }, "Admin user reinstated")
  auditService.log({ adminUserId: actorId, action: "admin_user.reinstated", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: "suspended" }, after: { status: "active" } } })
  return { success: true }
}

export async function deactivateAdminUser(
  adminUserId: string, reason: string, actorId: string, actorScope: AdminScopeContext, actorRoleName: string | undefined,
) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { scopes: true, role: true, permissions: { include: { permission: true } } },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "deactivate")
  assertTargetNotSuperAdmin(user.role?.name, "deactivated")
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Already deactivated", "ALREADY_DEACTIVATED")
  if (user.externalAuthId) {
    try { await ClerkAdminStateService.deleteUser(user.externalAuthId) }
    catch (err) { serviceLog.error({ err, adminUserId }, "Clerk deletion failed — continuing with DB deactivation") }
  }
  const clearedPermissions = user.permissions.map((p) => p.permission.key)
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.deactivated, isActive: false, deactivatedAt: new Date(), deactivationReason: reason, externalAuthId: null } }),
    // A deactivated admin retains their DB record (offboarding, not deletion)
    // but must hold no live permission grants — re-granted on re-invite if
    // the account is ever reactivated.
    prisma.adminUserPermission.deleteMany({ where: { adminUserId } }),
  ])
  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user deactivated")
  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.deactivated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { status: user.status, externalAuthId: user.externalAuthId, permissions: clearedPermissions },
      after : { status: "deactivated", externalAuthId: null, permissions: [] },
    },
    metadata: { reason, permissionsCleared: clearedPermissions.length },
  })
  return { success: true }
}

//* Read queries 

export async function getAdminUser(adminUserId: string, actorScope: AdminScopeContext, actorRoleName: string | undefined) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: {
      role       : true,
      permissions: { include: { permission: true } },
      scopes     : { include: { country: { select: { id: true, name: true, code: true } }, city: { select: { id: true, name: true } } } },
      invitedBy  : { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope, actorRoleName)
  return user
}

export async function listAdminUsers(
  filters: { status?: string; roleId?: string; search?: string; countryId?: string; page?: number; pageSize?: number },
  actorScope: AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const { status, roleId, search, countryId, page = 1, pageSize = 20 } = filters

  const scopeFilter  = buildScopeFilter(actorScope, actorRoleName)
  const countryScoped = !actorHasFullAccess(actorScope)
  const scopesInclude  = { include: { country: { select: { id: true, name: true, code: true } } } } as const

  const where: any = {
    ...scopeFilter,
    ...(status ? { status } : {}),
    ...(roleId ? { roleId } : {}),
    ...(countryId ? { scopes: { some: { countryId } } } : {}),
    ...(search ? {
      OR: [
        { email    : { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName : { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  // A country-scoped actor's DB filter (buildScopeFilter) only narrows to
  // "has a scope row in one of my countries" — it can't express "is scoped
  // to exactly one country, and it's mine" in a single Prisma where clause.
  // So for a country-scoped actor we over-fetch a bounded page.pageSize
  // window and post-filter to scopeClassOf === SINGLE_COUNTRY here, same
  // hierarchy rule enforced by assertUserWithinActorScope. Global actors
  // (full access) skip this — no post-filtering, no page-size distortion.
  if (!countryScoped) {
    const skip = (page - 1) * pageSize
    const [users, total] = await Promise.all([
      prisma.adminUser.findMany({ where, skip, take: pageSize, orderBy: { createdAt: "desc" }, include: { role: true, scopes: scopesInclude } }),
      prisma.adminUser.count({ where }),
    ])
    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  const actorCountries = new Set(actorScope.countryIds)
  const allCandidates = await prisma.adminUser.findMany({
    where, orderBy: { createdAt: "desc" }, include: { role: true, scopes: scopesInclude },
  })
  const inScope = allCandidates.filter((u) => {
    const cls = scopeClassOf(u.scopes)
    if (cls !== "SINGLE_COUNTRY") return false
    const [country] = u.scopes.filter((s) => s.countryId).map((s) => s.countryId!)
    return !!country && actorCountries.has(country)
  })

  const total = inScope.length
  const skip  = (page - 1) * pageSize
  const users = inScope.slice(skip, skip + pageSize)

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getRolePermissionPool(roleId: string) {
  const pool = await prisma.adminRolePermission.findMany({
    where  : { roleId },
    include: { permission: true },
    orderBy: { permission: { module: "asc" } },
  })
  return pool.map((rp) => rp.permission)
}

export async function listRoles() {
  return prisma.adminRole.findMany({
    where  : { name: { not: "system" } },
    orderBy: { name: "asc" },
  })
}

//* Scope helpers

function resolveScopes(
  requested : ScopeEntry[] | undefined,
  actorScope: AdminScopeContext,
  roleName  : string,
): ScopeEntry[] {
  if (requested && requested.length > 0) return requested

  // Derive sensible default from role rules
  const defaultScopeType = getDefaultScopeType(roleName)

  if (defaultScopeType === "GLOBAL" || actorScope.isGlobal) {
    return [{ scopeType: "GLOBAL" }]
  }

  return actorScope.countryIds.map((countryId) => ({
    scopeType: "COUNTRY" as const,
    countryId,
  }))
}

/*
 * Any globally-scoped actor (super_admin, or a globally-scoped
 * identity_admin) gets full, unrestricted access to admins in every
 * country — per explicit product direction: until regional
 * (multi-country) identity admins exist, a global identity_admin is the
 * stand-in for "manage admins across all countries." Only super_admin
 * and identity_admin ever reach this module (requireIdentityAccess), and
 * only they can hold isGlobal, so no further role check is needed here.
 *
 * When regional identity admins ship, this is where a global
 * identity_admin's access would be narrowed back down (e.g. to
 * read-only across countries it doesn't directly own).
 */
export function actorHasFullAccess(actorScope: AdminScopeContext): boolean {
  return actorScope.isGlobal
}

/*
 * Classifies a set of scope rows so a country-scoped actor's hierarchy
 * check can tell "one of my countries" apart from "spans multiple
 * countries" or "global" — a country-scoped identity_admin may only
 * touch admins who are scoped to exactly one country, and it must be
 * their own. Multi-country and global targets are entirely off-limits
 * to a country-scoped actor, regardless of whether one of the target's
 * countries happens to match.
 */
export function scopeClassOf(
  scopes: Array<{ scopeType: string; countryId: string | null }>,
): "GLOBAL" | "MULTI_COUNTRY" | "SINGLE_COUNTRY" {
  if (scopes.some((s) => s.scopeType === "GLOBAL")) return "GLOBAL"
  const countries = new Set(scopes.filter((s) => s.countryId).map((s) => s.countryId))
  return countries.size > 1 ? "MULTI_COUNTRY" : "SINGLE_COUNTRY"
}

/*
 * Resolves the set of AdminUser ids a given actor is allowed to manage,
 * per the same hierarchy rules as assertUserWithinActorScope/buildScopeFilter.
 * Returns null for a full-access actor (no restriction needed) — callers
 * should treat null as "don't filter" rather than "empty set."
 *
 * Used by the audit log module, which needs the same "which admins can
 * this actor see" answer but as a plain id list (AuditLog.entityId has no
 * real FK relation to AdminUser — it's a generic string shared across
 * every module's audit events).
 */
export async function getManageableAdminUserIds(actorScope: AdminScopeContext): Promise<string[] | null> {
  if (actorHasFullAccess(actorScope)) return null

  const candidates = await prisma.adminUser.findMany({
    where : buildScopeFilter(actorScope, undefined),
    select: { id: true, scopes: { select: { scopeType: true, countryId: true } } },
  })
  const actorCountries = new Set(actorScope.countryIds)
  return candidates
    .filter((u) => {
      if (scopeClassOf(u.scopes) !== "SINGLE_COUNTRY") return false
      const [country] = u.scopes.filter((s) => s.countryId).map((s) => s.countryId!)
      return !!country && actorCountries.has(country)
    })
    .map((u) => u.id)
}

function assertScopeCanManage(
  actorScope   : AdminScopeContext,
  targetScopes : ScopeEntry[],
  actorRoleName: string | undefined,
): void {
  if (actorHasFullAccess(actorScope)) return

  if (targetScopes.some((s) => s.scopeType === "GLOBAL")) {
    throw new ApiError(403, "Only globally-scoped admins can create globally-scoped users", "SCOPE_FORBIDDEN")
  }
  const targetCountries = new Set(targetScopes.filter((s) => s.countryId).map((s) => s.countryId))
  if (targetCountries.size > 1) {
    throw new ApiError(403, "You cannot assign scopes spanning more than one country", "SCOPE_FORBIDDEN")
  }
  const actorCountries = new Set(actorScope.countryIds)
  const outOfScope = targetScopes.filter((s) => s.countryId && !actorCountries.has(s.countryId))
  if (outOfScope.length > 0) {
    throw new ApiError(403, "You cannot assign scopes outside your own country scope", "SCOPE_FORBIDDEN")
  }
}

function assertUserWithinActorScope(
  userScopes   : Array<{ scopeType: string; countryId: string | null }>,
  actorScope   : AdminScopeContext,
  actorRoleName: string | undefined,
): void {
  if (actorHasFullAccess(actorScope)) return

  const targetClass = scopeClassOf(userScopes)
  if (targetClass !== "SINGLE_COUNTRY") {
    throw new ApiError(403, "This user is outside your scope", "SCOPE_FORBIDDEN")
  }
  const actorCountries = new Set(actorScope.countryIds)
  const [userCountry]  = userScopes.filter((s) => s.countryId).map((s) => s.countryId!)
  if (!userCountry || !actorCountries.has(userCountry)) {
    throw new ApiError(403, "This user is outside your scope", "SCOPE_FORBIDDEN")
  }
}

function buildScopeFilter(actorScope: AdminScopeContext, actorRoleName: string | undefined): object {
  if (actorHasFullAccess(actorScope)) return { id: { not: SYSTEM_USER_ID } }
  return { id: { not: SYSTEM_USER_ID }, scopes: { some: { countryId: { in: actorScope.countryIds } } } }
}

/*
 * Enterprise lockout/abuse safeguard — applied regardless of the actor's
 * own role, including super_admin acting on another super_admin. These
 * two rules exist independently of the scope hierarchy above: a global
 * actor's "full access" never overrides them.
 */
function assertNotActingOnSelf(actorId: string, targetId: string, verb: string): void {
  if (actorId === targetId) {
    throw new ApiError(403, `You cannot ${verb} your own account`, "SELF_ACTION_FORBIDDEN")
  }
}

function assertTargetNotSuperAdmin(targetRoleName: string | null | undefined, verb: string): void {
  if (targetRoleName === AdminRoleNames.SUPER_ADMIN) {
    throw new ApiError(403, `Super admin accounts cannot be ${verb}`, "SUPER_ADMIN_PROTECTED")
  }
}

async function validatePermissionsInRolePool(roleId: string, permissionKeys: string[]) {
  const rolePermissions = await prisma.adminRolePermission.findMany({
    where: { roleId }, include: { permission: true },
  })
  const poolKeys  = new Set(rolePermissions.map((rp) => rp.permission.key))
  const outOfPool = permissionKeys.filter((k) => !poolKeys.has(k))
  if (outOfPool.length > 0) {
    throw new ApiError(400, `These permissions are not in this role's pool: ${outOfPool.join(", ")}`, "PERMISSIONS_OUT_OF_POOL")
  }
}

//* ─── Availability (Identity & Access-managed) ───────────────────────────────
//
// A vendor_ops reviewer can already set their OWN availability, or have a
// privileged vendor_ops peer set it, via admin.reviewerAvailability.service.ts
// (gated by vendors:reviewers:manage_availability, scoped to country/city
// only). This is the identity-module counterpart: any admin, managed by
// super_admin/identity_admin, through the same full hierarchy rules as
// suspend/deactivate. Both paths write through the same applyAvailabilityChange
// so the schema fields and audit event shape never diverge.

export async function setAdminUserAvailability(
  adminUserId: string,
  input      : SetAvailabilityInput,
  actorId    : string,
  actorScope : AdminScopeContext,
  actorRoleName: string | undefined,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true, role: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope, actorRoleName)
  assertNotActingOnSelf(actorId, adminUserId, "change the availability of")
  assertTargetNotSuperAdmin(user.role?.name, "marked unavailable")
  if (
    user.status === AdminUserStatus.pending ||
    user.status === AdminUserStatus.invited ||
    user.status === AdminUserStatus.deactivated
  ) {
    throw new ApiError(400, `Cannot change availability for a user with status: ${user.status}`, "INVALID_STATUS")
  }

  return applyAvailabilityChange(adminUserId, input, actorId, false)
}
import { createClerkClient } from "@clerk/backend"
import { prisma, AdminUserStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/modules/admin/services/admin.audit.service"
import { validateScopeForRole, getDefaultScopeType } from "@/lib/scope/scope-rules"
import type { AdminScopeContext }  from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-user-service" })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

interface CreateAdminUserInput {
  firstName      : string
  middleName?    : string
  lastName       : string
  email          : string
  employeeId?    : string
  roleId         : string
  permissionKeys : string[]
  scopes?        : ScopeEntry[]
}

interface UpdateAdminUserPermissionsInput {
  adminUserId    : string
  permissionKeys : string[]
}

interface UpdateAdminUserRoleInput {
  adminUserId : string
  roleId      : string
}

interface UpdateAdminUserScopesInput {
  adminUserId : string
  scopes      : ScopeEntry[]
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatDisplayName(user: {
  firstName : string
  middleName?: string | null
  lastName  : string
}): string {
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
}

function getAdminClerkClient() {
  const secretKey = process.env.CLERK_ADMIN_SECRET_KEY
  if (!secretKey) throw new ApiError(500, "CLERK_ADMIN_SECRET_KEY is not configured", "CLERK_MISCONFIGURED")
  return createClerkClient({ secretKey })
}

//* ─── Create ─────────────────

export async function createAdminUser(
  input     : CreateAdminUserInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { firstName, middleName, lastName, email, employeeId, roleId, permissionKeys, scopes } = input
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } })
  if (existing) throw new ApiError(409, "An admin user with this email already exists", "DUPLICATE_EMAIL")

  if (employeeId) {
    const existingEmployee = await prisma.adminUser.findFirst({ where: { employeeId } })
    if (existingEmployee) throw new ApiError(409, "An admin user with this employee ID already exists", "DUPLICATE_EMPLOYEE_ID")
  }

  const role = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!role) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")
  if (role.name === "system") throw new ApiError(400, "Cannot assign the system role", "INVALID_ROLE")

  if (permissionKeys.length > 0) await validatePermissionsInRolePool(roleId, permissionKeys)

  const resolvedScopes = resolveScopes(scopes, actorScope, role.name)

  // Validate scope-role compatibility
  validateScopeForRole(role.name, resolvedScopes.map((s) => s.scopeType))

  // Scope guard: actor can only create users within their own scope
  assertScopeCanManage(actorScope, resolvedScopes)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        firstName,
        middleName : middleName ?? null,
        lastName,
        email      : normalizedEmail,
        employeeId : employeeId ?? null,
        roleId,
        status     : AdminUserStatus.pending,
        isActive   : false,
        invitedById: actorId,
      },
    })

    if (permissionKeys.length > 0) {
      const permissions = await tx.adminPermission.findMany({
        where: { key: { in: permissionKeys }, isActive: true },
      })
      await tx.adminUserPermission.createMany({
        data: permissions.map((p) => ({
          adminUserId : created.id,
          permissionId: p.id,
          grantedById : actorId,
        })),
      })
    }

    await tx.adminUserScope.createMany({
      data: resolvedScopes.map((s) => ({
        adminUserId: created.id,
        scopeType  : s.scopeType,
        countryId  : s.countryId ?? null,
        cityId     : s.cityId    ?? null,
      })),
    })

    return created
  })

  serviceLog.info({ adminUserId: user.id, email: normalizedEmail, actorId }, "Admin user created")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.created",
    entityType : "AdminUser",
    entityId   : user.id,
    changes    : {
      after: {
        email      : normalizedEmail,
        displayName: formatDisplayName({ firstName, middleName, lastName }),
        roleId,
        status     : "pending",
        scopes     : resolvedScopes,
      },
    },
    metadata: { permissionCount: permissionKeys.length },
  })

  return user
}

//* ─── Send invitation ─────────────

export async function sendAdminInvitation(
  adminUserId: string,
  actorId    : string,
  actorScope : AdminScopeContext,
) {
  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope)

  if (adminUser.status !== AdminUserStatus.pending && adminUser.status !== AdminUserStatus.invited) {
    throw new ApiError(400, `Cannot send invitation to a user with status: ${adminUser.status}`, "INVALID_STATUS")
  }

  const displayName = formatDisplayName({
    firstName : adminUser.firstName,
    middleName: adminUser.middleName,
    lastName  : adminUser.lastName,
  })

  const clerk = getAdminClerkClient()

  try {
    await clerk.invitations.createInvitation({
      emailAddress: adminUser.email,
      redirectUrl : process.env.CLERK_ADMIN_INVITE_REDIRECT_URL,
      publicMetadata: {
        adminUserId     : adminUser.id,
        role            : adminUser.role?.name ?? "",
        roleDisplayName : adminUser.role?.displayName ?? "",
        displayName,
        inviteMessage: adminUser.role
          ? `You've been invited to join DailyBread Admin as ${adminUser.role.displayName}.`
          : "You've been invited to join DailyBread Admin.",
      },
      notify: true,
    })
  } catch (err) {
    serviceLog.error({ err, adminUserId }, "Clerk invitation failed")
    throw new ApiError(502, `Failed to send Clerk invitation: ${(err as Error).message}`, "CLERK_ERROR")
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status              : AdminUserStatus.invited,
      invitationSentAt    : new Date(),
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

//* ─── Update permissions ─────────────

export async function updateAdminUserPermissions(
  input     : UpdateAdminUserPermissionsInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { adminUserId, permissionKeys } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, permissions: { include: { permission: true } }, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  if (!adminUser.roleId) throw new ApiError(400, "User has no role assigned", "NO_ROLE")

  assertUserWithinActorScope(adminUser.scopes, actorScope)

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

//* ─── Update role ────────────────
//
// IMPORTANT: Changing a user's role CLEARS all their existing permission grants.
// Reason: permissions are valid only within a role's pool (ceiling).
// If the new role has a different pool, old grants may reference permissions
// that don't exist in the new pool — a security risk and data inconsistency.
//
// The actor must explicitly re-grant permissions from the new role's pool
// after the role change. The frontend shows this clearly on the review page.

export async function updateAdminUserRole(
  input     : UpdateAdminUserRoleInput,
  actorId   : string,
  actorScope: AdminScopeContext,
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

  assertUserWithinActorScope(adminUser.scopes, actorScope)

  const newRole = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!newRole) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")
  if (newRole.name === "system") throw new ApiError(400, "Cannot assign the system role", "INVALID_ROLE")

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
  input     : UpdateAdminUserScopesInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { adminUserId, scopes } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope)

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
// (unchanged from previous version — omitted for brevity but must remain in file)

export async function suspendAdminUser(
  adminUserId: string, reason: string, actorId: string, actorScope: AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope)
  if (user.status === AdminUserStatus.suspended) throw new ApiError(400, "Already suspended", "ALREADY_SUSPENDED")
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Cannot suspend deactivated user", "INVALID_STATUS")
  if (user.status === AdminUserStatus.pending || user.status === AdminUserStatus.invited)
    throw new ApiError(400, "Cannot suspend a user who has not activated their account", "INVALID_STATUS")
  if (user.clerkUserId) {
    try { await getAdminClerkClient().users.banUser(user.clerkUserId) }
    catch (err) { throw new ApiError(502, `Clerk ban failed: ${(err as Error).message}`, "CLERK_ERROR") }
  }
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.suspended, isActive: false, deactivationReason: reason } })
  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user suspended")
  auditService.log({ adminUserId: actorId, action: "admin_user.suspended", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: user.status }, after: { status: "suspended" } }, metadata: { reason } })
  return { success: true }
}

export async function reinstateAdminUser(
  adminUserId: string, actorId: string, actorScope: AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope)
  if (user.status !== AdminUserStatus.suspended) throw new ApiError(400, "Only suspended users can be reinstated", "INVALID_STATUS")
  if (user.clerkUserId) {
    try { await getAdminClerkClient().users.unbanUser(user.clerkUserId) }
    catch (err) { throw new ApiError(502, `Clerk unban failed: ${(err as Error).message}`, "CLERK_ERROR") }
  }
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.active, isActive: true, deactivationReason: null } })
  serviceLog.info({ adminUserId, actorId }, "Admin user reinstated")
  auditService.log({ adminUserId: actorId, action: "admin_user.reinstated", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: "suspended" }, after: { status: "active" } } })
  return { success: true }
}

export async function deactivateAdminUser(
  adminUserId: string, reason: string, actorId: string, actorScope: AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { scopes: true } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertUserWithinActorScope(user.scopes, actorScope)
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Already deactivated", "ALREADY_DEACTIVATED")
  if (user.clerkUserId) {
    try { await getAdminClerkClient().users.deleteUser(user.clerkUserId) }
    catch (err) { serviceLog.error({ err, adminUserId }, "Clerk deletion failed — continuing with DB deactivation") }
  }
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.deactivated, isActive: false, deactivatedAt: new Date(), deactivationReason: reason, clerkUserId: null } })
  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user deactivated")
  auditService.log({ adminUserId: actorId, action: "admin_user.deactivated", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: user.status, clerkUserId: user.clerkUserId }, after: { status: "deactivated", clerkUserId: null } }, metadata: { reason } })
  return { success: true }
}

// ─── Read queries ──────────────────────────────────────────────────────────────

export async function getAdminUser(adminUserId: string, actorScope: AdminScopeContext) {
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
  assertUserWithinActorScope(user.scopes, actorScope)
  return user
}

export async function listAdminUsers(
  filters: { status?: string; roleId?: string; search?: string; page?: number; pageSize?: number },
  actorScope: AdminScopeContext,
) {
  const { status, roleId, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  const scopeFilter = buildScopeFilter(actorScope)
  const where: any = {
    ...scopeFilter,
    ...(status ? { status } : {}),
    ...(roleId ? { roleId } : {}),
    ...(search ? {
      OR: [
        { email    : { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName : { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.adminUser.findMany({ where, skip, take: pageSize, orderBy: { createdAt: "desc" }, include: { role: true, scopes: true } }),
    prisma.adminUser.count({ where }),
  ])

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

// ─── Scope helpers ────────────────────────────────────────────────────────────

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

function assertScopeCanManage(
  actorScope  : AdminScopeContext,
  targetScopes: ScopeEntry[],
): void {
  if (actorScope.isGlobal) return
  const actorCountries = new Set(actorScope.countryIds)
  if (targetScopes.some((s) => s.scopeType === "GLOBAL")) {
    throw new ApiError(403, "Only globally-scoped admins can create globally-scoped users", "SCOPE_FORBIDDEN")
  }
  const outOfScope = targetScopes.filter((s) => s.countryId && !actorCountries.has(s.countryId))
  if (outOfScope.length > 0) {
    throw new ApiError(403, "You cannot assign scopes outside your own country scope", "SCOPE_FORBIDDEN")
  }
}

function assertUserWithinActorScope(
  userScopes : Array<{ scopeType: string; countryId: string | null }>,
  actorScope : AdminScopeContext,
): void {
  if (actorScope.isGlobal) return
  const hasGlobalScope = userScopes.some((s) => s.scopeType === "GLOBAL")
  if (hasGlobalScope) throw new ApiError(403, "Insufficient scope to manage this user", "SCOPE_FORBIDDEN")
  const actorCountries = new Set(actorScope.countryIds)
  const userCountries  = userScopes.filter((s) => s.countryId).map((s) => s.countryId!)
  if (!userCountries.some((c) => actorCountries.has(c))) {
    throw new ApiError(403, "This user is outside your scope", "SCOPE_FORBIDDEN")
  }
}

function buildScopeFilter(actorScope: AdminScopeContext): object {
  const { SYSTEM_USER_ID } = require("@/lib/pino/constants")
  if (actorScope.isGlobal) return { id: { not: SYSTEM_USER_ID } }
  return { id: { not: SYSTEM_USER_ID }, scopes: { some: { countryId: { in: actorScope.countryIds } } } }
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

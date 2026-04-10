import { createClerkClient }       from "@clerk/backend"
import { prisma, AdminUserStatus } from "@repo/db"
import { ApiError }                from "@/middleware/error"
import { logger }                  from "@/lib/pino/logger"
import { auditService }            from "@/modules/admin/services/admin.audit.service"
import type { AdminScopeContext }  from "@repo/types/backend"

const serviceLog = logger.child({ module: "admin-user-service" })

//* ─── Input types ────────────────────────────────────────

interface CreateAdminUserInput {
  email          : string
  fullName       : string
  roleId         : string
  permissionKeys : string[]
  /** Scope entries to assign. Omit → GLOBAL scope is assigned automatically. */
  scopes?        : ScopeEntry[]
}

interface ScopeEntry {
  scopeType : "GLOBAL" | "COUNTRY" | "CITY"
  countryId?: string
  cityId?   : string
}

interface SendInviteInput {
  adminUserId: string
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


function getAdminClerkClient() {
  const secretKey = process.env.CLERK_ADMIN_SECRET_KEY
  if (!secretKey) throw new ApiError(500, "CLERK_ADMIN_SECRET_KEY is not configured", "CLERK_MISCONFIGURED")
  return createClerkClient({ secretKey })
}
 
//* ─── Create admin user ────────────────────────────────────────────────────────
//
// Creates the DB row only. Does NOT send the Clerk invitation — that is a
// separate deliberate step. This allows the actor to review the record
// before granting access.
//
// Scope logic:
//   - If scopes are provided, they are used as-is.
//   - If no scopes are provided AND the actor is a super_admin, GLOBAL is assigned.
//   - If no scopes are provided AND the actor is an identity_admin, their own
//     scope is inherited (identity_admin can only create within their country).

export async function createAdminUser(
  input  : CreateAdminUserInput,
  actorId: string,
  actorScope: AdminScopeContext,
) {
  const { email, fullName, roleId, permissionKeys, scopes } = input
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } })
  if (existing) throw new ApiError(409, "An admin user with this email already exists", "DUPLICATE_EMAIL")

  const role = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!role) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")

  if (permissionKeys.length > 0) await validatePermissionsInRolePool(roleId, permissionKeys)

  // Determine scopes to assign
  const resolvedScopes = resolveScopes(scopes, actorScope)

  // Scope guard: identity_admin can only create users within their own scope
  assertScopeCanManage(actorScope, resolvedScopes)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        email       : normalizedEmail,
        fullName,
        roleId,
        status      : AdminUserStatus.pending,
        isActive    : false,
        invitedById : actorId,
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
        email    : normalizedEmail,
        fullName,
        roleId,
        status   : "pending",
        scopes   : resolvedScopes,
      },
    },
    metadata: { permissionCount: permissionKeys.length },
  })

  return user
}

// ─── Send invitation ──────────────────────────────────────────────────────────

export async function sendAdminInvitation(
  input     : SendInviteInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: input.adminUserId },
    include: { scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  // Scope guard: identity_admin can only invite users within their scope
  assertUserWithinActorScope(adminUser.scopes, actorScope)

  if (
    adminUser.status !== AdminUserStatus.pending &&
    adminUser.status !== AdminUserStatus.invited
  ) {
    throw new ApiError(400, `Cannot send invitation to a user with status: ${adminUser.status}`, "INVALID_STATUS")
  }

  const clerk = getAdminClerkClient()

  try {
    await clerk.invitations.createInvitation({
      emailAddress  : adminUser.email,
      redirectUrl   : process.env.CLERK_ADMIN_INVITE_REDIRECT_URL,
      publicMetadata: { adminUserId: adminUser.id, role: adminUser.roleId },
    })
  } catch (err) {
    serviceLog.error({ err, adminUserId: adminUser.id }, "Clerk invitation failed")
    throw new ApiError(502, `Failed to send Clerk invitation: ${(err as Error).message}`, "CLERK_ERROR")
  }

  await prisma.adminUser.update({
    where: { id: input.adminUserId },
    data : {
      status              : AdminUserStatus.invited,
      invitationSentAt    : new Date(),
      invitationSentCount : { increment: 1 },
    },
  })

  serviceLog.info({ adminUserId: adminUser.id, actorId }, "Invitation sent")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.invited",
    entityType : "AdminUser",
    entityId   : adminUser.id,
    changes    : {
      before: { status: adminUser.status },
      after : { status: "invited" },
    },
    metadata: { invitationSentCount: adminUser.invitationSentCount + 1 },
  })

  return { success: true }
}

// ─── Update permissions ───────────────────────────────────────────────────────

export async function updateAdminUserPermissions(
  input     : UpdateAdminUserPermissionsInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { adminUserId, permissionKeys } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: {
      role       : true,
      permissions: { include: { permission: true } },
      scopes     : true,
    },
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

// ─── Update role ──────────────────────────────────────────────────────────────

export async function updateAdminUserRole(
  input     : UpdateAdminUserRoleInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { adminUserId, roleId } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true, scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope)

  const newRole = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!newRole) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")

  // Prevent assigning system role to real users
  if (newRole.name === "system") {
    throw new ApiError(400, "Cannot assign the system role to a user", "INVALID_ROLE")
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : { roleId },
  })

  serviceLog.info({ adminUserId, actorId, fromRole: adminUser.role?.name, toRole: newRole.name }, "Role updated")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.role_updated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { roleId: adminUser.roleId, roleName: adminUser.role?.name },
      after : { roleId, roleName: newRole.name },
    },
  })

  return { success: true }
}

// ─── Update scopes ────────────────────────────────────────────────────────────

export async function updateAdminUserScopes(
  input     : UpdateAdminUserScopesInput,
  actorId   : string,
  actorScope: AdminScopeContext,
) {
  const { adminUserId, scopes } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { scopes: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(adminUser.scopes, actorScope)

  // Validate: non-global actors cannot assign GLOBAL scope
  const assigningGlobal = scopes.some((s) => s.scopeType === "GLOBAL")
  if (assigningGlobal && !actorScope.isGlobal) {
    throw new ApiError(403, "Only globally-scoped admins can assign GLOBAL scope", "SCOPE_FORBIDDEN")
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

// ─── Suspend ──────────────────────────────────────────────────────────────────

export async function suspendAdminUser(
  adminUserId: string,
  reason     : string,
  actorId    : string,
  actorScope : AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { scopes: true },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(user.scopes, actorScope)

  if (user.status === AdminUserStatus.suspended)   throw new ApiError(400, "User is already suspended", "ALREADY_SUSPENDED")
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Cannot suspend a deactivated user", "INVALID_STATUS")
  if (user.status === AdminUserStatus.pending || user.status === AdminUserStatus.invited) {
    throw new ApiError(400, "Cannot suspend a user who has not yet activated their account", "INVALID_STATUS")
  }

  if (user.clerkUserId) {
    try {
      await getAdminClerkClient().users.banUser(user.clerkUserId)
    } catch (err) {
      serviceLog.error({ err, adminUserId, clerkUserId: user.clerkUserId }, "Clerk ban failed")
      throw new ApiError(502, `Failed to ban Clerk user: ${(err as Error).message}`, "CLERK_ERROR")
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : { status: AdminUserStatus.suspended, isActive: false, deactivationReason: reason },
  })

  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user suspended")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.suspended",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { status: user.status, isActive: true },
      after : { status: "suspended", isActive: false },
    },
    metadata: { reason },
  })

  return { success: true }
}

// ─── Reinstate ────────────────────────────────────────────────────────────────

export async function reinstateAdminUser(
  adminUserId: string,
  actorId    : string,
  actorScope : AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { scopes: true },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(user.scopes, actorScope)

  if (user.status !== AdminUserStatus.suspended) {
    throw new ApiError(400, "Only suspended users can be reinstated", "INVALID_STATUS")
  }

  if (user.clerkUserId) {
    try {
      await getAdminClerkClient().users.unbanUser(user.clerkUserId)
    } catch (err) {
      serviceLog.error({ err, adminUserId, clerkUserId: user.clerkUserId }, "Clerk unban failed")
      throw new ApiError(502, `Failed to unban Clerk user: ${(err as Error).message}`, "CLERK_ERROR")
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : { status: AdminUserStatus.active, isActive: true, deactivationReason: null },
  })

  serviceLog.info({ adminUserId, actorId }, "Admin user reinstated")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.reinstated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { status: "suspended", isActive: false },
      after : { status: "active",    isActive: true },
    },
  })

  return { success: true }
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivateAdminUser(
  adminUserId: string,
  reason     : string,
  actorId    : string,
  actorScope : AdminScopeContext,
) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { scopes: true },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  assertUserWithinActorScope(user.scopes, actorScope)

  if (user.status === AdminUserStatus.deactivated) {
    throw new ApiError(400, "User is already deactivated", "ALREADY_DEACTIVATED")
  }

  if (user.clerkUserId) {
    try {
      await getAdminClerkClient().users.deleteUser(user.clerkUserId)
    } catch (err) {
      serviceLog.error({ err, adminUserId, clerkUserId: user.clerkUserId }, "Clerk user deletion failed — continuing with DB deactivation")
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status            : AdminUserStatus.deactivated,
      isActive          : false,
      deactivatedAt     : new Date(),
      deactivationReason: reason,
      clerkUserId       : null,
    },
  })

  serviceLog.warn({ adminUserId, actorId, reason }, "Admin user deactivated")

  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.deactivated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : {
      before: { status: user.status, isActive: user.isActive, clerkUserId: user.clerkUserId },
      after : { status: "deactivated", isActive: false, clerkUserId: null },
    },
    metadata: { reason },
  })

  return { success: true }
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getAdminUser(adminUserId: string, actorScope: AdminScopeContext) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: {
      role       : true,
      permissions: { include: { permission: true } },
      scopes     : true,
      invitedBy  : { select: { id: true, fullName: true, email: true } },
    },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  // Scope guard: identity_admin can only view users within their scope
  assertUserWithinActorScope(user.scopes, actorScope)

  return user
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAdminUsers(
  filters: {
    status?  : AdminUserStatus
    roleId?  : string
    search?  : string
    page?    : number
    pageSize?: number
  },
  actorScope: AdminScopeContext,
) {
  const { status, roleId, search, page = 1, pageSize = 20 } = filters
  const skip = (page - 1) * pageSize

  // Build scope-aware WHERE clause:
  //   - Global actor: no scope filter — sees all users
  //   - Country-scoped actor: only sees users whose scopes include that country
  //   - SYSTEM_USER_ID is always excluded from lists
  const scopeFilter = buildScopeFilter(actorScope)

  const where = {
    ...scopeFilter,
    ...(status ? { status }                                             : {}),
    ...(roleId ? { roleId }                                             : {}),
    ...(search ? {
      OR: [
        { email   : { contains: search, mode: "insensitive" as const } },
        { fullName: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        role  : true,
        scopes: true,
      },
    }),
    prisma.adminUser.count({ where }),
  ])

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Get role pool (for permission assignment UI) ─────────────────────────────

export async function getRolePermissionPool(roleId: string) {
  const pool = await prisma.adminRolePermission.findMany({
    where  : { roleId },
    include: { permission: true },
    orderBy: { permission: { module: "asc" } },
  })
  return pool.map((rp) => rp.permission)
}

// ─── List roles (for role assignment UI) ─────────────────────────────────────

export async function listRoles() {
  return prisma.adminRole.findMany({
    where  : { name: { not: "system" } },  // never show system role
    orderBy: { name: "asc" },
  })
}

// ─── Scope helpers ────────────────────────────────────────────────────────────

/**
 * Resolves which scopes to assign to a new user.
 * If explicit scopes are provided, use them.
 * If not, and the actor is global-scoped, assign GLOBAL.
 * If not, and the actor is country-scoped, inherit the actor's country scope.
 */
function resolveScopes(
  requested : ScopeEntry[] | undefined,
  actorScope: AdminScopeContext,
): ScopeEntry[] {
  if (requested && requested.length > 0) return requested

  if (actorScope.isGlobal) {
    return [{ scopeType: "GLOBAL" }]
  }

  // Default: inherit actor's country scopes
  return actorScope.countryIds.map((countryId) => ({
    scopeType: "COUNTRY" as const,
    countryId,
  }))
}

/**
 * Asserts that the actor is allowed to manage a user with the given resolved scopes.
 * Global actors can manage anyone.
 * Country-scoped actors can only manage users in their countries.
 */
function assertScopeCanManage(
  actorScope    : AdminScopeContext,
  targetScopes  : ScopeEntry[],
): void {
  if (actorScope.isGlobal) return

  const actorCountries = new Set(actorScope.countryIds)
  const assigningGlobal = targetScopes.some((s) => s.scopeType === "GLOBAL")

  if (assigningGlobal) {
    throw new ApiError(403, "Only globally-scoped admins can create globally-scoped users", "SCOPE_FORBIDDEN")
  }

  const outOfScope = targetScopes.filter(
    (s) => s.countryId && !actorCountries.has(s.countryId)
  )

  if (outOfScope.length > 0) {
    throw new ApiError(403, "You cannot assign scopes outside your own scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * Asserts that a target user's scopes overlap with the actor's scope.
 * Used for read/update/delete operations.
 */
function assertUserWithinActorScope(
  userScopes : Array<{ scopeType: string; countryId: string | null }>,
  actorScope : AdminScopeContext,
): void {
  if (actorScope.isGlobal) return

  const hasGlobalScope = userScopes.some((s) => s.scopeType === "GLOBAL")
  if (hasGlobalScope) {
    // Only global admins can manage other global admins
    throw new ApiError(403, "Insufficient scope to manage this user", "SCOPE_FORBIDDEN")
  }

  const actorCountries = new Set(actorScope.countryIds)
  const userCountries  = userScopes
    .filter((s) => s.countryId)
    .map((s) => s.countryId!)

  const hasOverlap = userCountries.some((c) => actorCountries.has(c))

  if (!hasOverlap) {
    throw new ApiError(403, "This user is outside your scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * Builds a Prisma WHERE filter that limits results to users within the actor's scope.
 * Global actors get no filter. Country-scoped actors filter via their scope table.
 */
function buildScopeFilter(actorScope: AdminScopeContext): object {
  const { SYSTEM_USER_ID } = require("@/lib/pino/constants")

  if (actorScope.isGlobal) {
    return { id: { not: SYSTEM_USER_ID } }
  }

  return {
    id    : { not: SYSTEM_USER_ID },
    scopes: {
      some: {
        countryId: { in: actorScope.countryIds },
      },
    },
  }
}

//* ─── Permission pool validation ───────────────────────────────────────────────

async function validatePermissionsInRolePool(roleId: string, permissionKeys: string[]) {
  const rolePermissions = await prisma.adminRolePermission.findMany({
    where  : { roleId },
    include: { permission: true },
  })

  const poolKeys  = new Set(rolePermissions.map((rp) => rp.permission.key))
  const outOfPool = permissionKeys.filter((k) => !poolKeys.has(k))

  if (outOfPool.length > 0) {
    throw new ApiError(
      400,
      `The following permissions are not in this role's pool: ${outOfPool.join(", ")}`,
      "PERMISSIONS_OUT_OF_POOL",
    )
  }
}
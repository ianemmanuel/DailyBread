import { prisma, Prisma, AdminUserStatus, GeoStatus } from "@repo/db"
import { ApiError } from "@/middleware/error"
import { logger } from "@/lib/pino/logger"
import { auditService } from "@/services/audit"
import { ClerkAdminStateService } from "@/lib/clerk"
import { assertSingleScopeShape, deriveScopeContext } from "../lib/scope/single-scope"
import { effectivePermissionKeys, resolveAdminScope, rolePoolKeys } from "@/lib/permissions/effective"
import {
  assertActorHolds,
  assertAssignableRoleAndScope,
  assertCanDelegatePermissions,
  assertCanManageTarget,
  assertCanProvision,
  assertProvisioningScope,
  parsePermissionKeys,
  resolvedScopeFrom,
  sameScope,
  type ActorAuthority,
  type ResolvedScope,
  type TargetSubject,
} from "../lib/delegation/delegation-policy"
import { SYSTEM_USER_ID } from "@/constants/system"
import { env } from "@/env"
import { AdminPermissions } from "@repo/types/enums"
import { applyAvailabilityChange, type SetAvailabilityInput } from "./admin.reviewerAvailability.service"
import type {
  AdminScopeContext,
  AuditLogInput,
  CreateAdminUserRequest,
  UpdateAdminUserPermissionsRequest,
  UpdateAdminUserRoleRequest,
  UpdateAdminUserScopesRequest,
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

/*
 * ─── Authority, loaded from the database ────────────────────────────────────
 *
 * Every mutation below takes only the ACTOR'S ID and re-reads the actor here,
 * inside the same transaction as the write: status, role, the role's CURRENT
 * pool, grants and scope. Nothing a caller passes in — a request's scope, a
 * role name, a permission list — is authority. A grant outside the actor's
 * current role pool is not counted (lib/delegation/delegation-policy.ts).
 */

type Db = Prisma.TransactionClient

const SUBJECT_INCLUDE = {
  role       : { include: { permissions: { include: { permission: true } } } },
  permissions: { include: { permission: true } },
  scopes     : { include: { city: { select: { countryId: true } } } },
} satisfies Prisma.AdminUserInclude

type Subject = Prisma.AdminUserGetPayload<{ include: typeof SUBJECT_INCLUDE }>

function loadSubject(db: Db, id: string): Promise<Subject | null> {
  return db.adminUser.findUnique({ where: { id }, include: SUBJECT_INCLUDE })
}

/** The one scope a stored set of rows resolves to — a CITY row's country read from the city. */
function scopeOfRows(rows: Subject["scopes"]): ResolvedScope | null {
  const { scope, valid } = deriveScopeContext(rows.map((r) => ({
    scopeType    : r.scopeType,
    countryId    : r.countryId,
    cityId       : r.cityId,
    cityCountryId: r.city?.countryId ?? null,
  })))
  return resolvedScopeFrom(scope, valid)
}

/** A role's CURRENT pool — active keys only (the shared definition). */
function poolOf(role: Subject["role"]): Set<string> {
  return rolePoolKeys(role)
}

/** EFFECTIVE keys — the same rule the request chain applies (lib/permissions/effective.ts). */
function effectiveKeysOf(user: Subject): Set<string> {
  return new Set(effectivePermissionKeys(user))
}

/*
 * A TARGET's scope is its raw single row, deliberately NOT checked against its
 * role: an identity admin left at CITY scope must still be reachable so a
 * GLOBAL admin can repair the assignment. Its EFFECTIVE keys do apply the full
 * rule — such a target holds none.
 */
function targetOf(user: Subject): TargetSubject {
  return { id: user.id, roleName: user.role?.name ?? null, scope: scopeOfRows(user.scopes), permissions: effectiveKeysOf(user) }
}

/** The actor as authority, plus the row version a write must lock against. */
async function loadActorRow(db: Db, actorId: string): Promise<{ actor: ActorAuthority; row: Subject }> {
  const row = await loadSubject(db, actorId)
  if (!row || row.status !== AdminUserStatus.active) {
    throw new ApiError(403, "Your administrator account is not active", "ACTOR_NOT_ACTIVE")
  }
  // An ACTOR's scope is validated against its role: an invalid assignment
  // authorises nothing (and its effective keys are empty anyway).
  const resolved = resolveAdminScope(row)
  return {
    actor: {
      id         : row.id,
      roleName   : row.role?.name ?? null,
      scope      : resolvedScopeFrom(resolved.scope, resolved.valid),
      permissions: effectiveKeysOf(row),
      pool       : poolOf(row.role),
    },
    row,
  }
}

async function loadActor(db: Db, actorId: string): Promise<ActorAuthority> {
  return (await loadActorRow(db, actorId)).actor
}

/** The actor and an existing target, with the target-management rule already applied. */
async function authorizeTargetAction(db: Db, actorId: string, targetId: string, requiredKey: string) {
  const actor = await loadActor(db, actorId)
  assertActorHolds(actor, requiredKey)
  const user = await loadSubject(db, targetId)
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  assertCanManageTarget(actor, targetOf(user))
  return { actor, user }
}

/*
 * A requested scope → one validated ResolvedScope. Shape first
 * (assertSingleScopeShape), then the rows it names: a COUNTRY must exist, a
 * CITY must exist and be ACTIVE, and a CITY's country is the city's own — a
 * supplied one that disagrees is refused, never corrected. An absent request
 * inherits the actor's own scope (only where `fallback` is given — create).
 */
async function resolveRequestedScope(db: Db, requested: unknown, fallback?: ResolvedScope): Promise<ResolvedScope> {
  if (fallback && (requested === undefined || (Array.isArray(requested) && requested.length === 0))) {
    return { ...fallback }
  }
  if (!Array.isArray(requested) || requested.some((e) => !e || typeof e !== "object")) {
    throw new ApiError(400, "An admin has exactly one scope: global, one country, or one city", "SINGLE_SCOPE_REQUIRED")
  }
  const entry = assertSingleScopeShape(requested)
  if ((entry.countryId !== undefined && typeof entry.countryId !== "string") || (entry.cityId !== undefined && typeof entry.cityId !== "string")) {
    throw new ApiError(400, "Scope ids must be strings", "INVALID_SCOPE_SHAPE")
  }

  if (entry.scopeType === "GLOBAL") return { tier: "GLOBAL", countryId: null, cityId: null }

  if (entry.scopeType === "COUNTRY") {
    const country = await db.country.findUnique({ where: { id: entry.countryId! }, select: { id: true } })
    if (!country) throw new ApiError(404, "Country not found", "COUNTRY_NOT_FOUND")
    return { tier: "COUNTRY", countryId: country.id, cityId: null }
  }

  const city = await db.city.findUnique({ where: { id: entry.cityId! }, select: { id: true, countryId: true, status: true } })
  if (!city) throw new ApiError(404, "City not found", "CITY_NOT_FOUND")
  if (entry.countryId && entry.countryId !== city.countryId) {
    throw new ApiError(400, "That city is not in that country", "COUNTRY_MISMATCH")
  }
  if (city.status !== GeoStatus.ACTIVE) {
    throw new ApiError(400, "That city is not active", "CITY_INACTIVE")
  }
  return { tier: "CITY", countryId: city.countryId, cityId: city.id }
}

function scopeRowData(adminUserId: string, scope: ResolvedScope) {
  return { adminUserId, scopeType: scope.tier, countryId: scope.countryId, cityId: scope.cityId }
}

function scopeForAudit(scope: ResolvedScope | null) {
  return scope ? { scopeType: scope.tier, countryId: scope.countryId, cityId: scope.cityId } : null
}

/*
 * Optimistic locks on the ACTOR and TARGET rows, taken AFTER authorization and
 * before the first real write. Role, scope and grant changes all bump
 * AdminUser.updatedAt through here (suspend/deactivate bump it through
 * Prisma's @updatedAt), so a decision cannot commit against a state that
 * changed under it:
 *   - target: a grant validated against the old role's pool or scope cannot
 *     land after a role or scope change cleared the grants
 *   - actor : authority read at the start (their grants, role, scope, status)
 *     cannot be spent after it was revoked
 * Each UPDATE holds its row lock until the transaction ends; rows are locked
 * in id order so two admins acting on each other cannot deadlock.
 */
async function lockVersions(db: Db, rows: Array<{ id: string; updatedAt: Date }>): Promise<void> {
  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const row of ordered) {
    const result = await db.adminUser.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data : { updatedAt: new Date() },
    })
    if (result.count !== 1) {
      throw new ApiError(409, "An administrator involved in this change was changed by someone else just now — reload and try again", "CONCURRENT_MODIFICATION")
    }
  }
}

/*
 * An authorization change's audit row, written INSIDE its transaction: the
 * change and its record commit or roll back together. (auditService.log is
 * fire-and-forget and stays the path for everything else.)
 */
async function auditInTx(db: Db, entry: AuditLogInput): Promise<void> {
  await db.auditLog.create({
    data: {
      adminUserId: entry.adminUserId,
      action     : entry.action,
      entityType : entry.entityType,
      entityId   : entry.entityId,
      changes    : entry.changes  ? (JSON.parse(JSON.stringify(entry.changes))  as Prisma.InputJsonValue) : undefined,
      metadata   : entry.metadata ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue) : undefined,
    },
  })
}

//* ─── Create ──────────────────────────────────────────────────────────────────
//
// PROVISIONING: identity, role and scope — never permissions. A new admin
// holds nothing until a superior of their role grants it
// (updateAdminUserPermissions). Requesting grants here is refused rather than
// ignored, so a manipulated request cannot look like it worked.

export async function createAdminUser(input: CreateAdminUserRequest, actorId: string) {
  const { firstName, middleName, lastName, email, employeeId, roleId, scopes } = input

  const permissionKeys = parsePermissionKeys(input.permissionKeys)
  if (permissionKeys.length > 0) {
    throw new ApiError(
      403,
      "Permissions are not granted when an administrator is created — a superior administrator of their role grants them afterwards",
      "PERMISSIONS_NOT_GRANTABLE_AT_PROVISIONING",
    )
  }
  if (typeof email !== "string" || typeof roleId !== "string") {
    throw new ApiError(400, "email and roleId must be strings", "MISSING_FIELDS")
  }
  const normalizedEmail = email.toLowerCase().trim()

  const user = await prisma.$transaction(async (tx) => {
    const { actor, row: actorRow } = await loadActorRow(tx, actorId)
    const actorScope = assertCanProvision(actor, AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE)

    const role = await tx.adminRole.findUnique({ where: { id: roleId } })
    if (!role) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")

    const scope = await resolveRequestedScope(tx, scopes, actorScope)
    assertAssignableRoleAndScope(role.name, scope)
    assertProvisioningScope(actorScope, scope)

    if (await tx.adminUser.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) {
      throw new ApiError(409, "An admin user with this email already exists", "DUPLICATE_EMAIL")
    }
    if (employeeId && await tx.adminUser.findFirst({ where: { employeeId }, select: { id: true } })) {
      throw new ApiError(409, "An admin user with this employee ID already exists", "DUPLICATE_EMPLOYEE_ID")
    }

    await lockVersions(tx, [actorRow])
    const user = await tx.adminUser.create({
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
    await tx.adminUserScope.create({ data: scopeRowData(user.id, scope) })
    await auditInTx(tx, {
      adminUserId: actorId,
      action     : "admin_user.created",
      entityType : "AdminUser",
      entityId   : user.id,
      changes    : {
        after: {
          email      : normalizedEmail,
          displayName: formatDisplayName({ firstName, middleName, lastName }),
          roleId     : role.id,
          roleName   : role.name,
          status     : "pending",
          scope      : scopeForAudit(scope),
          permissions: [],
        },
      },
    })
    return user
  })

  serviceLog.info({ adminUserId: user.id, email: normalizedEmail, actorId }, "Admin user created")
  return user
}

//* ─── Send invitation ─────────────

export async function sendAdminInvitation(adminUserId: string, actorId: string) {
  // Optional at startup (see env.ts) since it's only this one admin-only
  // feature — but genuinely required to actually send an invitation.
  if (!env.CLERK_ADMIN_INVITE_REDIRECT_URL) {
    throw new ApiError(500, "Admin invitations are not configured on this environment", "INVITE_NOT_CONFIGURED")
  }

  const { user: adminUser } = await authorizeTargetAction(prisma, actorId, adminUserId, AdminPermissions.ADMIN_USERS_INVITATIONS_SEND)

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

//* ─── Update permissions ──────────────────────────────────────────────────────
//
// DELEGATION: a designated superior (admin_users:permissions:manage) grants
// keys they personally and effectively hold, inside the target role's current
// pool, to an administrator whose role and scope they may manage
// (assertCanDelegatePermissions). The request replaces the target's grants;
// revoking needs no matching grant.

export async function updateAdminUserPermissions(input: UpdateAdminUserPermissionsRequest, actorId: string) {
  const { adminUserId } = input
  if (!Array.isArray(input.permissionKeys)) {
    throw new ApiError(400, "permissionKeys must be an array of permission keys", "INVALID_PERMISSION_KEYS")
  }
  const permissionKeys = parsePermissionKeys(input.permissionKeys)

  const result = await prisma.$transaction(async (tx) => {
    const { actor, row: actorRow } = await loadActorRow(tx, actorId)
    const target = await loadSubject(tx, adminUserId)
    if (!target) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

    const currentKeys = target.permissions.map((g) => g.permission.key)
    const { added, removed } = assertCanDelegatePermissions({
      actor,
      target       : targetOf(target),
      targetPool   : poolOf(target.role),
      requestedKeys: permissionKeys,
      currentKeys,
    })

    if (target.status === AdminUserStatus.deactivated) {
      throw new ApiError(400, "Cannot grant permissions to a deactivated administrator", "INVALID_STATUS")
    }

    const permissions = permissionKeys.length
      ? await tx.adminPermission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true, key: true, isActive: true } })
      : []
    const usable  = new Set(permissions.filter((p) => p.isActive).map((p) => p.key))
    const unknown = permissionKeys.filter((k) => !usable.has(k))
    if (unknown.length > 0) {
      throw new ApiError(400, `Unknown or inactive permissions: ${unknown.join(", ")}`, "UNKNOWN_PERMISSION")
    }

    await lockVersions(tx, [actorRow, target])
    await tx.adminUserPermission.deleteMany({ where: { adminUserId } })
    if (permissions.length > 0) {
      await tx.adminUserPermission.createMany({
        data: permissions.map((p) => ({ adminUserId, permissionId: p.id, grantedById: actorId })),
      })
    }
    const written = await tx.adminUserPermission.findMany({
      where : { adminUserId },
      select: { permission: { select: { key: true } } },
    })
    const after = written.map((w) => w.permission.key)

    await auditInTx(tx, {
      adminUserId: actorId,
      action     : "admin_user.permissions_updated",
      entityType : "AdminUser",
      entityId   : adminUserId,
      changes    : { before: { permissions: currentKeys }, after: { permissions: after } },
      metadata   : { added, removed },
    })
    return after
  })

  serviceLog.info({ adminUserId, actorId, permissionCount: result.length }, "Permissions updated")
  return { updated: result.length }
}

//* ─── Update role ─────────────────────────────────────────────────────────────
//
// PROVISIONING. Changing a role CLEARS every grant: grants are valid only
// inside a role's pool, and the new role's superior decides what to re-grant.
// The new role must be valid at the target's CURRENT scope — change the scope
// first if it is not.

export async function updateAdminUserRole(input: UpdateAdminUserRoleRequest, actorId: string) {
  const { adminUserId, roleId } = input
  if (typeof roleId !== "string" || !roleId) throw new ApiError(400, "roleId is required", "MISSING_FIELDS")

  const result = await prisma.$transaction(async (tx) => {
    const { actor, row: actorRow } = await loadActorRow(tx, actorId)
    assertCanProvision(actor, AdminPermissions.ADMIN_USERS_ROLES_ASSIGN)
    const target = await loadSubject(tx, adminUserId)
    if (!target) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
    const subject = targetOf(target)
    assertCanManageTarget(actor, subject)

    const newRole = await tx.adminRole.findUnique({ where: { id: roleId } })
    if (!newRole) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")
    if (newRole.id === target.roleId) throw new ApiError(400, "The administrator already has this role", "NO_CHANGE")
    if (!subject.scope) {
      throw new ApiError(400, "This administrator has no valid scope — fix their scope before changing the role", "TARGET_SCOPE_INVALID")
    }
    try {
      assertAssignableRoleAndScope(newRole.name, subject.scope)
    } catch (err) {
      if ((err as ApiError).code !== "INVALID_SCOPE_FOR_ROLE") throw err
      throw new ApiError(
        400,
        `This user's current scope is not compatible with the '${newRole.displayName}' role. Update their scope first, then change the role.`,
        "SCOPE_ROLE_MISMATCH",
      )
    }

    await lockVersions(tx, [actorRow, target])
    await tx.adminUser.update({ where: { id: adminUserId }, data: { roleId: newRole.id } })
    await tx.adminUserPermission.deleteMany({ where: { adminUserId } })

    const changes = {
      before: { roleId: target.roleId, roleName: target.role?.name ?? null, permissions: target.permissions.map((g) => g.permission.key) },
      after : { roleId: newRole.id, roleName: newRole.name, permissions: [] as string[] },
    }
    await auditInTx(tx, {
      adminUserId: actorId,
      action     : "admin_user.role_updated",
      entityType : "AdminUser",
      entityId   : adminUserId,
      changes,
      metadata   : { note: "All permission grants cleared. Re-grant from new role pool." },
    })
    return changes
  })

  serviceLog.info({ adminUserId, actorId, fromRole: result.before.roleName, toRole: result.after.roleName }, "Role updated — permissions cleared")

  return {
    success           : true,
    permissionsCleaned: result.before.permissions.length,
    note              : "All permission grants were cleared. A superior administrator of the new role grants permissions.",
  }
}

//* ─── Update scope ────────────────────────────────────────────────────────────
//
// PROVISIONING, gated on admin_users:roles:assign: role and scope are assigned
// by identity administrators. The new scope must sit inside the actor's scope
// and be valid for the target's role.
//
// A SCOPE CHANGE CLEARS EVERY GRANT. A grant was decided for a job in one
// place; the same keys somewhere else — wider, narrower or merely different —
// are a different decision, and the target's superior there makes it. The
// role and the account are kept. Scope, grant reset and audit row commit in
// ONE transaction or not at all. A request naming the scope the target
// already holds is refused (NO_CHANGE) rather than silently wiping grants.

export async function updateAdminUserScopes(input: UpdateAdminUserScopesRequest, actorId: string) {
  const { adminUserId, scopes } = input

  const result = await prisma.$transaction(async (tx) => {
    const { actor, row: actorRow } = await loadActorRow(tx, actorId)
    const actorScope = assertCanProvision(actor, AdminPermissions.ADMIN_USERS_ROLES_ASSIGN)
    const target     = await loadSubject(tx, adminUserId)
    if (!target) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
    const subject = targetOf(target)
    assertCanManageTarget(actor, subject)

    const scope = await resolveRequestedScope(tx, scopes)
    assertProvisioningScope(actorScope, scope)
    if (target.role) assertAssignableRoleAndScope(target.role.name, scope)
    if (subject.scope && sameScope(subject.scope, scope)) {
      throw new ApiError(400, "The administrator already has this scope", "NO_CHANGE")
    }

    await lockVersions(tx, [actorRow, target])
    await tx.adminUserScope.deleteMany({ where: { adminUserId } })
    await tx.adminUserScope.create({ data: scopeRowData(adminUserId, scope) })
    await tx.adminUserPermission.deleteMany({ where: { adminUserId } })

    const changes = {
      before: {
        scopes     : target.scopes.map((s) => ({ scopeType: s.scopeType, countryId: s.countryId, cityId: s.cityId })),
        permissions: target.permissions.map((g) => g.permission.key),
      },
      after: { scopes: [scopeForAudit(scope)], permissions: [] as string[] },
    }
    await auditInTx(tx, {
      adminUserId: actorId,
      action     : "admin_user.scopes_updated",
      entityType : "AdminUser",
      entityId   : adminUserId,
      changes,
      metadata   : { roleName: target.role?.name ?? null, note: "Scope changed — all permission grants cleared. Re-grant for the new scope." },
    })
    return changes
  })

  serviceLog.info({ adminUserId, actorId, permissionsCleared: result.before.permissions.length }, "Scope updated — permissions cleared")

  return {
    success           : true,
    permissionsCleaned: result.before.permissions.length,
    note              : "All permission grants were cleared. A superior administrator of this role grants permissions for the new scope.",
  }
}

// ─── Suspend, Reinstate, Deactivate ──────────────────────────────────────────
//
// The same target-management rule as every other mutation: not yourself, never
// a super_admin, a same-role target only from strictly above, any other role
// only inside your scope.

export async function suspendAdminUser(adminUserId: string, reason: string, actorId: string) {
  const { user } = await authorizeTargetAction(prisma, actorId, adminUserId, AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND)
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

export async function reinstateAdminUser(adminUserId: string, actorId: string) {
  const { user } = await authorizeTargetAction(prisma, actorId, adminUserId, AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE)
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

export async function deactivateAdminUser(adminUserId: string, reason: string, actorId: string) {
  const { user } = await authorizeTargetAction(prisma, actorId, adminUserId, AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE)
  if (user.status === AdminUserStatus.deactivated) throw new ApiError(400, "Already deactivated", "ALREADY_DEACTIVATED")
  if (user.externalAuthId) {
    try { await ClerkAdminStateService.deleteUser(user.externalAuthId) }
    catch (err) { serviceLog.error({ err, adminUserId }, "Clerk deletion failed — continuing with DB deactivation") }
  }
  const clearedPermissions = user.permissions.map((p) => p.permission.key)
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: adminUserId }, data: { status: AdminUserStatus.deactivated, isActive: false, deactivatedAt: new Date(), deactivationReason: reason, externalAuthId: null } }),
    // A deactivated admin retains their DB record (offboarding, not deletion)
    // but must hold no live permission grants.
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

//* Read-side scope helpers (list / get / audit). Mutations use the delegation policy.

/*
 * Any globally-scoped actor (super_admin, or a globally-scoped
 * identity_admin) sees admins in every country.
 */
export function actorHasFullAccess(actorScope: AdminScopeContext): boolean {
  return actorScope.isGlobal
}

/*
 * Classifies a set of scope rows so a country-scoped actor's read check can
 * tell "one of my countries" apart from "spans multiple countries" or
 * "global".
 */
export function scopeClassOf(
  scopes: Array<{ scopeType: string; countryId: string | null }>,
): "GLOBAL" | "MULTI_COUNTRY" | "SINGLE_COUNTRY" {
  if (scopes.some((s) => s.scopeType === "GLOBAL")) return "GLOBAL"
  const countries = new Set(scopes.filter((s) => s.countryId).map((s) => s.countryId))
  return countries.size > 1 ? "MULTI_COUNTRY" : "SINGLE_COUNTRY"
}

/*
 * Resolves the set of AdminUser ids a given actor is allowed to see, per the
 * same read rules as assertUserWithinActorScope/buildScopeFilter. Returns null
 * for a full-access actor (no restriction needed) — callers should treat null
 * as "don't filter" rather than "empty set."
 *
 * Used by the audit log module (AuditLog.entityId has no real FK relation to
 * AdminUser — it's a generic string shared across every module's events).
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

function assertUserWithinActorScope(
  userScopes   : Array<{ scopeType: string; countryId: string | null }>,
  actorScope   : AdminScopeContext,
  _actorRoleName: string | undefined,
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

function buildScopeFilter(actorScope: AdminScopeContext, _actorRoleName: string | undefined): object {
  if (actorHasFullAccess(actorScope)) return { id: { not: SYSTEM_USER_ID } }
  return { id: { not: SYSTEM_USER_ID }, scopes: { some: { countryId: { in: actorScope.countryIds } } } }
}

//* ─── Availability (Identity & Access-managed) ───────────────────────────────
//
// A vendor_ops reviewer can already set their OWN availability, or have a
// privileged vendor_ops peer set it, via admin.reviewerAvailability.service.ts
// (gated by vendors:reviewers:manage_availability, scoped to country/city
// only). This is the identity-module counterpart, through the same
// target-management rule as suspend/deactivate. Both paths write through the
// same applyAvailabilityChange so the schema fields and audit event shape
// never diverge.

export async function setAdminUserAvailability(adminUserId: string, input: SetAvailabilityInput, actorId: string) {
  const { user } = await authorizeTargetAction(prisma, actorId, adminUserId, AdminPermissions.ADMIN_USERS_ACCOUNTS_MANAGE_AVAILABILITY)
  if (
    user.status === AdminUserStatus.pending ||
    user.status === AdminUserStatus.invited ||
    user.status === AdminUserStatus.deactivated
  ) {
    throw new ApiError(400, `Cannot change availability for a user with status: ${user.status}`, "INVALID_STATUS")
  }

  return applyAvailabilityChange(adminUserId, input, actorId, false)
}

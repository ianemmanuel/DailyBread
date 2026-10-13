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
  assertCanAssignPermissions,
  assertCanManageTarget,
  assertCanProvision,
  assertProvisioningScope,
  assignmentOptions,
  NOT_ASSIGNABLE_ROLES,
  parsePermissionKeys,
  passes,
  resolvedScopeFrom,
  sameScope,
  targetInScope,
  type ActorAuthority,
  type AssignmentMode,
  type ResolvedScope,
  type TargetSubject,
} from "../lib/delegation/delegation-policy"
import { getAllowedScopesForRole } from "@/lib/permissions/scope-rules"
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
  scopes     : { include: { city: { select: { countryId: true, status: true } } } },
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
 * supplied one that disagrees is refused, never corrected. There is no
 * default: the scope is always chosen explicitly (an absent one used to
 * inherit the creator's own, which silently made new admins as wide as the
 * person creating them).
 */
async function resolveRequestedScope(db: Db, requested: unknown): Promise<ResolvedScope> {
  if (requested === undefined || requested === null || (Array.isArray(requested) && requested.length === 0)) {
    throw new ApiError(400, "Choose the administrator's scope: global, one country, or one city", "SCOPE_REQUIRED")
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
// holds nothing until permissions are assigned (ordinary delegation, or
// recovery for a department's first lead)
// (updateAdminUserPermissions). Requesting grants here is refused rather than
// ignored, so a manipulated request cannot look like it worked.

export async function createAdminUser(input: CreateAdminUserRequest, actorId: string) {
  const { firstName, middleName, lastName, email, employeeId, roleId, scopes } = input

  const permissionKeys = parsePermissionKeys(input.permissionKeys)
  if (permissionKeys.length > 0) {
    throw new ApiError(
      403,
      "Permissions are not granted when an administrator is created — assign them afterwards",
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

    const scope = await resolveRequestedScope(tx, scopes)
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
        createdById: actorId,
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
          ? `You've been invited to join the DailyBread ERP as ${adminUser.role.displayName}.`
          : "You've been invited to join the DailyBread ERP.",
      },
    })
  } catch (err) {
    serviceLog.error({ err, adminUserId }, "Clerk invitation failed")
    throw new ApiError(502, `Failed to send Clerk invitation: ${(err as Error).message}`, "CLERK_ERROR")
  }

  const invitationExpiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // CONDITIONAL on the account still awaiting activation: a resend racing the
  // Clerk webhook that just activated the account must not set it back to
  // `invited` (the old unconditional update could).
  const written = await prisma.adminUser.updateMany({
    where: { id: adminUserId, status: { in: [AdminUserStatus.pending, AdminUserStatus.invited] } },
    data : {
      status              : AdminUserStatus.invited,
      invitationSentAt    : new Date(),
      invitationSentById  : actorId,
      invitationExpiresAt,
      invitationSentCount : { increment: 1 },
    },
  })
  if (written.count !== 1) {
    serviceLog.warn({ adminUserId, actorId }, "Invitation sent, but the account changed status meanwhile — status left as it is")
    throw new ApiError(409, "This administrator's account changed while the invitation was being sent — reload to see its current status", "STATUS_CHANGED")
  }

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
// ONE write path, two authorities (lib/delegation/delegation-policy.ts):
//   "delegation" (PUT /:id/permissions, admin_users:permissions:manage) —
//     ownership: only keys the actor effectively holds move, in either
//     direction, inside the target role's pool and the actor's scope.
//   "recovery"   (PUT /:id/permissions/recovery, …:permissions:recover) —
//     bootstrap / restore a department: any key of the target role's pool,
//     held or not, for a role that cannot itself hold the recovery key.
// The request replaces the target's grants. Same transaction, locks and
// audit row either way; the row's metadata names the mode (the only audit
// change made for recovery — see the audit session notes).

export async function updateAdminUserPermissions(input: UpdateAdminUserPermissionsRequest, actorId: string, mode: AssignmentMode = "delegation") {
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
    const { added, removed } = assertCanAssignPermissions({
      actor,
      target       : targetOf(target),
      targetPool   : poolOf(target.role),
      requestedKeys: permissionKeys,
      currentKeys,
      mode,
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
      metadata   : { added, removed, mode },
    })
    return after
  })

  serviceLog.info({ adminUserId, actorId, permissionCount: result.length, mode }, "Permissions updated")
  return { updated: result.length }
}

//* ─── Update role ─────────────────────────────────────────────────────────────
//
// PROVISIONING. Changing a role CLEARS every grant: grants are valid only
// inside a role's pool, and they are re-assigned for the new role.
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
    note              : "All permission grants were cleared. Permissions for the new role are assigned separately.",
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
// are a different decision, made again by whoever manages them there. The
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
    note              : "All permission grants were cleared. Permissions for the new scope are assigned separately.",
  }
}

// ─── Suspend, Reinstate, Reactivate, Deactivate ──────────────────────────────
//
// The same target rule as every other mutation (assertCanManageTarget): not
// yourself, never a super_admin, a target inside your scope. Each status
// change is CONDITIONAL on the status it was decided against, so two admins
// acting at once cannot, say, reinstate an account someone just deactivated.
// Postgres decides access (every request re-reads status); Clerk calls only
// revoke or restore sessions.

/** Moves `adminUserId` from one of `from` to a new status, or 409s if it moved meanwhile. */
async function transitionStatus(db: Db, adminUserId: string, from: AdminUserStatus[], data: Prisma.AdminUserUncheckedUpdateManyInput) {
  const written = await db.adminUser.updateMany({ where: { id: adminUserId, status: { in: from } }, data })
  if (written.count !== 1) {
    throw new ApiError(409, "This administrator's status changed just now — reload and try again", "STATUS_CHANGED")
  }
}

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
  // Grants are KEPT and frozen: effective permissions are empty while the
  // account is not active (lib/permissions/effective.ts), and come back on
  // reinstatement.
  await transitionStatus(prisma, adminUserId, [AdminUserStatus.active], { status: AdminUserStatus.suspended, isActive: false, deactivationReason: reason })
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
  await transitionStatus(prisma, adminUserId, [AdminUserStatus.suspended], { status: AdminUserStatus.active, isActive: true, deactivationReason: null })
  serviceLog.info({ adminUserId, actorId }, "Admin user reinstated")
  auditService.log({ adminUserId: actorId, action: "admin_user.reinstated", entityType: "AdminUser", entityId: adminUserId, changes: { before: { status: "suspended" }, after: { status: "active" } } })
  return { success: true }
}

/*
 * REACTIVATION — the one way back from `deactivated`, for re-hiring someone
 * (AdminUser.email is unique, so a fresh record for them is impossible). The
 * SAME record returns to `pending` with NO grants and no identity link: it
 * needs a new invitation, and permissions are granted again from scratch —
 * old grants are never restored (deactivation already deleted them; this
 * deletes again in case anything was written since). Role and scope are kept;
 * change them before inviting if the new job differs.
 */
export async function reactivateAdminUser(adminUserId: string, actorId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const { actor, row: actorRow } = await loadActorRow(tx, actorId)
    assertActorHolds(actor, AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE)
    const target = await loadSubject(tx, adminUserId)
    if (!target) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
    assertCanManageTarget(actor, targetOf(target))
    if (target.status !== AdminUserStatus.deactivated) {
      throw new ApiError(400, "Only deactivated administrators can be reactivated", "INVALID_STATUS")
    }

    await lockVersions(tx, [actorRow, target])
    await transitionStatus(tx, adminUserId, [AdminUserStatus.deactivated], {
      status             : AdminUserStatus.pending,
      isActive           : false,
      deactivatedAt      : null,
      deactivationReason : null,
      externalAuthId     : null,
      invitationSentAt   : null,
      invitationSentById : null,
      invitationExpiresAt: null,
    })
    await tx.adminUserPermission.deleteMany({ where: { adminUserId } })
    return { roleName: target.role?.name ?? null }
  })
  serviceLog.info({ adminUserId, actorId }, "Admin user reactivated — pending a new invitation")
  auditService.log({
    adminUserId: actorId,
    action     : "admin_user.reactivated",
    entityType : "AdminUser",
    entityId   : adminUserId,
    changes    : { before: { status: "deactivated" }, after: { status: "pending", permissions: [] } },
    metadata   : { roleName: result.roleName, note: "Reactivated with no permissions; a new invitation is required." },
  })
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
  await prisma.$transaction(async (tx) => {
    await transitionStatus(tx, adminUserId, [user.status], { status: AdminUserStatus.deactivated, isActive: false, deactivatedAt: new Date(), deactivationReason: reason, externalAuthId: null })
    // A deactivated admin retains their DB record (offboarding, not deletion)
    // but must hold no live permission grants.
    await tx.adminUserPermission.deleteMany({ where: { adminUserId } })
  })
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

//* ─── Reads ───────────────────────────────────────────────────────────────────
//
// ONE geographic eligibility rule for reads and writes: targetInScope
// (delegation-policy.ts) — inclusive containment of the target's single scope
// in the actor's. adminsInScopeWhere is its SQL transcription for lists; the
// detail read applies the pure rule to the loaded row. Out of scope is a 404
// (principle 6), not a 403.

/** The actor's resolved scope from the request chain (null = invalid → sees nothing). */
export function actorScopeOf(context: AdminScopeContext, valid = true): ResolvedScope | null {
  return resolvedScopeFrom(context, valid)
}

/**
 * targetInScope as a where-clause. A CITY target counts as inside a COUNTRY
 * scope by the CITY's own country (city.countryId), the same reading the
 * scope resolution uses. Combine with other conditions through AND (bug
 * class #2): it sets `id` and `scopes`.
 */
export function adminsInScopeWhere(scope: ResolvedScope | null): Prisma.AdminUserWhereInput {
  if (!scope) return { id: { in: [] } }
  const notSystem = { id: { not: SYSTEM_USER_ID } }
  if (scope.tier === "GLOBAL") return notSystem
  if (scope.tier === "COUNTRY") {
    return {
      ...notSystem,
      scopes: { some: { OR: [
        { scopeType: "COUNTRY", countryId: scope.countryId },
        { scopeType: "CITY", city: { countryId: scope.countryId! } },
      ] } },
    }
  }
  return { ...notSystem, scopes: { some: { scopeType: "CITY", cityId: scope.cityId } } }
}

const ADMIN_REF_SELECT = { id: true, firstName: true, lastName: true, email: true } as const

const DETAIL_INCLUDE = {
  role       : { include: { permissions: { include: { permission: true } } } },
  permissions: { include: { permission: true } },
  scopes     : { include: {
    country: { select: { id: true, name: true, code: true } },
    city   : { select: { id: true, name: true, countryId: true, status: true } },
  } },
  createdBy       : { select: ADMIN_REF_SELECT },
  invitationSentBy: { select: ADMIN_REF_SELECT },
} satisfies Prisma.AdminUserInclude

/**
 * What the ACTOR may do to this target, computed by the very checks the
 * mutations run — the ERP renders these and never re-derives them
 * (principle 1). Authority AND the status the action needs.
 */
function capabilitiesFor(actor: ActorAuthority, user: Subject) {
  const target = targetOf(user)
  const can = (key: string) => passes(() => { assertActorHolds(actor, key); assertCanManageTarget(actor, target) })
  const s = user.status
  const pool = poolOf(user.role)
  return {
    invite            : can(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND) && (s === AdminUserStatus.pending || s === AdminUserStatus.invited),
    changeRole        : can(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN) && s !== AdminUserStatus.deactivated,
    changeScope       : can(AdminPermissions.ADMIN_USERS_ROLES_ASSIGN) && s !== AdminUserStatus.deactivated,
    suspend           : can(AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND) && s === AdminUserStatus.active,
    reinstate         : can(AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE) && s === AdminUserStatus.suspended,
    reactivate        : can(AdminPermissions.ADMIN_USERS_ACCOUNTS_REINSTATE) && s === AdminUserStatus.deactivated,
    deactivate        : can(AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE) && s !== AdminUserStatus.deactivated,
    manageAvailability: can(AdminPermissions.ADMIN_USERS_ACCOUNTS_MANAGE_AVAILABILITY) && (s === AdminUserStatus.active || s === AdminUserStatus.suspended),
    delegation        : s === AdminUserStatus.deactivated ? false : assignmentOptions(actor, target, pool, "delegation").allowed,
    recovery          : s === AdminUserStatus.deactivated ? false : assignmentOptions(actor, target, pool, "recovery").allowed,
  }
}

export async function getAdminUser(adminUserId: string, actorId: string) {
  const actor = await loadActor(prisma, actorId)
  const user  = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { ...DETAIL_INCLUDE } })
  if (!user || user.id === SYSTEM_USER_ID || !targetInScope(actor.scope, scopeOfRows(user.scopes))) {
    throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  }
  const { role, ...rest } = user
  return {
    ...rest,
    role        : role ? { id: role.id, name: role.name, displayName: role.displayName, description: role.description } : null,
    isSelf      : user.id === actor.id,
    capabilities: capabilitiesFor(actor, user),
  }
}

export interface ListAdminUsersFilters {
  status?   : string
  roleId?   : string
  search?   : string
  countryId?: string
  page?     : number
  pageSize? : number
}

const ADMIN_USER_STATUSES = Object.values(AdminUserStatus) as AdminUserStatus[]

function parseStatusFilter(status: string | undefined): AdminUserStatus | undefined {
  if (!status) return undefined
  if (!ADMIN_USER_STATUSES.includes(status as AdminUserStatus)) {
    throw new ApiError(400, `Unknown status: ${status}`, "INVALID_STATUS_FILTER")
  }
  return status as AdminUserStatus
}

function pageNumber(value: number | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.trunc(value)))
}

/*
 * statusCounts describe the actor's WHOLE scoped population — every
 * administrator they may see — and ignore the list's filters, so the summary
 * stays a fixed picture of their directory while the table narrows. `total`
 * is the sum of the per-status counts. Both run on adminsInScopeWhere, the
 * same clause as the rows: nothing outside the actor's scope is ever counted.
 */
async function countAdminsByStatus(scopeWhere: Prisma.AdminUserWhereInput) {
  const groups = await prisma.adminUser.groupBy({ by: ["status"], where: scopeWhere, _count: { _all: true } })
  const byStatus = Object.fromEntries(ADMIN_USER_STATUSES.map((s) => [s, 0])) as Record<AdminUserStatus, number>
  for (const g of groups) byStatus[g.status] = g._count._all
  return { total: Object.values(byStatus).reduce((a, b) => a + b, 0), ...byStatus }
}

export async function listAdminUsers(filters: ListAdminUsersFilters, actorScope: ResolvedScope | null) {
  const status   = parseStatusFilter(filters.status)
  const { roleId, countryId } = filters
  const search   = filters.search?.trim()
  const page     = pageNumber(filters.page, 1)
  const pageSize = pageNumber(filters.pageSize, 20, 100)

  // An AND list: the actor's scope and the country filter both constrain
  // `scopes`, and one object would let the second overwrite the first.
  const scopeWhere = adminsInScopeWhere(actorScope)
  const and: Prisma.AdminUserWhereInput[] = [scopeWhere]
  if (status)    and.push({ status })
  if (roleId)    and.push({ roleId })
  if (countryId) and.push({ scopes: { some: { OR: [{ countryId }, { city: { countryId } }] } } })
  if (search) {
    and.push({ OR: [
      { email     : { contains: search, mode: "insensitive" } },
      { firstName : { contains: search, mode: "insensitive" } },
      { lastName  : { contains: search, mode: "insensitive" } },
      { employeeId: { contains: search, mode: "insensitive" } },
    ] })
  }
  const where: Prisma.AdminUserWhereInput = { AND: and }
  const scopesInclude = { include: { country: { select: { id: true, name: true, code: true } }, city: { select: { id: true, name: true } } } } as const

  const [users, total, statusCounts] = await Promise.all([
    prisma.adminUser.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" }, include: { role: true, scopes: scopesInclude } }),
    prisma.adminUser.count({ where }),
    countAdminsByStatus(scopeWhere),
  ])
  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize), statusCounts }
}

/** A role's CURRENT pool — active definitions only (an inactive key cannot be granted). */
export async function getRolePermissionPool(roleId: string) {
  const pool = await prisma.adminRolePermission.findMany({
    where  : { roleId, permission: { isActive: true } },
    include: { permission: true },
    orderBy: { permission: { module: "asc" } },
  })
  return pool.map((rp) => rp.permission)
}

/**
 * Roles, with what the server already knows about assigning each: the scope
 * tiers it may hold (ROLE_SCOPE_RULES) and whether it is assignable here at
 * all. The ERP offers exactly these (principle 1).
 */
export async function listRoles() {
  const roles = await prisma.adminRole.findMany({
    where  : { name: { not: "system" } },
    orderBy: { name: "asc" },
  })
  return roles.map((r) => ({
    ...r,
    allowedScopes: getAllowedScopesForRole(r.name),
    assignable   : !NOT_ASSIGNABLE_ROLES.has(r.name) && getAllowedScopesForRole(r.name).length > 0,
  }))
}

/*
 * The AdminUser ids an actor may see, for the audit read (AuditLog.entityId
 * has no FK to AdminUser). null = no restriction (GLOBAL). The same rule as
 * every other read: adminsInScopeWhere.
 */
export async function getManageableAdminUserIds(actorScopeContext: AdminScopeContext): Promise<string[] | null> {
  const scope = resolvedScopeFrom(actorScopeContext, true)
  if (scope?.tier === "GLOBAL") return null
  if (!scope) return []
  const rows = await prisma.adminUser.findMany({ where: adminsInScopeWhere(scope), select: { id: true } })
  return rows.map((u) => u.id)
}

//* ─── Permission assignment: what may be offered ─────────────────────────────
//
// The shared workflow for identity admins AND department leads. Neither read
// needs admin_users:profiles:read: a lead holding only the management key sees
// exactly the administrators they may assign to — never the rest of the
// directory, and a target they cannot assign to is a 404 like a missing one.

const OPTIONS_INCLUDE = {
  ...SUBJECT_INCLUDE,
  scopes: { include: { city: { select: { countryId: true, status: true, name: true } }, country: { select: { name: true } } } },
} satisfies Prisma.AdminUserInclude

type OptionsUser = Prisma.AdminUserGetPayload<{ include: typeof OPTIONS_INCLUDE }>

function summaryOf(user: OptionsUser) {
  return {
    id         : user.id,
    firstName  : user.firstName,
    lastName   : user.lastName,
    email      : user.email,
    status     : user.status,
    role       : user.role ? { id: user.role.id, name: user.role.name, displayName: user.role.displayName } : null,
    scope      : scopeOfRows(user.scopes),
    scopeLabel : user.scopes[0]?.city?.name ?? user.scopes[0]?.country?.name ?? (user.scopes[0]?.scopeType === "GLOBAL" ? "Global" : null),
  }
}

/** The actor's assignment authority over one target, in both modes. */
function optionsFor(actor: ActorAuthority, user: Subject) {
  if (user.status === AdminUserStatus.deactivated) {
    const closed = { allowed: false, code: "INVALID_STATUS", message: "Deactivated administrators hold no permissions", movable: [] as string[] }
    return { delegation: closed, recovery: closed }
  }
  const target = targetOf(user)
  const pool   = poolOf(user.role)
  return {
    delegation: assignmentOptions(actor, target, pool, "delegation"),
    recovery  : actor.permissions.has(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)
      ? assignmentOptions(actor, target, pool, "recovery")
      : { allowed: false, code: "FORBIDDEN", message: null, movable: [] as string[] },
  }
}

/** GET /users/:id/permission-options */
export async function getPermissionOptions(adminUserId: string, actorId: string) {
  const actor = await loadActor(prisma, actorId)
  const user  = await prisma.adminUser.findUnique({ where: { id: adminUserId }, include: OPTIONS_INCLUDE })
  if (!user || user.id === SYSTEM_USER_ID) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  const options = optionsFor(actor, user)
  // Reachable only for an actor who may assign to this target under SOME
  // mode, or who may read the directory there anyway.
  const canRead = actor.permissions.has(AdminPermissions.ADMIN_USERS_PROFILES_READ) && targetInScope(actor.scope, scopeOfRows(user.scopes))
  if (!options.delegation.allowed && !options.recovery.allowed && !canRead) {
    throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  }
  const pool = (user.role?.permissions ?? [])
    .map((rp) => rp.permission)
    .filter((p) => p.isActive)
    .map((p) => ({ key: p.key, module: p.module, description: p.description }))
    .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key))
  const poolKeys = new Set(pool.map((p) => p.key))
  const grants   = user.permissions.map((g) => g.permission.key)
  return {
    target    : summaryOf(user),
    pool,
    grants,
    /** Grant rows outside the current pool: confer nothing, dropped on the next save. */
    staleGrants: grants.filter((k) => !poolKeys.has(k)),
    delegation: options.delegation,
    recovery  : options.recovery,
  }
}

/**
 * GET /users/delegable — the administrators this actor may assign permissions
 * to (ordinary delegation or recovery), with which mode applies. Computed by
 * the same assignmentOptions over every admin in the actor's scope, so it can
 * never list someone the write would refuse, nor omit someone it would accept.
 */
export async function listDelegableAdmins(
  filters: { search?: string; mode?: string; page?: number; pageSize?: number },
  actorId: string,
) {
  const actor    = await loadActor(prisma, actorId)
  const page     = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const search   = filters.search?.trim()

  const and: Prisma.AdminUserWhereInput[] = [
    adminsInScopeWhere(actor.scope),
    { id: { not: actorId }, status: { not: AdminUserStatus.deactivated } },
  ]
  if (search) {
    and.push({ OR: [
      { email    : { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName : { contains: search, mode: "insensitive" } },
    ] })
  }
  const candidates = await prisma.adminUser.findMany({ where: { AND: and }, include: OPTIONS_INCLUDE, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] })

  const rows = candidates
    .map((u) => {
      const o = optionsFor(actor, u)
      return { ...summaryOf(u), grantCount: u.permissions.length, delegation: o.delegation.allowed, recovery: o.recovery.allowed }
    })
    .filter((r) => (filters.mode === "recovery" ? r.recovery : filters.mode === "delegation" ? r.delegation : r.delegation || r.recovery))

  const total = rows.length
  return { users: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
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

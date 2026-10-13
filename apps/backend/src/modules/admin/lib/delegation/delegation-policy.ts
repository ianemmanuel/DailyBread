import { AdminPermissions, AdminRoleNames } from "@repo/types/enums"
import type { AdminScopeContext } from "@repo/types/backend"
import { ApiError } from "@/middleware/error"
import { validateScopeForRole } from "../scope/scope-rules"

/*
 * DELEGATION POLICY — who may provision, re-role, re-scope, grant to and
 * manage which administrator. Pure: every input is already loaded from the
 * database by the caller (admin.user.service.ts), so the whole rule is
 * unit-testable without Prisma (principle 8).
 *
 * The model, and the only things that decide:
 *   ROLE   — the ceiling: which keys an admin MAY be given (its pool)
 *   SCOPE  — where: GLOBAL ⊃ COUNTRY ⊃ CITY, containment is inclusive
 *   GRANTS — what they actually hold (effective = grants ∩ current pool)
 * There is NO administrator hierarchy beyond scope containment: being the same
 * role or the same tier as the target never refuses an otherwise authorized
 * action, and never authorizes one either.
 *
 * Three kinds of authority:
 *
 *   PROVISIONING / LIFECYCLE (holders of the admin_users key for the action).
 *   Create, invite, role, scope, suspend, reinstate, reactivate, deactivate,
 *   availability. The actor is GLOBAL or COUNTRY, and the target — and any
 *   scope assigned to it — sits inside the actor's scope
 *   (assertCanManageTarget, assertProvisioningScope). Never yourself; never a
 *   super_admin.
 *
 *   ORDINARY DELEGATION (admin_users:permissions:manage). PERMISSION
 *   OWNERSHIP: every key added or removed is one the actor effectively holds,
 *   inside the target role's current pool, for a target of a role the actor
 *   may manage (the same role, or a pool that covers the target role's) and
 *   inside the actor's scope.
 *
 *   RECOVERY / BOOTSTRAP (admin_users:permissions:recover). The exception to
 *   ownership, for when nobody in a department can grant what it needs — its
 *   first lead, or the only lead has gone: ANY key of the target role's
 *   current pool may be added or removed, held or not. Independently gated,
 *   and still bounded by scope, the target's pool and role/scope validity. It
 *   never reaches a role whose pool can itself hold the recovery key (so
 *   recovery cannot mint recovery-holders: identity and super admin stay
 *   under ordinary delegation), never a super_admin and never yourself.
 *
 * "May manage the target's ROLE" is decided by POOLS, never by a role name.
 * Every permission an actor uses here is EFFECTIVE. super_admin remains the
 * CLI-controlled exception: never assignable, never a target — a TARGET
 * protection, by name, the only place a role name decides anything here.
 */

export type ScopeTier = "GLOBAL" | "COUNTRY" | "CITY"

/** One well-formed scope; a CITY scope's country is the city's own. */
export interface ResolvedScope {
  tier     : ScopeTier
  countryId: string | null
  cityId   : string | null
}

export interface ActorAuthority {
  id         : string
  roleName   : string | null
  /** null = no single well-formed scope; such an actor is authorised for nothing. */
  scope      : ResolvedScope | null
  /** EFFECTIVE keys: active grants ∩ the actor's current role pool. */
  permissions: ReadonlySet<string>
  /** The actor's CURRENT role pool (active keys). */
  pool       : ReadonlySet<string>
}

export interface TargetSubject {
  id         : string
  roleName   : string | null
  /** null = no single well-formed scope (legacy or malformed rows). */
  scope      : ResolvedScope | null
  /** EFFECTIVE keys, same definition as the actor's. */
  permissions: ReadonlySet<string>
}

/** Which authority a permission assignment is exercised under. */
export type AssignmentMode = "delegation" | "recovery"

const TIER_RANK: Record<ScopeTier, number> = { GLOBAL: 0, COUNTRY: 1, CITY: 2 }

const MANAGE  = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE
const RECOVER = AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER

/** The key each assignment mode is gated on. */
export const ASSIGNMENT_KEY: Record<AssignmentMode, string> = { delegation: MANAGE, recovery: RECOVER }

export const NOT_ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([AdminRoleNames.SUPER_ADMIN, "system"])

/** AdminScopeContext (as the middleware and deriveScopeContext build it) → ResolvedScope. */
export function resolvedScopeFrom(context: AdminScopeContext, valid: boolean): ResolvedScope | null {
  if (!valid) return null
  if (context.isGlobal) return { tier: "GLOBAL", countryId: null, cityId: null }
  const countryId = context.countryIds[0] ?? null
  if (context.tier === "COUNTRY" && countryId) return { tier: "COUNTRY", countryId, cityId: null }
  const cityId = context.cityIds[0] ?? null
  if (context.tier === "CITY" && countryId && cityId) return { tier: "CITY", countryId, cityId }
  return null
}

/**
 * Does `outer` cover `inner`? Inclusive by default; `strict` additionally
 * requires `inner` to sit at a LOWER tier.
 */
export function scopeContains(outer: ResolvedScope, inner: ResolvedScope, strict = false): boolean {
  if (strict && TIER_RANK[inner.tier] <= TIER_RANK[outer.tier]) return false
  if (outer.tier === "GLOBAL") return true
  if (outer.tier === "COUNTRY") return inner.tier !== "GLOBAL" && inner.countryId === outer.countryId
  // A CITY scope contains only itself.
  return inner.tier === "CITY" && inner.cityId === outer.cityId
}

/** Two scopes naming the same place. */
export function sameScope(a: ResolvedScope, b: ResolvedScope): boolean {
  return a.tier === b.tier && a.countryId === b.countryId && a.cityId === b.cityId
}

/** Pool coverage: the actor's current role pool holds every key of the target role's (non-empty) pool. */
export function poolCovers(actorPool: ReadonlySet<string>, targetPool: ReadonlySet<string>): boolean {
  if (targetPool.size === 0) return false
  for (const key of targetPool) if (!actorPool.has(key)) return false
  return true
}

/**
 * THE geographic eligibility rule, shared by reads (list, detail, audit) and
 * every mutation: may an actor at `actorScope` reach a target at
 * `targetScope`? Inclusive containment. A target with no valid scope is
 * reachable only from GLOBAL, so it can still be repaired.
 */
export function targetInScope(actorScope: ResolvedScope | null, targetScope: ResolvedScope | null): boolean {
  if (!actorScope) return false
  if (!targetScope) return actorScope.tier === "GLOBAL"
  return scopeContains(actorScope, targetScope)
}

function forbid(message: string, code: string): never {
  throw new ApiError(403, message, code)
}

/** The actor must effectively hold `key` — the route's own gate, re-checked
 *  against the role pool so a stale out-of-pool grant does not count. */
export function assertActorHolds(actor: ActorAuthority, key: string): void {
  if (!actor.permissions.has(key)) {
    forbid("You do not have permission to perform this action", "FORBIDDEN")
  }
}

/** A provisioner is GLOBAL or COUNTRY scoped. A CITY (or scope-less) admin never provisions. */
export function assertCanProvision(actor: ActorAuthority, requiredKey: string): ResolvedScope {
  assertActorHolds(actor, requiredKey)
  if (!actor.scope || actor.scope.tier === "CITY") {
    forbid("Only globally- or country-scoped administrators can provision administrators", "PROVISIONER_SCOPE_REQUIRED")
  }
  return actor.scope
}

/** The role/scope pair a target will hold must be assignable and valid for that role. */
export function assertAssignableRoleAndScope(roleName: string, scope: ResolvedScope): void {
  if (NOT_ASSIGNABLE_ROLES.has(roleName)) {
    throw new ApiError(400, "This role cannot be assigned through admin user management", "INVALID_ROLE")
  }
  validateScopeForRole(roleName, [scope.tier])
}

/**
 * Provisioning: the actor may place a target at `targetScope` — any role, any
 * tier inside the actor's own scope (inclusive), never broader. Used for
 * create, and for the NEW scope on a re-scope.
 */
export function assertProvisioningScope(actorScope: ResolvedScope, targetScope: ResolvedScope): void {
  if (!scopeContains(actorScope, targetScope)) {
    forbid("You cannot assign a scope outside your own scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * PROVISIONING / LIFECYCLE: may `actor` act on the EXISTING `target`? Shared
 * by role, scope, invite, suspend, reinstate, reactivate, deactivate and
 * availability (each also needs its own admin_users key).
 *
 *   - never yourself, never a super_admin
 *   - the actor is GLOBAL or COUNTRY
 *   - the target sits inside the actor's scope (inclusive) — whatever its
 *     role, the actor's own role at the actor's own tier included
 */
export function assertCanManageTarget(actor: ActorAuthority, target: TargetSubject): void {
  if (actor.id === target.id) {
    forbid("You cannot manage your own administrator account", "SELF_ACTION_FORBIDDEN")
  }
  if (target.roleName === AdminRoleNames.SUPER_ADMIN) {
    forbid("Super admin accounts cannot be managed here", "SUPER_ADMIN_PROTECTED")
  }
  if (!actor.scope || actor.scope.tier === "CITY") {
    forbid("City-scoped administrators cannot manage other administrators", "PROVISIONER_SCOPE_REQUIRED")
  }
  if (!targetInScope(actor.scope, target.scope)) {
    forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * May `actor` assign permissions to `target` at all, under `mode`? Everything
 * except the per-key rule (canMoveKey):
 *   1. the actor effectively holds the mode's key (manage / recover)
 *   2. not themselves; never a super_admin target
 *   3. the actor is GLOBAL or COUNTRY
 *   4. delegation: the actor may manage the target's ROLE (same role, or pool
 *      coverage). recovery: the target's role is assignable and its pool does
 *      NOT contain the recovery key
 *   5. the target's scope is valid and sits inside the actor's (inclusive)
 *   6. the target's role/scope pair is valid
 */
export function assertCanAssignTo(actor: ActorAuthority, target: TargetSubject, targetPool: ReadonlySet<string>, mode: AssignmentMode): ResolvedScope {
  assertActorHolds(actor, ASSIGNMENT_KEY[mode])
  if (actor.id === target.id) {
    forbid("You cannot change your own permissions", "SELF_ACTION_FORBIDDEN")
  }
  if (target.roleName === AdminRoleNames.SUPER_ADMIN) {
    forbid("Super admin accounts cannot be managed here", "SUPER_ADMIN_PROTECTED")
  }
  if (!actor.scope || actor.scope.tier === "CITY") {
    forbid("City-scoped administrators cannot assign permissions", "GRANTOR_SCOPE_REQUIRED")
  }
  if (!target.roleName) {
    throw new ApiError(400, "User has no role assigned", "NO_ROLE")
  }

  if (mode === "delegation") {
    const sameRole = target.roleName === actor.roleName
    if (!sameRole && !poolCovers(actor.pool, targetPool)) {
      forbid("You cannot manage administrators of this role", "ROLE_NOT_MANAGEABLE")
    }
  } else {
    if (NOT_ASSIGNABLE_ROLES.has(target.roleName)) {
      forbid("This role cannot be managed here", "ROLE_NOT_MANAGEABLE")
    }
    // A role that can hold the recovery key is outside recovery's reach, so
    // recovery can never mint another recovery-holder (nor manage its own
    // department). Decided by the POOL, not the role's name.
    if (targetPool.has(RECOVER)) {
      forbid("Recovery does not apply to this role — its permissions are managed by ordinary delegation", "RECOVERY_ROLE_PROTECTED")
    }
  }

  if (!target.scope) {
    if (actor.scope.tier !== "GLOBAL") forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
    throw new ApiError(400, "This administrator has no valid scope — fix their scope before assigning permissions", "TARGET_SCOPE_INVALID")
  }
  if (!scopeContains(actor.scope, target.scope)) {
    forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
  }
  assertAssignableRoleAndScope(target.roleName, target.scope)
  return target.scope
}

/**
 * The PER-KEY rule, once the target is assignable: may this key be added to,
 * or removed from, the target? It must be in the target role's current pool;
 * under delegation the actor must also effectively hold it (ownership); under
 * recovery that is waived. A key OUTSIDE the pool (a stale grant, which
 * confers nothing) is never addable and is always dropped freely.
 */
export function canMoveKey(actor: ActorAuthority, key: string, targetPool: ReadonlySet<string>, mode: AssignmentMode): boolean {
  if (!targetPool.has(key)) return false
  return mode === "recovery" || actor.permissions.has(key)
}

/**
 * PERMISSION ASSIGNMENT — the request REPLACES the target's grants.
 * assertCanAssignTo, then every requested key is in the target pool, then
 * every key added or removed passes canMoveKey.
 */
export function assertCanAssignPermissions(input: {
  actor        : ActorAuthority
  target       : TargetSubject
  targetPool   : ReadonlySet<string>
  requestedKeys: readonly string[]
  currentKeys  : readonly string[]
  mode         : AssignmentMode
}): { added: string[]; removed: string[] } {
  const { actor, target, targetPool, requestedKeys, currentKeys, mode } = input
  assertCanAssignTo(actor, target, targetPool, mode)

  const outOfPool = requestedKeys.filter((k) => !targetPool.has(k))
  if (outOfPool.length > 0) {
    throw new ApiError(400, `These permissions are not in this role's pool: ${outOfPool.join(", ")}`, "PERMISSIONS_OUT_OF_POOL")
  }

  const current   = new Set(currentKeys)
  const requested = new Set(requestedKeys)
  const added   = requestedKeys.filter((k) => !current.has(k))
  const removed = currentKeys.filter((k) => !requested.has(k))

  const blocked = [...added, ...removed.filter((k) => targetPool.has(k))]
    .filter((k) => !canMoveKey(actor, k, targetPool, mode))
  if (blocked.length > 0) {
    forbid(`You can only grant or remove permissions you hold yourself: ${blocked.join(", ")}`, "PERMISSION_NOT_HELD")
  }
  return { added, removed }
}

/** Ordinary delegation (the name existing callers use). */
export function assertCanDelegatePermissions(input: Omit<Parameters<typeof assertCanAssignPermissions>[0], "mode">) {
  return assertCanAssignPermissions({ ...input, mode: "delegation" })
}

export interface AssignmentOption {
  /** May the actor assign permissions to this target under this mode at all? */
  allowed: boolean
  /** Why not — the same code the write would fail with. */
  code   : string | null
  message: string | null
  /** Pool keys the actor may add or remove under this mode. */
  movable: string[]
}

/**
 * What the ERP may OFFER, computed by running the very rules the write runs
 * (assertCanAssignTo + canMoveKey), so the screen and the server cannot drift
 * (principle 1). An agreement test pins this against assertCanAssignPermissions.
 */
export function assignmentOptions(actor: ActorAuthority, target: TargetSubject, targetPool: ReadonlySet<string>, mode: AssignmentMode): AssignmentOption {
  try {
    assertCanAssignTo(actor, target, targetPool, mode)
  } catch (err) {
    const e = err as ApiError
    return { allowed: false, code: e.code ?? "FORBIDDEN", message: e.message, movable: [] }
  }
  return { allowed: true, code: null, message: null, movable: [...targetPool].filter((k) => canMoveKey(actor, k, targetPool, mode)).sort() }
}

/** Non-throwing form of a check, for server-computed capability flags. */
export function passes(check: () => unknown): boolean {
  try { check(); return true } catch { return false }
}

const PERMISSION_KEY_SHAPE = /^[a-z_]+:[a-z_]+:[a-z_]+$/
const MAX_PERMISSION_KEYS  = 500

/** Request-body permission keys: an array of distinct, well-formed strings. */
export function parsePermissionKeys(raw: unknown): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_PERMISSION_KEYS || raw.some((k) => typeof k !== "string" || !PERMISSION_KEY_SHAPE.test(k))) {
    throw new ApiError(400, "permissionKeys must be an array of permission keys", "INVALID_PERMISSION_KEYS")
  }
  const keys = raw as string[]
  if (new Set(keys).size !== keys.length) {
    throw new ApiError(400, "permissionKeys contains duplicates", "DUPLICATE_PERMISSION_KEYS")
  }
  return keys
}

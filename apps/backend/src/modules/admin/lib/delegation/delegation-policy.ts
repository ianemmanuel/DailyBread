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
 * Two kinds of authority, deliberately different:
 *
 *   PROVISIONING (identity administrators — holders of the admin_users key
 *   for the action). Creates and invites an employee, assigns their ROLE and
 *   SCOPE, and runs lifecycle actions — never grants permissions. The actor's
 *   scope bounds the target's, inclusively, for any OTHER role; a target of
 *   the actor's OWN role only from strictly above (assertCanManageTarget).
 *
 *   PERMISSION DELEGATION (designated superiors — holders of
 *   admin_users:permissions:manage). Grants keys the actor effectively holds
 *   to an administrator whose ROLE the actor may manage, inside the actor's
 *   scope (inclusive: a COUNTRY superior manages COUNTRY and CITY admins of
 *   their country). Between same-tier peers only keys the actor holds move,
 *   in either direction, and the management key never moves sideways
 *   (assertCanDelegatePermissions).
 *
 * "May manage the target's ROLE" is decided by POOLS, never by a role name:
 * the same role, or an actor whose current role pool contains the target
 * role's entire current pool. Today only super_admin's pool (every key)
 * covers another role's; a test pins that no other pool does.
 *
 * Every permission an actor uses here is EFFECTIVE: granted, active, and
 * inside the actor's CURRENT role pool. A stale grant outside that pool is not
 * authority (the per-request runtime ceiling is a separate, later phase; these
 * checks do not lean on its absence).
 *
 * super_admin remains the CLI-controlled exception it always was: never
 * assignable, never a target. That is a TARGET protection, by name, and it is
 * the only place a role name decides anything here.
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

const TIER_RANK: Record<ScopeTier, number> = { GLOBAL: 0, COUNTRY: 1, CITY: 2 }

const MANAGE = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE

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
 * tier inside the actor's own scope (inclusive). Used for create, and for the
 * NEW scope on a re-scope.
 */
export function assertProvisioningScope(actorScope: ResolvedScope, targetScope: ResolvedScope): void {
  if (!scopeContains(actorScope, targetScope)) {
    forbid("You cannot assign a scope outside your own scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * PROVISIONING / LIFECYCLE: may `actor` act on the EXISTING `target`? Shared
 * by role, scope, invite, suspend, reinstate, deactivate and availability.
 *
 *   - never yourself, never a super_admin
 *   - a target of the actor's own role → strictly below only (no peers)
 *   - any other role → inside the actor's scope (inclusive)
 *
 * A target with no well-formed scope is reachable only by a GLOBAL actor, so
 * it can still be repaired. Lifecycle authority is deliberately NOT widened
 * to same-tier peers: who may suspend or deactivate whom is an open product
 * decision.
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
  if (!target.scope) {
    if (actor.scope.tier === "GLOBAL") return
    forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
  }
  const sameRole = target.roleName !== null && target.roleName === actor.roleName
  if (sameRole) {
    if (!scopeContains(actor.scope, target.scope, true)) {
      forbid("You can only manage administrators of your own role who are scoped below you", "SUPERIOR_SCOPE_REQUIRED")
    }
    return
  }
  if (!scopeContains(actor.scope, target.scope)) {
    forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
  }
}

/**
 * PERMISSION DELEGATION — all of:
 *   1. the actor effectively holds admin_users:permissions:manage
 *   2. not themselves; never a super_admin target
 *   3. the actor is GLOBAL or COUNTRY (a CITY admin is never a superior)
 *   4. the actor may manage the target's ROLE: same role, or pool coverage
 *   5. the target's scope sits inside the actor's (inclusive)
 *   6. the target's role/scope pair is valid
 *   7. every requested key is in the target role's CURRENT pool
 *   8. every key being ADDED is one the actor effectively holds
 *   9. PEERS (same role, same tier): every key ADDED or REMOVED is one the
 *      actor holds, and the management key itself is never added or removed
 *
 * Below the actor, revoking needs no matching grant: taking a key away never
 * widens anyone, and a superior must be able to strip a subordinate's grant
 * they never held. Between peers it does, so a peer cannot undo a superior's
 * decision about a permission the peer was never trusted with.
 */
export function assertCanDelegatePermissions(input: {
  actor          : ActorAuthority
  target         : TargetSubject
  targetPool     : ReadonlySet<string>
  requestedKeys  : readonly string[]
  currentKeys    : readonly string[]
}): { added: string[]; removed: string[] } {
  const { actor, target, targetPool, requestedKeys, currentKeys } = input

  assertActorHolds(actor, MANAGE)
  if (actor.id === target.id) {
    forbid("You cannot change your own permissions", "SELF_ACTION_FORBIDDEN")
  }
  if (target.roleName === AdminRoleNames.SUPER_ADMIN) {
    forbid("Super admin accounts cannot be managed here", "SUPER_ADMIN_PROTECTED")
  }
  if (!actor.scope || actor.scope.tier === "CITY") {
    forbid("City-scoped administrators cannot grant permissions", "SUPERIOR_SCOPE_REQUIRED")
  }
  if (!target.roleName) {
    throw new ApiError(400, "User has no role assigned", "NO_ROLE")
  }

  const sameRole = target.roleName === actor.roleName
  if (!sameRole && !poolCovers(actor.pool, targetPool)) {
    forbid("You cannot manage administrators of this role", "ROLE_NOT_MANAGEABLE")
  }

  if (!target.scope) {
    if (actor.scope.tier !== "GLOBAL") forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
    throw new ApiError(400, "This administrator has no valid scope — fix their scope before granting permissions", "TARGET_SCOPE_INVALID")
  }
  if (!scopeContains(actor.scope, target.scope)) {
    forbid("This administrator is outside your scope", "SCOPE_FORBIDDEN")
  }
  assertAssignableRoleAndScope(target.roleName, target.scope)

  const outOfPool = requestedKeys.filter((k) => !targetPool.has(k))
  if (outOfPool.length > 0) {
    throw new ApiError(400, `These permissions are not in this role's pool: ${outOfPool.join(", ")}`, "PERMISSIONS_OUT_OF_POOL")
  }

  const current   = new Set(currentKeys)
  const requested = new Set(requestedKeys)
  const added   = requestedKeys.filter((k) => !current.has(k))
  const removed = currentKeys.filter((k) => !requested.has(k))

  // PEERS — the same role at the actor's own tier. Protect the KEY, not the
  // person: a peer may add or remove only permissions the actor itself holds,
  // and never the management key, which only someone strictly above (or a
  // pool-covering actor) grants or removes. That closes the lateral takeover
  // (stripping a fellow lead's key) and the lateral hand-out (minting a new
  // peer lead), without making the key a rank that freezes a peer's ordinary
  // grants.
  const peer = sameRole && target.scope.tier === actor.scope.tier
  if (peer && (added.includes(MANAGE) || removed.includes(MANAGE))) {
    forbid(
      "Only an administrator above this one can grant or remove the permission-management permission",
      "PEER_MANAGEMENT_KEY_PROTECTED",
    )
  }

  const notHeld = [...added, ...(peer ? removed : [])].filter((k) => !actor.permissions.has(k))
  if (notHeld.length > 0) {
    forbid(
      peer
        ? `At your own level you can only grant or remove permissions you hold: ${notHeld.join(", ")}`
        : `You cannot grant permissions you do not hold: ${notHeld.join(", ")}`,
      "PERMISSION_NOT_HELD",
    )
  }
  return { added, removed }
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

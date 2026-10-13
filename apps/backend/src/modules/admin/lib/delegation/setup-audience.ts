import { AdminPermissions } from "@repo/types/enums"
import {
  assignmentOptions,
  type ActorAuthority,
  type AssignmentMode,
  type ResolvedScope,
  type TargetSubject,
} from "./delegation-policy"

/*
 * PERMISSION SETUP AUDIENCE — who sees an invited administrator's pending
 * initial setup, and whose navigation it marks. Pure, and derived from live
 * authority on every read: no recipient list is ever stored, so a delegate
 * who is suspended, loses a key or moves scope stops seeing tasks at once.
 *
 * Every visible task sits in ONE lane for the viewer:
 *   department — the normal audience: same role, the management key, and
 *                placed for the target (a GLOBAL target's GLOBAL leads; a
 *                COUNTRY or CITY target's COUNTRY leads in that country).
 *   recovery   — the viewer's recovery reaches the target.
 *   oversight  — the viewer's ordinary delegation reaches the target without
 *                being its normal audience (a GLOBAL lead over a COUNTRY
 *                target; super_admin through pool coverage).
 * Visibility and the lane both come from assignmentOptions — the rule the
 * save runs — so the queue can never offer a task the write would refuse.
 *
 * ATTENTION (the nav count): always for the department; for recovery holders
 * and super admins only when the department has nobody who could pick it up.
 */

export type SetupLane = "department" | "recovery" | "oversight"

export interface SetupClassification {
  lane     : SetupLane
  /** The authority the viewer would complete it under. */
  mode     : AssignmentMode
  attention: boolean
}

/** A potential department delegate, as loaded by effectivelyHoldsWhere(MANAGE). */
export interface DelegateCandidate {
  id      : string
  roleName: string | null
  scope   : ResolvedScope | null
}

const MANAGE = AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE

/** Where a target's normal delegates sit. CITY delegates never qualify. */
export function isDepartmentPlacement(delegate: ResolvedScope, target: ResolvedScope): boolean {
  if (target.tier === "GLOBAL") return delegate.tier === "GLOBAL"
  return delegate.tier === "COUNTRY" && delegate.countryId === target.countryId
}

/** Is `candidate` (already known to hold the management key effectively) in the target's normal audience? */
export function isDepartmentDelegate(candidate: DelegateCandidate, target: TargetSubject): boolean {
  return candidate.id !== target.id
    && candidate.roleName !== null
    && candidate.roleName === target.roleName
    && !!candidate.scope && !!target.scope
    && isDepartmentPlacement(candidate.scope, target.scope)
}

/** Does anyone in the department currently hold the authority to complete this setup? */
export function departmentStaffed(candidates: readonly DelegateCandidate[], target: TargetSubject): boolean {
  return candidates.some((c) => isDepartmentDelegate(c, target))
}

/** The viewer's lane for one pending setup, or null when they may not complete it. */
export function classifySetup(
  actor     : ActorAuthority,
  target    : TargetSubject,
  targetPool: ReadonlySet<string>,
  staffed   : boolean,
): SetupClassification | null {
  const delegation = assignmentOptions(actor, target, targetPool, "delegation").allowed
  const recovery   = assignmentOptions(actor, target, targetPool, "recovery").allowed

  if (delegation && actor.permissions.has(MANAGE) && isDepartmentDelegate(actor, target)) {
    return { lane: "department", mode: "delegation", attention: true }
  }
  if (recovery) return { lane: "recovery", mode: "recovery", attention: !staffed }
  // A same-role lead outside the normal placement is never nudged; cross-role
  // reach (pool coverage — super_admin only) is, when nobody else can act.
  if (delegation) return { lane: "oversight", mode: "delegation", attention: !staffed && actor.roleName !== target.roleName }
  return null
}

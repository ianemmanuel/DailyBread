import { prisma, AdminPermissionSetupStatus, AdminUserStatus } from "@repo/db"
import { AdminPermissions } from "@repo/types/enums"
import { effectivelyHoldsWhere } from "@/lib/permissions/effective"
import {
  classifySetup,
  departmentStaffed,
  type DelegateCandidate,
  type SetupClassification,
  type SetupLane,
} from "../lib/delegation/setup-audience"
import type { ActorAuthority } from "../lib/delegation/delegation-policy"
import {
  adminsInScopeWhere,
  loadActor,
  OPTIONS_INCLUDE,
  poolOf,
  scopeOfRows,
  summaryOf,
  targetOf,
} from "./admin.user.service"

/*
 * The pending permission-setup queue. ONE row per invited account
 * (AdminPermissionSetup); who sees it, in which lane, and whether it counts
 * on the viewer's navigation are derived here from live authority
 * (lib/delegation/setup-audience.ts). Out-of-scope accounts never reach the
 * classifier: the SQL pre-filter is the shared adminsInScopeWhere, so they
 * cannot surface in rows, counts or errors.
 */

/** Pending setups are new hires, a small set; the cap only bounds a pathological backlog. */
const MAX_PENDING = 500

const LANES: readonly SetupLane[] = ["department", "recovery", "oversight"]

interface VisibleSetup {
  openedAt      : Date
  classification: SetupClassification
  target        : ReturnType<typeof summaryOf> & { countryName: string | null }
}

async function visibleSetups(actor: ActorAuthority): Promise<VisibleSetup[]> {
  const rows = await prisma.adminPermissionSetup.findMany({
    where: {
      status   : AdminPermissionSetupStatus.PENDING,
      adminUser: { AND: [adminsInScopeWhere(actor.scope), { id: { not: actor.id }, status: { not: AdminUserStatus.deactivated } }] },
    },
    include: { adminUser: { include: OPTIONS_INCLUDE } },
    orderBy: { openedAt: "asc" },
    take   : MAX_PENDING,
  })
  if (rows.length === 0) return []

  const roleNames  = [...new Set(rows.map((r) => r.adminUser.role?.name).filter((n): n is string => !!n))]
  const delegates  = await prisma.adminUser.findMany({
    where : { AND: [effectivelyHoldsWhere(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE), { role: { name: { in: roleNames } } }] },
    select: { id: true, role: { select: { name: true } }, scopes: { include: { city: { select: { countryId: true, status: true } } } } },
  })
  const candidates: DelegateCandidate[] = delegates.map((d) => ({ id: d.id, roleName: d.role?.name ?? null, scope: scopeOfRows(d.scopes) }))

  return rows.flatMap((row) => {
    const target = targetOf(row.adminUser)
    const classification = classifySetup(actor, target, poolOf(row.adminUser.role), departmentStaffed(candidates, target))
    if (!classification) return []
    return [{
      openedAt: row.openedAt,
      classification,
      target  : { ...summaryOf(row.adminUser), countryName: row.adminUser.scopes[0]?.country?.name ?? null },
    }]
  })
}

function countsOf(setups: VisibleSetup[]) {
  const byLane = Object.fromEntries(LANES.map((l) => [l, 0])) as Record<SetupLane, number>
  for (const s of setups) byLane[s.classification.lane]++
  return { total: setups.length, attention: setups.filter((s) => s.classification.attention).length, ...byLane }
}

/** GET /users/permission-setup/summary — the navigation count. */
export async function getPermissionSetupSummary(actorId: string) {
  const { total, attention } = countsOf(await visibleSetups(await loadActor(prisma, actorId)))
  return { total, attention }
}

/** GET /users/permission-setup — the queue, oldest first. */
export async function listPermissionSetups(filters: { lane?: string; page?: number; pageSize?: number }, actorId: string) {
  const lane = filters.lane && (LANES as readonly string[]).includes(filters.lane) ? (filters.lane as SetupLane) : null
  const page     = Math.max(1, Math.trunc(filters.page ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 20) || 20))

  const setups = await visibleSetups(await loadActor(prisma, actorId))
  const rows   = lane ? setups.filter((s) => s.classification.lane === lane) : setups
  return {
    setups: rows.slice((page - 1) * pageSize, page * pageSize).map((s) => ({
      openedAt: s.openedAt,
      ...s.classification,
      target  : s.target,
    })),
    total     : rows.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    counts    : countsOf(setups),
  }
}

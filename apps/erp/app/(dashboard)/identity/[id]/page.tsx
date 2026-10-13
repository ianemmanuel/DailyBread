import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Info } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { BackToUsers } from "@/components/identity/detail/BackToUsers"
import { AccountHeader } from "@/components/identity/detail/AccountHeader"
import { AccountDetails } from "@/components/identity/detail/AccountDetails"
import { PermissionsPanel } from "@/components/identity/detail/PermissionsPanel"
import { AccountActions } from "@/components/identity/lifecycle/AccountActions"
import { SetAvailabilityForm } from "@/components/identity/SetAvailabilityForm"
import { UpdateRoleForm } from "@/components/identity/UpdateRoleForm"
import { UpdateScopesForm } from "@/components/identity/UpdateScopesForm"
import type { AdminRole, AdminUserDetail, PermissionOptions } from "@/types"

export const metadata: Metadata = { title: "Administrator" }

interface Props { params: Promise<{ id: string }> }

async function loadUser(id: string): Promise<AdminUserDetail> {
  try {
    return await adminFetch<AdminUserDetail>(`/admin/v1/users/${encodeURIComponent(id)}`, {
      next: { revalidate: 60, tags: [`admin-user-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }
}

function notice(user: AdminUserDetail): string | null {
  if (user.isSelf) return "This is your own account. You cannot suspend, deactivate or change the access of your own account here."
  if (user.status === "pending") return "Check the role and scope before sending the invitation. Permissions can be assigned now and take effect once it is accepted."
  return null
}

/*
 * One detail page for every status (pending and invited accounts used to have
 * a separate /review page). Every action shown comes from the server's
 * `capabilities` for this viewer and this account — never re-derived here.
 */
export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getAdminSession()
  const has = (key: string) => session.permissions.includes(key as never)

  if (!has(AdminPermissions.ADMIN_USERS_PROFILES_READ)) {
    // Department leads assign permissions without directory access.
    if (has(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE) || has(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)) {
      redirect(`/identity/permissions/${encodeURIComponent(id)}`)
    }
    redirect("/identity")
  }

  const user = await loadUser(id)
  const can  = user.capabilities

  const [options, allRoles] = await Promise.all([
    can.delegation || can.recovery
      ? adminFetch<PermissionOptions>(`/admin/v1/users/${encodeURIComponent(id)}/permission-options`, { cache: "no-store" }).catch(() => "unavailable" as const)
      : null,
    can.changeRole || can.changeScope
      ? adminFetch<AdminRole[]>("/admin/v1/users/meta/roles", { next: { revalidate: 3600 } }).catch(() => [])
      : [],
  ])

  // Offered roles are the ones the backend accepts at the target's CURRENT scope.
  const tier  = user.scopes?.[0]?.scopeType
  const roles = allRoles.filter((r) => r.assignable !== false && (!tier || (r.allowedScopes ?? []).includes(tier)))
  const name  = [user.firstName, user.lastName].join(" ")
  const message = notice(user)

  return (
    <div className="page-content animate-slide-up">
      <BackToUsers />

      <AccountHeader
        user={user}
        actions={
          <>
            {can.manageAvailability && (
              <SetAvailabilityForm
                userId={id}
                availability={user.reviewAvailability}
                unavailableFrom={user.unavailableFrom}
                unavailableUntil={user.unavailableUntil}
                unavailableReason={user.unavailableReason}
              />
            )}
            <AccountActions userId={id} targetName={name} status={user.status} capabilities={can} />
          </>
        }
      />

      {message && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          {message}
        </p>
      )}

      <AccountDetails
        user={user}
        roleControl={can.changeRole && (
          <UpdateRoleForm userId={id} roles={roles} currentRoleId={user.roleId} currentRoleName={user.role?.displayName ?? "—"} />
        )}
        scopeControl={can.changeScope && (
          <UpdateScopesForm
            userId={id}
            currentScopes={user.scopes}
            isGlobalActor={session.scope.isGlobal}
            actorCountries={session.scope.countryIds}
            allowedTiers={allRoles.find((r) => r.id === user.roleId)?.allowedScopes}
          />
        )}
      />

      <PermissionsPanel user={user} options={options} />
    </div>
  )
}

import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { ArrowLeft } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { adminFetch, ApiCallError } from "@/lib/api"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { UserDetailActions } from "@/components/identity/UserDetailsActions"
import { UpdatePermissionsForm } from "@/components/identity/UpdatePermissionsForm"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminUserDetail }  from "@/types"

export const metadata: Metadata = { title: "User Details" }

interface Props { params: Promise<{ id: string }> }

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_PROFILES_READ)) {
    redirect("/identity")
  }

  let user: AdminUserDetail
  try {
    user = await adminFetch<AdminUserDetail>(`/admin/v1/users/${id}`, {
      next: { revalidate: 60, tags: [`admin-user-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // Pending/invited users belong on the review page
  if (user.status === "pending" || user.status === "invited") {
    redirect(`/identity/${id}/review`)
  }

  const canInvite    = session.permissions.includes(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND)
  const canEditPerms = session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE)
  const canManage    = session.permissions.includes(AdminPermissions.ADMIN_USERS_ACCOUNTS_SUSPEND)
  const currentKeys  = user.permissions?.map((p: any) => p.permission.key) ?? []

  const displayName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  const initials    = [user.firstName[0], user.lastName[0]].join("").toUpperCase()

  return (
    <div className="page-content animate-slide-up">

      <Button asChild variant="ghost" size="sm" className="-ml-1">
        <Link href="/identity"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
      </Button>

      {/* Identity card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{displayName}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.employeeId && (
              <p className="font-mono text-xs text-muted-foreground">ID: {user.employeeId}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <UserStatusBadge status={user.status} />
              {user.role && <span className="badge-neutral">{user.role.displayName}</span>}
            </div>
          </div>
        </div>
        <UserDetailActions
          userId={id}
          userStatus={user.status}
          canInvite={canInvite}
          canManage={canManage}
        />
      </div>

      {/* Metadata grid */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Invited by",   value: user.invitedBy
              ? [user.invitedBy.firstName, user.invitedBy.lastName].join(" ")
              : "System" },
          { label: "Created",      value: new Date(user.createdAt).toLocaleDateString() },
          { label: "Last active",  value: user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleDateString() : "Never" },
          { label: "Employee ID",  value: user.employeeId ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Scope */}
      {user.scopes && user.scopes.length > 0 && (
        <div className="admin-card space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Geographic Scope</h2>
          <div className="flex flex-wrap gap-2">
            {(user.scopes as any[]).map((s: any) => (
              <span key={s.id} className="badge-info">
                {s.scopeType === "GLOBAL" ? "🌍 Global"
                  : s.scopeType === "COUNTRY" ? (s.country?.name ?? s.countryId)
                  : `${s.city?.name ?? s.cityId}, ${s.country?.name ?? ""}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Permissions */}
      {canEditPerms && user.role && user.roleId && (
        <div className="admin-card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
            <p className="text-xs text-muted-foreground">
              Grants within <strong>{user.role.displayName}</strong>'s pool.
            </p>
          </div>
          <UpdatePermissionsForm
            userId={id}
            roleId={user.roleId}
            currentKeys={currentKeys}
          />
        </div>
      )}

    </div>
  )
}
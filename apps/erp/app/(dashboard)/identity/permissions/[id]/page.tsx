import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/shared/BackButton"
import { redirect, notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { PermissionEditor } from "@/components/identity/permissions/PermissionEditor"
import { SetupStatusNote } from "@/components/identity/setup/SetupStatusNote"
import type { PermissionOptions } from "@/types"

export const metadata: Metadata = { title: "Manage Permissions" }

interface Props { params: Promise<{ id: string }> }

/*
 * One administrator's permissions. Everything offered — whether ordinary
 * delegation and/or recovery applies, and which keys each may move — comes
 * from GET /users/:id/permission-options, computed by the rules the save
 * runs. A target this admin may not assign to (or see) is a 404.
 */
export default async function ManagePermissionsPage({ params }: Props) {
  const { id } = await params
  const session = await getAdminSession()
  if (
    !session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE) &&
    !session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)
  ) {
    redirect("/overview")
  }

  let options: PermissionOptions
  try {
    options = await adminFetch<PermissionOptions>(`/admin/v1/users/${encodeURIComponent(id)}/permission-options`, {
      cache: "no-store",
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const { target } = options
  const canReadDirectory = session.permissions.includes(AdminPermissions.ADMIN_USERS_PROFILES_READ)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href="/identity/permissions">Permissions</BackButton>

      <div className="admin-card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{target.firstName} {target.lastName}</h1>
          <p className="text-sm text-muted-foreground">{target.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UserStatusBadge status={target.status} />
            {target.role && <span className="badge-neutral">{target.role.displayName}</span>}
            {target.scopeLabel && <span className="badge-info">{target.scopeLabel}</span>}
          </div>
          {(target.status === "pending" || target.status === "invited") && (
            <p className="mt-2 text-xs text-muted-foreground">
              Not active yet: permissions assigned now take effect once they accept the invitation.
            </p>
          )}
          {target.status === "suspended" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Suspended: their permissions are frozen and take effect again if they are reinstated.
            </p>
          )}
        </div>
        {canReadDirectory && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/identity/${target.id}`}>Account details</Link>
          </Button>
        )}
      </div>

      <SetupStatusNote setup={options.setup} />

      <section className="admin-card">
        <PermissionEditor key={options.grants.join(",")} options={options} />
      </section>
    </div>
  )
}

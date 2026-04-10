import type { Metadata }     from "next"
import { redirect, notFound } from "next/navigation"
import { revalidateTag }      from "next/cache"
import { auth }               from "@clerk/nextjs/server"
import Link                   from "next/link"
import { ArrowLeft, Mail }    from "lucide-react"
import { Button }             from "@repo/ui/components/button"
import { adminFetch }         from "@/lib/api"
import { UserStatusBadge }    from "@/components/identity/UserStatusBadge"
import { ApiCallError }       from "@/lib/api"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions }   from "@repo/types/admin-app"
import type { AdminUserDetail, AdminRole } from "@/types"
import { PermissionPicker }   from "@/components/identity/PermissionPicker"

export const metadata: Metadata = { title: "User Details" }

interface Props { params: Promise<{ id: string }> }

export default async function UserDetailPage({ params }: Props) {
  const { id }               = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_READ)) {
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

  const roles            = await adminFetch<AdminRole[]>("/admin/v1/users/meta/roles", { next: { revalidate: 3600 } })
  const canInvite        = session.permissions.includes(AdminPermissions.ADMIN_USERS_INVITE)
  const canEditPerms     = session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS)
  const canManage        = session.permissions.includes(AdminPermissions.ADMIN_USERS_DEACTIVATE)
  const currentPermKeys  = user.permissions?.map((p: any) => p.permission.key) ?? []

  // ── Server actions ──────────────────────────────────────────────────────

  async function sendInvite() {
    "use server"
    const { getToken } = await auth()
    const t            = await getToken()
    await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/invite`, {
      method : "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    })
    revalidateTag(`admin-user-${id}`)
    revalidateTag("admin-users")
  }

  async function updatePermissions(formData: FormData) {
    "use server"
    const { getToken }   = await auth()
    const t              = await getToken()
    const permissionKeys = formData.getAll("permissions") as string[]
    await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/permissions`, {
      method : "PUT",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body   : JSON.stringify({ permissionKeys }),
    })
    revalidateTag(`admin-user-${id}`)
  }

  async function suspendUser(formData: FormData) {
    "use server"
    const { getToken } = await auth()
    const t            = await getToken()
    const reason       = formData.get("reason") as string
    await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/suspend`, {
      method : "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body   : JSON.stringify({ reason }),
    })
    revalidateTag(`admin-user-${id}`)
    revalidateTag("admin-users")
  }

  async function reinstateUser() {
    "use server"
    const { getToken } = await auth()
    const t            = await getToken()
    await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users/${id}/reinstate`, {
      method : "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    })
    revalidateTag(`admin-user-${id}`)
    revalidateTag("admin-users")
  }

  return (
    <div className="page-content animate-slide-up">

      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-1">
          <Link href="/identity"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
        </Button>
      </div>

      {/* Identity card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {user.fullName.split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{user.fullName}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <UserStatusBadge status={user.status} />
              {user.role && (
                <span className="badge-neutral">{user.role.displayName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Primary action */}
        <div className="flex flex-wrap gap-2">
          {canInvite && (user.status === "pending" || user.status === "invited") && (
            <form action={sendInvite}>
              <Button type="submit" size="sm" variant="outline">
                <Mail className="mr-2 h-4 w-4" />
                {user.status === "invited" ? "Resend Invite" : "Send Invite"}
              </Button>
            </form>
          )}
          {canManage && user.status === "active" && (
            <form action={suspendUser} className="flex gap-2">
              <input name="reason" placeholder="Suspension reason" required className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <Button type="submit" size="sm" variant="destructive">Suspend</Button>
            </form>
          )}
          {canManage && user.status === "suspended" && (
            <form action={reinstateUser}>
              <Button type="submit" size="sm" variant="outline">Reinstate</Button>
            </form>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Invited by",  value: (user.invitedBy as any)?.fullName ?? "System" },
          { label: "Created",     value: new Date(user.createdAt).toLocaleDateString() },
          { label: "Last active", value: user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleDateString() : "Never" },
        ].map(({ label, value }) => (
          <div key={label} className="admin-card">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Permissions */}
      {canEditPerms && user.role && (
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
          <p className="text-xs text-muted-foreground">
            Grants within <strong>{user.role.displayName}</strong>'s pool.
          </p>
          <form action={updatePermissions} className="space-y-4">
            <PermissionPicker
              roleId={user.roleId ?? undefined}
              selectedKeys={currentPermKeys}
            />
            <Button type="submit" size="sm">Save Permissions</Button>
          </form>
        </div>
      )}

    </div>
  )
}
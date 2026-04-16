import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { Plus, Clock, Users, ShieldOff } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { Button } from "@repo/ui/components/button"
import { UsersTableFilters } from "@/components/identity/UsersTableFilters"
import { AdminUsersTable } from "@/components/identity/AdminUsersTable"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ListAdminUsersResult } from "@/types"

export const metadata: Metadata = { title: "Identity & Access" }
export const revalidate = 60

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}

export default async function IdentityPage({ searchParams }: PageProps) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()
  console.log("Session data:", session)
  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_PROFILES_READ)) redirect("/overview")

  const params    = await searchParams
  const page      = params.page   ?? "1"
  const search    = params.search ?? ""
  const status    = params.status ?? ""
  const canCreate = session.permissions.includes(AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE)
  const canInvite = session.permissions.includes(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND)
  const canManage = session.permissions.includes(AdminPermissions.ADMIN_USERS_ACCOUNTS_DEACTIVATE)

  const qs = new URLSearchParams({
    page, pageSize: "20",
    ...(search ? { search } : {}),
    ...(status && status !== "all" ? { status } : {}),
  })

  // Fetch main user list + pending/invited count separately for stats
  const [result, pendingResult, invitedResult] = await Promise.all([
    adminFetch<ListAdminUsersResult>(`/admin/v1/users?${qs}`, {
      next: { revalidate: 60, tags: ["admin-users"] },
    }).catch(() => null),
    adminFetch<ListAdminUsersResult>(`/admin/v1/users?status=pending&pageSize=5`, {
      next: { revalidate: 60, tags: ["admin-users"] },
    }).catch(() => null),
    adminFetch<ListAdminUsersResult>(`/admin/v1/users?status=invited&pageSize=5`, {
      next: { revalidate: 60, tags: ["admin-users"] },
    }).catch(() => null),
  ])

  return (
    <div className="page-content animate-slide-up">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-muted-foreground/60">
            Administration
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Identity & Access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage admin users, roles, and permissions.
          </p>
        </div>
        {canCreate && (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/identity/new">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Link>
          </Button>
        )}
      </div>

      {/* Stats row + awaiting action */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-card flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{result?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total users</p>
          </div>
        </div>

        <Link href="/identity?status=pending" className="admin-card flex items-center gap-3 hover:border-primary/40 transition-colors group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 dark:bg-info/15">
            <Clock className="h-5 w-5 text-info" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground group-hover:text-primary transition-colors">
              {pendingResult?.total ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Pending invitation</p>
          </div>
        </Link>

        <Link href="/identity?status=invited" className="admin-card flex items-center gap-3 hover:border-primary/40 transition-colors group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 dark:bg-warning/15">
            <ShieldOff className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground group-hover:text-primary transition-colors">
              {invitedResult?.total ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Awaiting acceptance</p>
          </div>
        </Link>
      </div>

      {/* Filters */}
      <UsersTableFilters defaultSearch={search} defaultStatus={status} />

      {/* Table — separate component */}
      <AdminUsersTable
        result={result}
        page={page}
        search={search}
        status={status}
        canInvite={canInvite}
        canManage={canManage}
      />
    </div>
  )
}
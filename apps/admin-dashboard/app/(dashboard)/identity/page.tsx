import type { Metadata }      from "next"
import { redirect }           from "next/navigation"
import Link                   from "next/link"
import { auth }               from "@clerk/nextjs/server"
import { Plus, Search }       from "lucide-react"
import { adminFetch }         from "@/lib/api"
import { Button }             from "@repo/ui/components/button"
import { Input }              from "@repo/ui/components/input"
import { UserStatusBadge }    from "@/components/identity/UserStatusBadge"
import { UserActionsMenu }    from "@/components/identity/UserActionsMenu"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions }   from "@repo/types/admin-app"
import type { ListAdminUsersResult } from "@/types"

export const metadata: Metadata = { title: "Identity & Access" }

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}

/**
 * Identity & Access page — server-rendered list of admin users.
 *
 * Permission gate: requires ADMIN_USERS_READ.
 * Create button: only shown if ADMIN_USERS_CREATE is held.
 *
 * No client-side fetching — data is fetched server-side at render time.
 * Search and pagination use URL search params → full page navigation (SSR).
 */
export default async function IdentityPage({ searchParams }: PageProps) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  // Get session to check permissions (deduped with layout fetch)
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  // Permission gate — if no read access, redirect to overview
  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_READ)) {
    redirect("/overview")
  }

  const params    = await searchParams
  const page      = params.page   ?? "1"
  const search    = params.search ?? ""
  const status    = params.status ?? ""
  const canCreate = session.permissions.includes(AdminPermissions.ADMIN_USERS_CREATE)
  const canInvite = session.permissions.includes(AdminPermissions.ADMIN_USERS_INVITE)
  const canManage = session.permissions.includes(AdminPermissions.ADMIN_USERS_DEACTIVATE)

  // Fetch users — scoped by backend based on actor's scope
  const qs = new URLSearchParams({
    page,
    pageSize: "20",
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  })

  let result: ListAdminUsersResult | null = null
  try {
    result = await adminFetch<ListAdminUsersResult>(`/admin/v1/users?${qs}`, {
      next: { revalidate: 60, tags: ["admin-users"] },
    })
  } catch {
    result = null
  }

  return (
    <div className="page-content animate-slide-up">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/60 mb-1">
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

      {/* Filters */}
      <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="invited">Invited</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">Filter</Button>
        {(search || status) && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/identity">Clear</Link>
          </Button>
        )}
      </form>

      {/* Table */}
      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Joined</th>
                {(canInvite || canManage) && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {!result || result.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                result.users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link href={`/identity/${user.id}`} className="group">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {user.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {user.role?.displayName ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={user.status} />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    {(canInvite || canManage) && (
                      <td className="px-4 py-3 text-right">
                        <UserActionsMenu
                          user={user}
                          canInvite={canInvite}
                          canManage={canManage}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {result.total} user{result.total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              {parseInt(page) > 1 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/identity?page=${parseInt(page) - 1}&search=${search}&status=${status}`}>
                    Previous
                  </Link>
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Page {page} of {result.totalPages}
              </span>
              {parseInt(page) < result.totalPages && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/identity?page=${parseInt(page) + 1}&search=${search}&status=${status}`}>
                    Next
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
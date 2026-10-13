import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { KeyRound, LifeBuoy, Users } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import type { ListDelegableAdminsResult } from "@/types"

export const metadata: Metadata = { title: "Permissions" }

interface Props { searchParams: Promise<{ search?: string; mode?: string; page?: string }> }

/*
 * The SHARED permission workflow: identity admins and department leads both
 * land here. The list is the backend's answer to "whom may I assign
 * permissions to?" (GET /users/delegable) — computed by the same rules the
 * write runs, so it never offers someone the save would refuse. A lead sees
 * only their own department in their scope; nothing here needs directory
 * access (admin_users:profiles:read).
 */
export default async function PermissionsPage({ searchParams }: Props) {
  const session = await getAdminSession()
  const canDelegate = session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE)
  const canRecover  = session.permissions.includes(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)
  if (!canDelegate && !canRecover) redirect("/overview")

  const { search = "", mode = "all", page = "1" } = await searchParams
  const qs = new URLSearchParams({ page, pageSize: "20", ...(search ? { search } : {}), ...(mode !== "all" ? { mode } : {}) })

  let result: ListDelegableAdminsResult | null = null
  let failed = false
  try {
    result = await adminFetch<ListDelegableAdminsResult>(`/admin/v1/users/delegable?${qs}`, {
      next: { revalidate: 30, tags: ["admin-delegable"] },
    })
  } catch {
    failed = true
  }

  const filtered = !!search || mode !== "all"

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Permissions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {canDelegate && "Grant or remove the permissions you hold for colleagues in your department and scope."}
            {canDelegate && canRecover && " "}
            {canRecover && "Recovery lets you set up or restore another department's permissions, held or not."}
          </p>
        </div>
      </div>

      {canDelegate && canRecover && (
        <TableFilterBar
          searchPlaceholder="Search name or email…"
          defaultSearch={search}
          extraFilters={[{
            name        : "mode",
            label       : "Authority",
            allLabel    : "Any",
            defaultValue: mode,
            options     : [
              { value: "delegation", label: "Ordinary delegation" },
              { value: "recovery",   label: "Recovery" },
            ],
          }]}
        />
      )}
      {!(canDelegate && canRecover) && (
        <TableFilterBar searchPlaceholder="Search name or email…" defaultSearch={search} />
      )}

      {failed ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load the administrators you can assign permissions to. Reload to try again.
        </div>
      ) : !result || result.users.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No one matches these filters" : "No one to assign permissions to"}
          description={filtered
            ? "Clear the search or authority filter to see everyone you can manage."
            : "Nobody in your scope is an administrator whose permissions you can manage."}
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <ul className="divide-y divide-border/60">
            {result.users.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{u.firstName} {u.lastName}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <UserStatusBadge status={u.status} />
                    {u.role && <span className="badge-neutral">{u.role.displayName}</span>}
                    {u.scopeLabel && <span className="badge-info">{u.scopeLabel}</span>}
                    <span className="text-xs text-muted-foreground">{u.grantCount} granted</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {u.delegation && <span className="badge-neutral">Delegation</span>}
                  {u.recovery && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      <LifeBuoy className="h-3 w-3" /> Recovery
                    </span>
                  )}
                  <Link
                    href={`/identity/permissions/${u.id}`}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Manage permissions
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <TablePagination
            total={result.total}
            page={result.page}
            totalPages={result.totalPages}
            basePath="/identity/permissions"
            params={{ ...(search ? { search } : {}), mode }}
            itemLabel="administrators"
          />
        </div>
      )}
    </div>
  )
}

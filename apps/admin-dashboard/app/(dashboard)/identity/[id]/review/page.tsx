import type { Metadata }        from "next"
import { redirect, notFound }   from "next/navigation"
import Link                     from "next/link"
import { auth }                 from "@clerk/nextjs/server"
import { ArrowLeft, Mail, Clock, CheckCircle } from "lucide-react"
import { Button }               from "@repo/ui/components/button"
import { adminFetch, ApiCallError } from "@/lib/api"
import { UserStatusBadge }      from "@/components/identity/UserStatusBadge"
import { SendInviteButton }     from "@/components/identity/SendInviteButton"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions }     from "@repo/types/admin-app"
import type { AdminUserDetail } from "@/types"

export const metadata: Metadata = { title: "Review User" }

interface Props { params: Promise<{ id: string }> }

export default async function UserReviewPage({ params }: Props) {
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

  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_PROFILES_READ)) redirect("/identity")

  let user: AdminUserDetail
  try {
    user = await adminFetch<AdminUserDetail>(`/admin/v1/users/${id}`, {
      next: { revalidate: 30, tags: [`admin-user-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  // Already active/suspended/deactivated → redirect to regular detail page
  if (user.status === "active" || user.status === "suspended" || user.status === "deactivated") {
    redirect(`/identity/${id}`)
  }

  const canInvite = session.permissions.includes(AdminPermissions.ADMIN_USERS_INVITATIONS_SEND)
  const displayName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  const initials    = [user.firstName[0], user.lastName[0]].join("").toUpperCase()

  return (
    <div className="page-content animate-slide-up">

      <Button asChild variant="ghost" size="sm" className="-ml-1">
        <Link href="/identity"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to Users</Link>
      </Button>

      {/* Status banner */}
      <div className={[
        "flex items-start gap-3 rounded-xl border px-5 py-4",
        user.status === "pending"
          ? "border-info/30 bg-info/5"
          : "border-warning/30 bg-warning/5",
      ].join(" ")}>
        {user.status === "pending"
          ? <Clock className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          : <Mail  className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        }
        <div>
          <p className="text-sm font-semibold text-foreground">
            {user.status === "pending"
              ? "Review before sending invitation"
              : "Invitation sent — awaiting acceptance"
            }
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user.status === "pending"
              ? "Verify the user's details, role, and permissions before sending the Clerk invitation."
              : `Invitation sent ${user.invitationSentAt ? new Date(user.invitationSentAt).toLocaleDateString() : "previously"} · ${user.invitationSentCount} sent total. You can resend if needed.`
            }
          </p>
        </div>
      </div>

      {/* Identity card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{displayName}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {(user as any).employeeId && (
              <p className="font-mono text-xs text-muted-foreground">ID: {(user as any).employeeId}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <UserStatusBadge status={user.status} />
              {user.role && <span className="badge-neutral">{user.role.displayName}</span>}
            </div>
          </div>
        </div>

        {canInvite && (
          <SendInviteButton
            userId={id}
            userStatus={user.status}
            roleName={user.role?.displayName ?? ""}
          />
        )}
      </div>

      {/* Details grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Role",        value: user.role?.displayName ?? "—" },
          { label: "Created",     value: new Date(user.createdAt).toLocaleDateString() },
          { label: "Invited by",  value: (user.invitedBy as any)
              ? [(user.invitedBy as any).firstName, (user.invitedBy as any).lastName].join(" ")
              : "System" },
          { label: "Invitations sent", value: String((user as any).invitationSentCount ?? 0) },
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
                  : s.scopeType === "COUNTRY" ? `${s.country?.name ?? s.countryId}`
                  : `${s.city?.name ?? s.cityId}, ${s.country?.name ?? ""}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Permissions */}
      {user.permissions && user.permissions.length > 0 && (
        <div className="admin-card space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Permissions ({user.permissions.length})
          </h2>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {(user.permissions as any[]).map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="font-mono text-xs text-foreground">
                  {p.permission.key.split(":").slice(1).join(":")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
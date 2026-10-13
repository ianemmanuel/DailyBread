import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { KeyRound, MapPinned, UserRound } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { BackButton } from "@/components/shared/BackButton"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { PermissionEditor } from "@/components/identity/permissions/PermissionEditor"
import { SetupStatusNote } from "@/components/identity/setup/SetupStatusNote"
import { EditSection } from "@/components/identity/update/EditSection"
import { ProfileForm } from "@/components/identity/update/ProfileForm"
import { AssignmentForm } from "@/components/identity/update/AssignmentForm"
import { EditStepNav } from "@/components/identity/update/EditStepNav"
import { scopeLabel } from "@/lib/identity/format"
import type { AdminRole, AdminUserDetail, PermissionOptions } from "@/types"

export const metadata: Metadata = { title: "Edit administrator" }

interface Props { params: Promise<{ id: string }> }

async function loadUser(id: string): Promise<AdminUserDetail> {
  try {
    // Uncached: the forms send this version back, so it must be the latest.
    return await adminFetch<AdminUserDetail>(`/admin/v1/users/${encodeURIComponent(id)}`, { cache: "no-store" })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }
}

/*
 * Edit one administrator: profile, role + scope, permissions — each part
 * saved on its own, because each is its own authority and its own audit
 * record. What appears comes from the server's capabilities for this viewer;
 * the backend re-checks every save.
 */
export default async function EditAdminUserPage({ params }: Props) {
  const { id } = await params
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_PROFILES_READ)) redirect(`/identity/${encodeURIComponent(id)}`)

  const user = await loadUser(id)
  const can  = user.capabilities
  if (!can.editProfile && !can.changeRole) redirect(`/identity/${encodeURIComponent(id)}`)

  const [roles, options] = await Promise.all([
    can.changeRole
      ? adminFetch<AdminRole[]>("/admin/v1/users/meta/roles", { next: { revalidate: 3600 } }).then((r) => r.filter((x) => x.assignable !== false)).catch(() => null)
      : null,
    can.delegation || can.recovery
      ? adminFetch<PermissionOptions>(`/admin/v1/users/${encodeURIComponent(id)}/permission-options`, { cache: "no-store" }).catch(() => "unavailable" as const)
      : null,
  ])

  const name  = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  const scope = user.scopes[0]
  const steps = [
    can.editProfile && { id: "profile", label: "Profile" },
    can.changeRole && { id: "assignment", label: "Role & scope" },
    { id: "permissions", label: "Permissions" },
  ].filter((s): s is { id: string; label: string } => !!s)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/identity/${encodeURIComponent(id)}`}>Back to account</BackButton>

      <header className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-5 shadow-xs">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-linear-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground ring-4 ring-primary/15">
              {`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/70">Edit administrator</p>
              <h1 className="truncate font-display text-xl font-semibold text-foreground">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <UserStatusBadge status={user.status} />
                {user.role && <span className="badge-neutral">{user.role.displayName}</span>}
                <span className="badge-info">{scopeLabel(user.scopes)}</span>
              </div>
            </div>
          </div>
          <EditStepNav steps={steps} />
        </div>
      </header>

      {can.editProfile && (
        <EditSection id="profile" step={1} icon={UserRound} tone="primary" title="Profile" description="Name and employee ID. The email is fixed.">
          <ProfileForm
            key={user.updatedAt}
            userId={user.id}
            email={user.email}
            updatedAt={user.updatedAt}
            initial={{ firstName: user.firstName, middleName: user.middleName ?? "", lastName: user.lastName, employeeId: user.employeeId ?? "" }}
          />
        </EditSection>
      )}

      {can.changeRole && (
        <EditSection
          id="assignment"
          step={steps.findIndex((s) => s.id === "assignment") + 1}
          icon={MapPinned}
          tone="warning"
          title="Role & scope"
          description="What this person may be given, and where they work. Changing either clears their permissions."
        >
          {roles ? (
            <AssignmentForm
              key={user.updatedAt}
              userId={user.id}
              roles={roles}
              currentRoleId={user.roleId}
              currentScope={scope ? { scopeType: scope.scopeType, countryId: scope.countryId ?? undefined, cityId: scope.cityId ?? undefined } : null}
              currentLabels={{ role: user.role?.displayName ?? "No role", scope: scopeLabel(user.scopes) }}
              grantCount={user.permissions.length}
              isGlobalActor={session.scope.isGlobal}
              actorCountries={session.scope.countryIds}
              updatedAt={user.updatedAt}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">The roles could not be loaded. Reload the page to try again.</p>
          )}
        </EditSection>
      )}

      <EditSection
        id="permissions"
        step={steps.length}
        icon={KeyRound}
        tone="info"
        title="Permissions"
        description={user.role ? `Granted from the ${user.role.displayName} role. Set the role and scope first — changing them clears these.` : "Assign a role first."}
      >
        <div className="space-y-4">
          <SetupStatusNote setup={user.permissionSetup} />
          {options === "unavailable" ? (
            <p role="alert" className="text-sm text-destructive">The permission editor could not be loaded. Reload the page to try again.</p>
          ) : options ? (
            <PermissionEditor key={options.grants.join(",")} options={options} scrollClassName="max-h-[60dvh]" />
          ) : (
            <p className="text-sm text-muted-foreground">
              You can&apos;t change this account&apos;s permissions. {user.permissions.length} permission{user.permissions.length === 1 ? " is" : "s are"} granted;
              a lead in their department assigns them.
            </p>
          )}
        </div>
      </EditSection>
    </div>
  )
}

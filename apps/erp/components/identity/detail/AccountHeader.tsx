import type { ReactNode } from "react"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { AvailabilityBadge } from "@/components/identity/AvailabilityBadge"
import { scopeLabel } from "@/lib/identity/format"
import type { AdminUserDetail } from "@/types"

export function AccountHeader({ user, actions }: { user: AdminUserDetail; actions?: ReactNode }) {
  const name     = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold text-foreground">
            {name}
            {user.isSelf && <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">(you)</span>}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <UserStatusBadge status={user.status} size="md" />
            {user.role && <span className="badge-neutral">{user.role.displayName}</span>}
            <span className="badge-info">{scopeLabel(user.scopes)}</span>
            {(user.status === "active" || user.status === "suspended") && (
              <AvailabilityBadge availability={user.reviewAvailability} unavailableUntil={user.unavailableUntil} />
            )}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

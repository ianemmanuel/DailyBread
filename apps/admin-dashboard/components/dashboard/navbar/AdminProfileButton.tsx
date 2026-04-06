"use client"

import { UserButton }        from "@clerk/nextjs"
import { useAdminSession }   from "../layout/AdminSessionContext"

/**
 * AdminProfileButton
 *
 * Clerk's UserButton (handles sign-out, profile management).
 * Shows the admin's role and scope as a context pill next to the avatar.
 * The pill is informational — full details are in the sidebar card.
 */
export function AdminProfileButton() {
  const { role, scope } = useAdminSession()

  const scopeLabel = scope.isGlobal
    ? "Global"
    : scope.countryIds.length > 0
      ? `${scope.countryIds.length} countr${scope.countryIds.length > 1 ? "ies" : "y"}`
      : "Limited"

  return (
    <div className="flex items-center gap-2">
      {/* Role + scope pill — desktop only */}
      {role && (
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-xs font-medium text-foreground leading-none">
            {role.displayName}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground leading-none">
            {scopeLabel}
          </span>
        </div>
      )}

      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-8 w-8 ring-2 ring-border hover:ring-primary transition-all",
          },
        }}
      />
    </div>
  )
}
"use client"

import { UserButton }      from "@clerk/nextjs"
import { useAdminSession } from "../layout/AdminSessionContext"

/**
 * AdminProfileButton — Clerk UserButton with role/scope context pill.
 * Uses CSS variables so it looks correct in both light and dark.
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
      {role && (
        <div className="hidden flex-col items-end sm:flex">
          <span
            className="text-xs font-medium leading-none"
            style={{ color: "var(--foreground)" }}
          >
            {role.displayName}
          </span>
          <span
            className="mt-0.5 text-[10px] leading-none"
            style={{ color: "var(--muted-foreground)" }}
          >
            {scopeLabel}
          </span>
        </div>
      )}
      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-8 w-8 ring-2 ring-border hover:ring-primary transition-all duration-150",
          },
        }}
      />
    </div>
  )
}
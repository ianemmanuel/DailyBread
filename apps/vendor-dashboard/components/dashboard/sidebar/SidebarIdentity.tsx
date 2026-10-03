'use client'

import { useVendorNav } from '@/components/dashboard/VendorNavContext'

/*
 * Who is signed in, from the session. This card used to show a hard-coded
 * "Wanjiku's Kitchen" to every vendor — another business's name in your own
 * dashboard (principle 11). It renders nothing rather than inventing one.
 */
export function SidebarIdentity() {
  const { identity } = useVendorNav()
  const name = identity.businessName ?? identity.email
  if (!name) return null

  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

  return (
    <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2.5">
      <div aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground" title={name}>{name}</p>
        {identity.businessName && identity.email && (
          <p className="truncate text-xs text-muted-foreground" title={identity.email}>{identity.email}</p>
        )}
      </div>
    </div>
  )
}

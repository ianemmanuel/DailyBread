'use client'

import { useVendorNav } from '@/components/dashboard/VendorNavContext'
import { cn } from '@/lib/utils'

/*
 * Who is signed in, from the session. This card used to show a hard-coded
 * "Wanjiku's Kitchen" to every vendor — another business's name in your own
 * dashboard (principle 11). It renders nothing rather than inventing one.
 *
 * `compact` (the collapsed rail) keeps only the initials; the full name stays
 * available as the element's accessible name and native title.
 */
export function SidebarIdentity({ compact = false }: { compact?: boolean }) {
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
    <div
      title={compact ? name : undefined}
      className={cn(
        'flex items-center rounded-xl bg-sidebar-accent/70',
        compact ? 'justify-center p-1.5' : 'gap-3 px-3 py-2.5',
      )}
    >
      <div aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {initials}
      </div>
      <div className={compact ? 'sr-only' : 'min-w-0 flex-1'}>
        <p className="truncate text-sm font-semibold text-foreground" title={name}>{name}</p>
        {identity.businessName && identity.email && (
          <p className="truncate text-xs text-muted-foreground" title={identity.email}>{identity.email}</p>
        )}
      </div>
    </div>
  )
}

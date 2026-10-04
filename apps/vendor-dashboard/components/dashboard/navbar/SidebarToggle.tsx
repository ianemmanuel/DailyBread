'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSidebarState } from '@/components/dashboard/sidebar/SidebarState'
import { cn } from '@/lib/utils'

/*
 * Collapses the desktop sidebar to an icon rail and back. Lives in the navbar
 * so it sits in the same place in both states. Desktop only — below `lg` the
 * sidebar is a sheet opened by the burger instead.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebarState()
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      aria-controls="vendor-sidebar"
      className={cn(
        'size-9 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors',
        'hover:bg-secondary hover:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        className,
      )}
    >
      <Icon aria-hidden className="size-[1.125rem]" />
    </button>
  )
}

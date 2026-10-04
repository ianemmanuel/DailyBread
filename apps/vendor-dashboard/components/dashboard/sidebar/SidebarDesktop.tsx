'use client'

import { SidebarNav } from './SidebarNav'
import { SidebarIdentity } from './SidebarIdentity'
import { SIDEBAR_WIDTH, useSidebarState } from './SidebarState'
import { BrandMark } from '@/components/dashboard/brand/BrandMark'
import { cn } from '@/lib/utils'

/*
 * The desktop sidebar (lg and up): full width with group titles, or an icon
 * rail. The toggle lives in the navbar, at the same spot in both states, so
 * the control never moves out from under the pointer. Width comes from
 * SIDEBAR_WIDTH, the same table the content column offsets by.
 */
export function SidebarDesktop() {
  const { collapsed } = useSidebarState()

  return (
    <aside
      id="vendor-sidebar"
      aria-label="Sidebar"
      data-collapsed={collapsed}
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border/60 bg-sidebar lg:flex',
        'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded,
      )}
    >
      {/* Ambient glow behind the brand */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 glow-left opacity-60" />

      <div className={cn(
        'relative flex h-16 shrink-0 items-center border-b border-border/60',
        collapsed ? 'justify-center px-2' : 'px-5',
      )}>
        <BrandMark compact={collapsed} />
      </div>

      <div className="relative min-h-0 flex-1">
        <SidebarNav collapsed={collapsed} />
      </div>

      {/* Who is signed in — from the session, never a placeholder */}
      <div className={cn('relative shrink-0 border-t border-border/60', collapsed ? 'p-2.5' : 'p-3')}>
        <SidebarIdentity compact={collapsed} />
      </div>
    </aside>
  )
}

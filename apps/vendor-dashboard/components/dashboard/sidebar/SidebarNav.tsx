'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navGroupsFor, activeNavHref, type NavGroup } from '@/utils/constants/nav-links'
import { useVendorNav } from '@/components/dashboard/VendorNavContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/*
 * The vendor navigation: titled groups that open and close, each link with
 * its icon, and exactly one link marked current.
 *
 * Structure borrowed from the ERP sidebar (section headers as disclosure
 * buttons, icon rail with tooltips when collapsed); the look stays the vendor
 * app's own — warm surfaces, the `sidebar-item` classes, a soft brand tint on
 * the current link.
 *
 * Accessibility:
 *   - each group header is a real <button> with aria-expanded/aria-controls;
 *   - a CLOSED group is `inert`, so its links leave the tab order and the
 *     accessibility tree (a max-height animation alone leaves invisible links
 *     focusable — the ERP's version has that gap);
 *   - the current link carries aria-current="page", not just a colour;
 *   - a group holding the current page is opened whenever the route lands in
 *     it, so the current link is never hidden.
 *
 * COLLAPSED (desktop icon rail): every link stays rendered and reachable —
 * group disclosure is suspended, because a closed group would hide icons the
 * rail has room for. Group titles become a hairline divider (and stay in the
 * tree for screen readers); each link keeps its label as visually-hidden text
 * and shows it in a tooltip on hover AND keyboard focus.
 *
 * The Tooltip wrappers render in BOTH states (forced closed when expanded), so
 * collapsing never changes the shape of the tree — Radix ids stay stable
 * whatever the server rendered (bug class #12).
 */
export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const { sellingReady } = useVendorNav()
  const pathname = usePathname()
  const groups = navGroupsFor(sellingReady)
  const current = activeNavHref(pathname, groups.flatMap((g) => g.links.map((l) => l.href)))

  const [closed, setClosed] = useState<Record<string, boolean>>({})

  return (
    <TooltipProvider delayDuration={150}>
      <nav aria-label="Main" className={cn('h-full overflow-y-auto overflow-x-hidden py-4', collapsed ? 'px-2.5' : 'px-3')}>
        <div className={cn('flex flex-col', collapsed ? 'gap-2' : 'gap-4')}>
          {groups.map((group) => (
            <NavSection
              key={group.id}
              group={group}
              current={current}
              collapsed={collapsed}
              // The group holding the current page always shows it; the icon
              // rail shows everything.
              open={collapsed || !closed[group.id] || group.links.some((l) => l.href === current)}
              onToggle={() => setClosed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
            />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  )
}

function NavSection({
  group, current, collapsed, open, onToggle,
}: {
  group    : NavGroup
  current  : string | null
  collapsed: boolean
  open     : boolean
  onToggle : () => void
}) {
  const listId = useId()
  const holdsCurrent = group.links.some((l) => l.href === current)

  return (
    <div>
      {collapsed ? (
        // The title stays for assistive tech; sighted users get a divider.
        <div className="mb-2 px-2">
          <span className="sr-only">{group.title}</span>
          <div aria-hidden className="h-px bg-border/70" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
          className="mb-1 flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className={cn(
            'text-[10px] font-semibold uppercase tracking-widest',
            holdsCurrent ? 'text-primary' : 'text-muted-foreground',
          )}>
            {group.title}
          </span>
          <ChevronDown
            aria-hidden
            className={cn('size-3 text-muted-foreground transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
          />
        </button>
      )}

      <ul
        id={listId}
        inert={!open}
        className={cn(
          'space-y-0.5 overflow-hidden transition-all duration-200 ease-out',
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        {group.links.map((link) => {
          const isActive = link.href === current
          const Icon = link.icon
          return (
            <li key={link.href}>
              <Tooltip open={collapsed ? undefined : false}>
                <TooltipTrigger asChild>
                  <Link
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'sidebar-item relative',
                      collapsed && 'justify-center px-0',
                      isActive && 'sidebar-item-active',
                    )}
                  >
                    {isActive && (
                      <span aria-hidden className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                    )}
                    <Icon
                      aria-hidden
                      className={cn('size-4 shrink-0 transition-colors duration-200', isActive ? 'text-primary' : 'text-muted-foreground/70')}
                    />
                    <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>{link.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="text-xs font-medium">
                  {link.label}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

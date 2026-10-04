'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from './sidebar-cookie'

/*
 * Whether the DESKTOP sidebar is collapsed to icons.
 *
 * A COOKIE, read by the server layout — not localStorage. The same reasoning
 * as the ERP's sidebar-provider (recurring bug class #12): the collapsed
 * state changes what renders, so the server must render the tree the client
 * will hydrate, or every generated id after the sidebar shifts and the
 * sidebar flashes at full width on each load.
 *
 * Phones never collapse: below `lg` the sidebar is a sheet, and this flag only
 * changes `lg:` classes.
 */
interface SidebarState {
  collapsed: boolean
  toggle   : () => void
}

const SidebarStateContext = createContext<SidebarState>({ collapsed: false, toggle: () => {} })

export function SidebarStateProvider({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean
  children        : React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`
      } catch {
        /* Cookies disabled — the preference simply will not persist. */
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle])
  return <SidebarStateContext.Provider value={value}>{children}</SidebarStateContext.Provider>
}

export function useSidebarState() {
  return useContext(SidebarStateContext)
}

/** Desktop widths, shared by the sidebar and the content offset so the two
 *  can never disagree (no overlap, no gap). */
export const SIDEBAR_WIDTH = { expanded: 'lg:w-64', collapsed: 'lg:w-[4.5rem]' } as const
const INSET_OFFSET = { expanded: 'lg:pl-64', collapsed: 'lg:pl-[4.5rem]' } as const

/**
 * The column beside the sidebar. Offsets itself by the sidebar's CURRENT width
 * so the page reflows with it instead of sliding underneath.
 *
 * `overflow-x-clip`, not `hidden`: `hidden` makes this a scroll container and
 * would quietly break the sticky navbar inside it.
 */
export function SidebarInset({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarState()
  return (
    <div
      className={cn(
        'flex min-h-screen min-w-0 flex-col overflow-x-clip transition-[padding] duration-200 ease-out motion-reduce:transition-none',
        collapsed ? INSET_OFFSET.collapsed : INSET_OFFSET.expanded,
      )}
    >
      {children}
    </div>
  )
}

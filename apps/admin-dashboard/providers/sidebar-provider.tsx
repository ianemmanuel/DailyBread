"use client"

import { useEffect, useState } from "react"
import { SidebarContext } from "@/contexts/sidebar-context"

export const SIDEBAR_COOKIE = "db-admin-sidebar-collapsed"
const WIDTH_EXPANDED = "240px"
const WIDTH_COLLAPSED = "72px"
/** A year. The preference is a convenience, not a session. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function applyOffset(collapsed: boolean) {
  const isDesktop = window.matchMedia("(min-width: 1024px)").matches
  document.documentElement.style.setProperty(
    "--_sidebar-offset",
    isDesktop ? (collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED) : "0px",
  )
}

/*
 * A COOKIE, NOT localStorage — and the difference is a correctness one.
 *
 * The collapsed state changes the SHAPE of the rendered tree, not just its
 * styling: `SidebarNav` renders a <Popover> and a <Tooltip> per section when
 * collapsed and neither when expanded, and both call Radix's `useId`.
 *
 * With localStorage the server cannot know the preference, so it always
 * rendered the expanded tree while the client switched to the collapsed one
 * immediately after mount. React's generated ids are derived from a
 * component's position in the tree, so every id after the sidebar shifted —
 * surfacing as `aria-controls` mismatching on the mobile sheet's trigger,
 * a component that has nothing to do with the sidebar's width. That is React's
 * "external changing data without sending a snapshot of it along with the
 * HTML", and it is not suppressible: React discards and re-renders the subtree.
 *
 * A cookie travels WITH the request, so the server renders the same tree the
 * client will. It also removes a real visual bug: a collapsed sidebar used to
 * flash fully expanded on every page load before the effect ran.
 *
 * Deliberately not httpOnly — the browser writes it — and it holds nothing
 * sensitive. `SameSite=Lax` because there is no reason for it to travel
 * cross-site. The ERP is entirely dynamic (`ƒ`) already, so reading a cookie
 * in the layout costs no route classification.
 */
export function SidebarProvider({
  initialCollapsed,
  children,
}: {
  /** Read from the cookie by the server layout, so the first client render
   *  agrees with the HTML. */
  initialCollapsed: boolean
  children: React.ReactNode
}) {
  const [collapsed, setCollapsedState] = useState(initialCollapsed)

  /* No localStorage read on mount any more: the value arrived with the HTML,
   * so there is nothing to catch up on and nothing to re-render. */
  useEffect(() => {
    applyOffset(collapsed)
  }, [collapsed])

  // Re-evaluate on viewport resize (mobile <-> desktop)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const handler = () => applyOffset(collapsed)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [collapsed])

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v)
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${v}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
    } catch {
      /* Cookies disabled — the preference simply will not persist. */
    }
  }

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        toggle: () => setCollapsed(!collapsed),
        setCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

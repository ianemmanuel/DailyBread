"use client"

import { useEffect, useState } from "react"
import { SidebarContext } from "@/contexts/sidebar-context"

const STORAGE_KEY      = "db-admin-sidebar-collapsed"
const WIDTH_EXPANDED   = "240px"
const WIDTH_COLLAPSED  = "72px"

function applyOffset(collapsed: boolean) {
  const isDesktop = window.matchMedia("(min-width: 1024px)").matches
  document.documentElement.style.setProperty(
    "--_sidebar-offset",
    isDesktop ? (collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED) : "0px"
  )
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === "undefined") return false
    try { return localStorage.getItem(STORAGE_KEY) === "true" } catch { return false }
  })

  // Write CSS var whenever collapsed changes
  useEffect(() => {
    applyOffset(collapsed)
  }, [collapsed])

  // Re-evaluate on viewport resize (mobile ↔ desktop)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const handler = () => applyOffset(collapsed)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [collapsed])

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v)
    try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* ignore */ }
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
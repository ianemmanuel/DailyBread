import { SidebarDesktop } from "./SidebarDesktop"
import { MobileSidebar } from "./MobileSidebar"
import type { AdminSessionData } from "@repo/types/admin-app"

interface SidebarProps {
  session: AdminSessionData
}

/**
 * Sidebar — renders the desktop sidebar + the mobile Sheet trigger.
 * Both live here so the burger button is logically part of navigation,
 * not the topbar. The Sheet is uncontrolled (no useState) — Radix
 * manages open/close state internally via its context.
 */
export function Sidebar({ session }: SidebarProps) {
  return (
    <>
      <SidebarDesktop session={session} />
      <MobileSidebar session={session} />
    </>
  )
}
import { SidebarDesktop } from "./SidebarDesktop"
import type { AdminSessionData } from "@repo/types/admin-app"

interface SidebarProps {
  session: AdminSessionData
}

/**
 * Sidebar — desktop only.
 *
 * MobileSidebar (Sheet + trigger) is rendered inside Navbar so the
 * SheetTrigger and SheetContent share the same Radix Sheet context.
 * Splitting them across the component tree breaks the trigger entirely.
 */
export function Sidebar({ session }: SidebarProps) {
  return <SidebarDesktop session={session} />
}
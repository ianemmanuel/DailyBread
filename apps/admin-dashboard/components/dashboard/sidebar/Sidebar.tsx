import { SidebarDesktop } from "./SidebarDesktop"
import type { AdminSessionData } from "@repo/types/admin-app"

interface SidebarProps {
  session: AdminSessionData
}

export function Sidebar({ session }: SidebarProps) {
  return <SidebarDesktop session={session} />
}
// components/dashboard/sidebar/Sidebar.tsx
import { SidebarDesktop } from "./SidebarDesktop"
import { MobileSidebar }  from "./MobileSidebar"

export function Sidebar() {
  return (
    <>
      <SidebarDesktop />
      <MobileSidebar />
    </>
  )
}